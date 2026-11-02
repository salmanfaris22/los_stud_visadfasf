package service

import (
	"context"
	"sort"
	"time"

	"github.com/google/uuid"

	"github.com/lms/backend/internal/apperr"
	"github.com/lms/backend/internal/auth"
	"github.com/lms/backend/internal/dto"
	"github.com/lms/backend/internal/repository"
)

// PortalService builds the student-facing pages: dashboard, my courses, the YouTube-style
// watch page and the task pages.
type PortalService struct {
	base
	submissions   *SubmissionService
	live          *LiveService
	announcements *AnnouncementService
	certificates  *CertificateService
	quizzes       *QuizService
}

func (s *PortalService) Courses(ctx context.Context, student *auth.Principal) ([]dto.MyCourse, error) {
	rows, err := s.Q.MyEnrollments(ctx, student.ID)
	if err != nil {
		return nil, dbErr(err, "courses")
	}
	out := make([]dto.MyCourse, 0, len(rows))
	for _, r := range rows {
		out = append(out, dto.MyCourse{EnrollmentID: r.EnrollmentID, CourseID: r.ID, Slug: r.Slug, Title: r.Title, Subtitle: r.Subtitle, ThumbnailURL: r.ThumbnailUrl,
			Level: r.Level, Category: r.Category, BatchID: r.BatchID, BatchName: str(r.BatchName), Status: r.EnrollmentStatus, EnrolledAt: r.EnrolledAt,
			VideoCount: r.VideoCount, TotalTasks: r.TotalTasks, ApprovedTasks: r.ApprovedTasks, ProgressPct: pct(r.ApprovedTasks, r.TotalTasks)})
	}
	return out, nil
}

// Tasks lists the student's tasks with their latest status. status filters: todo, pending, approved, rejected, resubmit.
func (s *PortalService) Tasks(ctx context.Context, student *auth.Principal, courseID, videoID *uuid.UUID, status string) ([]dto.MyTask, error) {
	rows, err := s.Q.MyTasks(ctx, repository.MyTasksParams{StudentID: student.ID, CourseID: courseID, VideoID: videoID})
	if err != nil {
		return nil, dbErr(err, "tasks")
	}
	latest, err := s.Q.MyLatestSubmissions(ctx, student.ID)
	if err != nil {
		return nil, dbErr(err, "submissions")
	}
	byTask := make(map[uuid.UUID]repository.Submission, len(latest))
	for _, l := range latest {
		byTask[l.TaskID] = l
	}
	now := time.Now()
	out := make([]dto.MyTask, 0, len(rows))
	for _, r := range rows {
		t := dto.MyTask{ID: r.ID, Title: r.Title, DueAt: r.DueAt, MaxMarks: r.MaxMarks, AllowedTypes: r.AllowedTypes, VideoID: r.VideoID, VideoTitle: r.VideoTitle,
			CourseID: r.CourseID, CourseTitle: r.CourseTitle, Status: "todo"}
		if l, ok := byTask[r.ID]; ok {
			id, at := l.ID, l.CreatedAt
			t.Status, t.SubmissionID, t.Marks, t.Attempt, t.SubmittedAt = l.Status, &id, l.Marks, l.Attempt, &at
		}
		t.IsOverdue = t.DueAt != nil && now.After(*t.DueAt) && (t.Status == "todo" || t.Status == "rejected" || t.Status == "resubmit")
		if status == "" || status == t.Status {
			out = append(out, t)
		}
	}
	return out, nil
}

func (s *PortalService) Dashboard(ctx context.Context, student *auth.Principal) (dto.Dashboard, error) {
	courses, err := s.Courses(ctx, student)
	if err != nil {
		return dto.Dashboard{}, err
	}
	tasks, err := s.Tasks(ctx, student, nil, nil, "")
	if err != nil {
		return dto.Dashboard{}, err
	}
	upcoming, err := s.live.Mine(ctx, student, "upcoming")
	if err != nil {
		return dto.Dashboard{}, err
	}
	news, err := s.announcements.Mine(ctx, student, 5)
	if err != nil {
		return dto.Dashboard{}, err
	}
	mine, err := s.certificates.Mine(ctx, student)
	if err != nil {
		return dto.Dashboard{}, err
	}
	d := dto.Dashboard{Courses: courses, Announcements: news, NextTasks: []dto.MyTask{}, UpcomingLive: upcoming}
	d.Stats.Courses, d.Stats.UpcomingLive, d.Stats.Certificates = len(courses), len(upcoming), len(mine)
	todo := []dto.MyTask{}
	for _, t := range tasks {
		switch t.Status {
		case "todo", "rejected", "resubmit":
			d.Stats.ToDo++
			todo = append(todo, t)
		case "pending":
			d.Stats.InReview++
		case "approved":
			d.Stats.Approved++
		}
	}
	// Tasks with the nearest deadline first, then course order.
	sort.SliceStable(todo, func(i, j int) bool {
		a, b := todo[i].DueAt, todo[j].DueAt
		if a == nil || b == nil {
			return a != nil
		}
		return a.Before(*b)
	})
	if len(todo) > 5 {
		todo = todo[:5]
	}
	d.NextTasks = todo
	if len(d.UpcomingLive) > 3 {
		d.UpcomingLive = d.UpcomingLive[:3]
	}
	return d, nil
}

func (s *PortalService) playlist(ctx context.Context, student *auth.Principal, courseID uuid.UUID) ([]dto.PlaylistItem, error) {
	rows, err := s.Q.MyCourseVideos(ctx, repository.MyCourseVideosParams{StudentID: student.ID, CourseID: courseID})
	if err != nil {
		return nil, dbErr(err, "videos")
	}
	out := make([]dto.PlaylistItem, 0, len(rows))
	for _, r := range rows {
		out = append(out, dto.PlaylistItem{ID: r.ID, Title: r.Title, Position: r.Position, DurationSeconds: r.DurationSeconds, Provider: r.Provider,
			ThumbnailURL: ThumbnailURL(r.Provider, r.ProviderRef), TaskCount: r.TaskCount, ApprovedCount: r.ApprovedCount,
			Done: r.TaskCount > 0 && r.ApprovedCount >= r.TaskCount})
	}
	return out, nil
}

func (s *PortalService) findCourse(ctx context.Context, student *auth.Principal, courseID uuid.UUID) (dto.MyCourse, error) {
	courses, err := s.Courses(ctx, student)
	if err != nil {
		return dto.MyCourse{}, err
	}
	for _, c := range courses {
		if c.CourseID == courseID {
			return c, nil
		}
	}
	return dto.MyCourse{}, apperr.Forbidden("you are not enrolled in this course")
}

func (s *PortalService) Course(ctx context.Context, student *auth.Principal, courseID uuid.UUID) (dto.MyCourseDetail, error) {
	mc, err := s.findCourse(ctx, student, courseID)
	if err != nil {
		return dto.MyCourseDetail{}, err
	}
	c, err := s.Q.GetCourse(ctx, courseID)
	if err != nil {
		return dto.MyCourseDetail{}, dbErr(err, "course")
	}
	mentors, err := s.mentors(ctx, courseID)
	if err != nil {
		return dto.MyCourseDetail{}, err
	}
	pl, err := s.playlist(ctx, student, courseID)
	if err != nil {
		return dto.MyCourseDetail{}, err
	}
	return dto.MyCourseDetail{Course: mc, Description: c.Description, WhatYouLearn: c.WhatYouLearn, Mentors: mentors, Playlist: pl}, nil
}

func (s *PortalService) Watch(ctx context.Context, student *auth.Principal, videoID uuid.UUID) (dto.WatchPage, error) {
	v, err := s.Q.GetVideo(ctx, videoID)
	if err != nil {
		return dto.WatchPage{}, dbErr(err, "video")
	}
	mc, err := s.findCourse(ctx, student, v.CourseID)
	if err != nil {
		return dto.WatchPage{}, err
	}
	pl, err := s.playlist(ctx, student, v.CourseID)
	if err != nil {
		return dto.WatchPage{}, err
	}
	tasks, err := s.Tasks(ctx, student, &v.CourseID, &videoID, "")
	if err != nil {
		return dto.WatchPage{}, err
	}
	qz, err := s.quizzes.MyForVideo(ctx, student, videoID)
	if err != nil {
		return dto.WatchPage{}, err
	}
	page := dto.WatchPage{Video: toVideo(v, nil), CourseID: v.CourseID, CourseTitle: mc.Title, ProgressPct: mc.ProgressPct, Playlist: pl, Tasks: tasks, Quizzes: qz}
	page.Video.SourceURL = "" // students get the embed only
	for i, item := range pl {
		if item.ID == videoID {
			if i > 0 {
				page.PrevID = &pl[i-1].ID
			}
			if i+1 < len(pl) {
				page.NextID = &pl[i+1].ID
			}
		}
	}
	return page, nil
}

func (s *PortalService) Task(ctx context.Context, student *auth.Principal, taskID uuid.UUID) (dto.TaskPage, error) {
	t, err := s.Q.GetTask(ctx, taskID)
	if err != nil {
		return dto.TaskPage{}, dbErr(err, "task")
	}
	mc, err := s.findCourse(ctx, student, t.CourseID)
	if err != nil {
		return dto.TaskPage{}, err
	}
	attempts, err := s.history(ctx, taskID, student.ID)
	if err != nil {
		return dto.TaskPage{}, err
	}
	comments, err := s.thread(ctx, taskID, student.ID)
	if err != nil {
		return dto.TaskPage{}, err
	}
	page := dto.TaskPage{
		Task: dto.TaskBrief{ID: t.ID, Title: t.Title, Instructions: t.Instructions, AllowedTypes: t.AllowedTypes, MaxMarks: t.MaxMarks, PassMarks: t.PassMarks,
			DueAt: t.DueAt, VideoID: t.VideoID, VideoTitle: t.VideoTitle, CourseID: t.CourseID, CourseTitle: mc.Title},
		Rules:  dto.TaskRules{MaxFiles: t.MaxFiles, MaxFileMB: t.MaxFileMb, MaxImageMB: s.settings.Get(ctx).Uploads.MaxImageMB, AllowLate: t.AllowLate},
		Status: "todo", CanSubmit: true, Attempts: attempts, Comments: comments,
	}
	if len(attempts) > 0 {
		page.Status = attempts[0].Status
	}
	late := t.DueAt != nil && time.Now().After(*t.DueAt)
	page.IsOverdue = late && page.Status != "approved" && page.Status != "pending"
	switch {
	case page.Status == "approved":
		page.CanSubmit, page.Reason = false, "Approved — great work!"
	case page.Status == "pending":
		page.CanSubmit, page.Reason = false, "Your submission is waiting for review"
	case late && !t.AllowLate:
		page.CanSubmit, page.Reason = false, "The deadline has passed"
	}
	return page, nil
}

func (s *PortalService) Submit(ctx context.Context, student *auth.Principal, taskID uuid.UUID, in dto.SubmissionInput) (dto.TaskPage, error) {
	if _, err := s.submissions.Submit(ctx, student, taskID, in); err != nil {
		return dto.TaskPage{}, err
	}
	return s.Task(ctx, student, taskID)
}

func (s *PortalService) Comment(ctx context.Context, student *auth.Principal, taskID uuid.UUID, in dto.CommentInput) (dto.TaskPage, error) {
	if _, err := s.submissions.Comment(ctx, student, taskID, student.ID, in); err != nil {
		return dto.TaskPage{}, err
	}
	return s.Task(ctx, student, taskID)
}
