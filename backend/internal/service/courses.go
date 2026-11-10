package service

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/lms/backend/internal/apperr"
	"github.com/lms/backend/internal/auth"
	"github.com/lms/backend/internal/dto"
	"github.com/lms/backend/internal/repository"
)

// CourseService manages courses and their curriculum (course → videos → tasks).
type CourseService struct{ base }

func toCourse(c repository.Course, videos, students int32, mentors []dto.Person) dto.Course {
	if mentors == nil {
		mentors = []dto.Person{}
	}
	return dto.Course{ID: c.ID, Slug: c.Slug, Title: c.Title, Subtitle: c.Subtitle, Description: c.Description, ThumbnailURL: c.ThumbnailUrl,
		Level: c.Level, Language: c.Language, Category: c.Category, Status: c.Status, IsPublic: c.IsPublic, PriceLabel: c.PriceLabel,
		WhatYouLearn: c.WhatYouLearn, VideoCount: videos, StudentCount: students, Mentors: mentors, CreatedAt: c.CreatedAt, UpdatedAt: c.UpdatedAt}
}

func toTask(t repository.Task) dto.Task {
	return dto.Task{ID: t.ID, VideoID: t.VideoID, Position: t.Position, Title: t.Title, Instructions: t.Instructions, AllowedTypes: t.AllowedTypes,
		MaxMarks: t.MaxMarks, PassMarks: t.PassMarks, DueAt: t.DueAt, AllowLate: t.AllowLate, MaxFiles: t.MaxFiles, MaxFileMB: t.MaxFileMb}
}

func toVideo(v repository.Video, tasks []dto.Task) dto.Video {
	if tasks == nil {
		tasks = []dto.Task{}
	}
	return dto.Video{ID: v.ID, CourseID: v.CourseID, Position: v.Position, Title: v.Title, Description: v.Description, Provider: v.Provider,
		ProviderRef: v.ProviderRef, SourceURL: v.SourceUrl, EmbedURL: EmbedURL(v.Provider, v.ProviderRef), ThumbnailURL: ThumbnailURL(v.Provider, v.ProviderRef),
		DurationSeconds: v.DurationSeconds, IsPreview: v.IsPreview, Tasks: tasks}
}

// mentors returns a course's mentors (shared by admin, portal and public site).
func (b base) mentors(ctx context.Context, courseID uuid.UUID) ([]dto.Person, error) {
	rows, err := b.Q.ListCourseMentors(ctx, courseID)
	if err != nil {
		return nil, dbErr(err, "mentors")
	}
	out := make([]dto.Person, 0, len(rows))
	for _, r := range rows {
		out = append(out, dto.Person{ID: r.ID, Name: r.Name, Email: r.Email, AvatarURL: str(r.AvatarUrl), Bio: str(r.Bio)})
	}
	return out, nil
}

// curriculum returns ordered videos with their tasks (shared with the portal).
func (b base) curriculum(ctx context.Context, courseID uuid.UUID) ([]dto.Video, error) {
	videos, err := b.Q.ListCourseVideos(ctx, courseID)
	if err != nil {
		return nil, dbErr(err, "videos")
	}
	tasks, err := b.Q.ListTasksByCourse(ctx, courseID)
	if err != nil {
		return nil, dbErr(err, "tasks")
	}
	byVideo := map[uuid.UUID][]dto.Task{}
	for _, t := range tasks {
		byVideo[t.VideoID] = append(byVideo[t.VideoID], toTask(t))
	}
	out := make([]dto.Video, 0, len(videos))
	for _, v := range videos {
		out = append(out, toVideo(v, byVideo[v.ID]))
	}
	return out, nil
}

func (s *CourseService) Options(ctx context.Context, actor *auth.Principal) ([]dto.CourseOption, error) {
	rows, err := s.Q.CourseOptions(ctx, actor.MentorScope())
	if err != nil {
		return nil, dbErr(err, "courses")
	}
	out := make([]dto.CourseOption, 0, len(rows))
	for _, r := range rows {
		out = append(out, dto.CourseOption{ID: r.ID, Title: r.Title, Status: r.Status, FeePaise: r.FeePaise, GSTBP: r.GstBp})
	}
	return out, nil
}

func (s *CourseService) List(ctx context.Context, actor *auth.Principal, f dto.CourseFilter) (dto.List[dto.Course], error) {
	rows, err := s.Q.ListCourses(ctx, repository.ListCoursesParams{Q: optStr(f.Q), Status: optStr(f.Status), MentorID: actor.MentorScope(), Lim: f.Lim(), Off: f.Off()})
	if err != nil {
		return dto.List[dto.Course]{}, dbErr(err, "courses")
	}
	out := make([]dto.Course, 0, len(rows))
	var total int64
	for _, r := range rows {
		total = r.TotalCount
		c := repository.Course{ID: r.ID, Slug: r.Slug, Title: r.Title, Subtitle: r.Subtitle, Description: r.Description, ThumbnailUrl: r.ThumbnailUrl,
			Level: r.Level, Language: r.Language, Category: r.Category, Status: r.Status, IsPublic: r.IsPublic, PriceLabel: r.PriceLabel,
			WhatYouLearn: r.WhatYouLearn, CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt}
		out = append(out, toCourse(c, r.VideoCount, r.StudentCount, nil))
	}
	return dto.NewList(out, total, f.PageQuery), nil
}

func (s *CourseService) load(ctx context.Context, actor *auth.Principal, id uuid.UUID) (repository.Course, error) {
	c, err := s.Q.GetCourse(ctx, id)
	if err != nil {
		return c, dbErr(err, "course")
	}
	return c, s.access.EnsureCourse(ctx, actor, id)
}

func (s *CourseService) full(ctx context.Context, c repository.Course) (dto.Course, error) {
	mentors, err := s.mentors(ctx, c.ID)
	if err != nil {
		return dto.Course{}, err
	}
	videos, err := s.Q.ListCourseVideos(ctx, c.ID)
	if err != nil {
		return dto.Course{}, dbErr(err, "course")
	}
	return toCourse(c, int32(len(videos)), 0, mentors), nil
}

func (s *CourseService) Get(ctx context.Context, actor *auth.Principal, id uuid.UUID) (dto.Course, error) {
	c, err := s.load(ctx, actor, id)
	if err != nil {
		return dto.Course{}, err
	}
	return s.full(ctx, c)
}

// uniqueSlug returns base, or base-2, base-3… when taken by another course.
func (s *CourseService) uniqueSlug(ctx context.Context, base string, self uuid.UUID) (string, error) {
	slug := base
	for i := 2; i < 500; i++ {
		c, err := s.Q.GetCourseBySlug(ctx, slug)
		if errors.Is(err, pgx.ErrNoRows) || (err == nil && c.ID == self) {
			return slug, nil
		}
		if err != nil {
			return "", dbErr(err, "course")
		}
		slug = fmt.Sprintf("%s-%d", base, i)
	}
	return "", apperr.Conflict("could not find a free slug")
}

func normaliseCourse(in *dto.CourseInput) {
	in.Title = strings.TrimSpace(in.Title)
	in.Category = strings.TrimSpace(in.Category)
	in.Level = orDefault(in.Level, "beginner")
	in.Language = orDefault(in.Language, "English")
	in.Status = orDefault(in.Status, "draft")
	cleaned := []string{}
	for _, v := range in.WhatYouLearn {
		if v = strings.TrimSpace(v); v != "" {
			cleaned = append(cleaned, v)
		}
	}
	in.WhatYouLearn = cleaned
}

func (s *CourseService) Create(ctx context.Context, actor *auth.Principal, in dto.CourseInput) (dto.Course, error) {
	normaliseCourse(&in)
	slug, err := s.uniqueSlug(ctx, orDefault(in.Slug, Slugify(in.Title)), uuid.Nil)
	if err != nil {
		return dto.Course{}, err
	}
	mentors := in.MentorIDs
	if actor.MentorScope() != nil {
		mentors = []uuid.UUID{actor.ID} // scoped mentors always own what they create
	}
	var c repository.Course
	err = s.tx(ctx, func(q *repository.Queries) error {
		if c, err = q.CreateCourse(ctx, repository.CreateCourseParams{Slug: slug, Title: in.Title, Subtitle: in.Subtitle, Description: in.Description,
			ThumbnailUrl: in.ThumbnailURL, Level: in.Level, Language: in.Language, Category: in.Category, Status: in.Status, IsPublic: in.IsPublic,
			PriceLabel: in.PriceLabel, WhatYouLearn: in.WhatYouLearn, CreatedBy: &actor.ID}); err != nil {
			return err
		}
		if len(mentors) > 0 {
			return q.AddCourseMentors(ctx, repository.AddCourseMentorsParams{CourseID: c.ID, UserIds: mentors})
		}
		return nil
	})
	if err != nil {
		return dto.Course{}, dbErr(err, "course")
	}
	s.access.Invalidate(nil)
	s.audit.Log(ctx, actor, "create", "course", c.ID, map[string]string{"title": c.Title})
	return s.full(ctx, c)
}

func (s *CourseService) Update(ctx context.Context, actor *auth.Principal, id uuid.UUID, in dto.CourseInput) (dto.Course, error) {
	cur, err := s.load(ctx, actor, id)
	if err != nil {
		return dto.Course{}, err
	}
	normaliseCourse(&in)
	slug, err := s.uniqueSlug(ctx, orDefault(in.Slug, cur.Slug), cur.ID)
	if err != nil {
		return dto.Course{}, err
	}
	var c repository.Course
	err = s.tx(ctx, func(q *repository.Queries) error {
		if c, err = q.UpdateCourse(ctx, repository.UpdateCourseParams{ID: id, Slug: slug, Title: in.Title, Subtitle: in.Subtitle, Description: in.Description,
			ThumbnailUrl: in.ThumbnailURL, Level: in.Level, Language: in.Language, Category: in.Category, Status: in.Status, IsPublic: in.IsPublic,
			PriceLabel: in.PriceLabel, WhatYouLearn: in.WhatYouLearn}); err != nil {
			return err
		}
		if actor.MentorScope() == nil && in.MentorIDs != nil {
			if err := q.ClearCourseMentors(ctx, id); err != nil {
				return err
			}
			if len(in.MentorIDs) > 0 {
				return q.AddCourseMentors(ctx, repository.AddCourseMentorsParams{CourseID: id, UserIds: in.MentorIDs})
			}
		}
		return nil
	})
	if err != nil {
		return dto.Course{}, dbErr(err, "course")
	}
	s.access.Invalidate(nil)
	s.audit.Log(ctx, actor, "update", "course", id, map[string]any{"title": c.Title, "status": c.Status, "mentors": in.MentorIDs})
	return s.full(ctx, c)
}

func (s *CourseService) Delete(ctx context.Context, actor *auth.Principal, id uuid.UUID) error {
	c, err := s.load(ctx, actor, id)
	if err != nil {
		return err
	}
	if err := s.Q.DeleteCourse(ctx, id); err != nil {
		return dbErr(err, "course")
	}
	s.audit.Log(ctx, actor, "delete", "course", id, map[string]string{"title": c.Title})
	return nil
}

func (s *CourseService) Curriculum(ctx context.Context, actor *auth.Principal, courseID uuid.UUID) ([]dto.Video, error) {
	if _, err := s.load(ctx, actor, courseID); err != nil {
		return nil, err
	}
	return s.curriculum(ctx, courseID)
}

// ParseLink validates a pasted video link and returns the embed preview.
func (s *CourseService) ParseLink(in dto.VideoLinkInput) (dto.VideoLink, error) {
	ref, err := ParseVideoRef(in.Provider, in.URL)
	if err != nil {
		return dto.VideoLink{}, apperr.Invalid("%s", err.Error())
	}
	return dto.VideoLink{ProviderRef: ref, EmbedURL: EmbedURL(in.Provider, ref), ThumbnailURL: ThumbnailURL(in.Provider, ref)}, nil
}

func (s *CourseService) CreateVideo(ctx context.Context, actor *auth.Principal, courseID uuid.UUID, in dto.VideoInput) (dto.Video, error) {
	c, err := s.load(ctx, actor, courseID)
	if err != nil {
		return dto.Video{}, err
	}
	ref, err := ParseVideoRef(in.Provider, in.URL)
	if err != nil {
		return dto.Video{}, apperr.Invalid("%s", err.Error())
	}
	v, err := s.Q.CreateVideo(ctx, repository.CreateVideoParams{CourseID: courseID, Title: strings.TrimSpace(in.Title), Description: in.Description,
		Provider: in.Provider, ProviderRef: ref, SourceUrl: strings.TrimSpace(in.URL), DurationSeconds: in.DurationSeconds, IsPreview: in.IsPreview})
	if err != nil {
		return dto.Video{}, dbErr(err, "video")
	}
	s.audit.Log(ctx, actor, "create", "video", v.ID, map[string]string{"title": v.Title, "course": c.Title, "provider": v.Provider})
	return toVideo(v, nil), nil
}

func (s *CourseService) loadVideo(ctx context.Context, actor *auth.Principal, id uuid.UUID) (repository.Video, error) {
	v, err := s.Q.GetVideo(ctx, id)
	if err != nil {
		return v, dbErr(err, "video")
	}
	return v, s.access.EnsureCourse(ctx, actor, v.CourseID)
}

func (s *CourseService) UpdateVideo(ctx context.Context, actor *auth.Principal, id uuid.UUID, in dto.VideoInput) (dto.Video, error) {
	if _, err := s.loadVideo(ctx, actor, id); err != nil {
		return dto.Video{}, err
	}
	ref, err := ParseVideoRef(in.Provider, in.URL)
	if err != nil {
		return dto.Video{}, apperr.Invalid("%s", err.Error())
	}
	v, err := s.Q.UpdateVideo(ctx, repository.UpdateVideoParams{ID: id, Title: strings.TrimSpace(in.Title), Description: in.Description, Provider: in.Provider,
		ProviderRef: ref, SourceUrl: strings.TrimSpace(in.URL), DurationSeconds: in.DurationSeconds, IsPreview: in.IsPreview})
	if err != nil {
		return dto.Video{}, dbErr(err, "video")
	}
	s.audit.Log(ctx, actor, "update", "video", id, map[string]string{"title": v.Title, "provider": v.Provider})
	return toVideo(v, nil), nil
}

func (s *CourseService) DeleteVideo(ctx context.Context, actor *auth.Principal, id uuid.UUID) error {
	v, err := s.loadVideo(ctx, actor, id)
	if err != nil {
		return err
	}
	if err := s.removeItem(ctx, "video", id, s.Q.ArchiveVideo, s.Q.DeleteVideo); err != nil {
		return dbErr(err, "video")
	}
	s.audit.Log(ctx, actor, "delete", "video", id, map[string]string{"title": v.Title})
	return nil
}

func (s *CourseService) ReorderVideos(ctx context.Context, actor *auth.Principal, courseID uuid.UUID, ids []uuid.UUID) error {
	if _, err := s.load(ctx, actor, courseID); err != nil {
		return err
	}
	return dbErr(s.Q.ReorderVideos(ctx, repository.ReorderVideosParams{CourseID: courseID, Ids: ids}), "videos")
}

func normaliseTask(in dto.TaskInput) (dto.TaskInput, error) {
	if in.PassMarks > in.MaxMarks {
		return in, apperr.Invalid("pass marks cannot be more than max marks")
	}
	if in.MaxFiles == 0 {
		in.MaxFiles = 5
	}
	if in.MaxFileMB == 0 {
		in.MaxFileMB = 10
	}
	in.Title = strings.TrimSpace(in.Title)
	return in, nil
}

func (s *CourseService) CreateTask(ctx context.Context, actor *auth.Principal, videoID uuid.UUID, in dto.TaskInput) (dto.Task, error) {
	v, err := s.loadVideo(ctx, actor, videoID)
	if err != nil {
		return dto.Task{}, err
	}
	if in, err = normaliseTask(in); err != nil {
		return dto.Task{}, err
	}
	t, err := s.Q.CreateTask(ctx, repository.CreateTaskParams{VideoID: videoID, Title: in.Title, Instructions: in.Instructions, AllowedTypes: in.AllowedTypes,
		MaxMarks: in.MaxMarks, PassMarks: in.PassMarks, DueAt: in.DueAt, AllowLate: in.AllowLate, MaxFiles: in.MaxFiles, MaxFileMb: in.MaxFileMB})
	if err != nil {
		return dto.Task{}, dbErr(err, "task")
	}
	s.audit.Log(ctx, actor, "create", "task", t.ID, map[string]string{"title": t.Title, "video": v.Title})
	if ids, err := s.Q.AnnouncementAudience(ctx, repository.AnnouncementAudienceParams{TargetType: "course", TargetID: &v.CourseID}); err == nil {
		s.notify.Send(ctx, ids, "task", "New task: "+t.Title, "Added under “"+v.Title+"”.", "/learn/tasks/"+t.ID.String())
	}
	return toTask(t), nil
}

func (s *CourseService) loadTask(ctx context.Context, actor *auth.Principal, id uuid.UUID) (repository.GetTaskRow, error) {
	t, err := s.Q.GetTask(ctx, id)
	if err != nil {
		return t, dbErr(err, "task")
	}
	return t, s.access.EnsureCourse(ctx, actor, t.CourseID)
}

func (s *CourseService) UpdateTask(ctx context.Context, actor *auth.Principal, id uuid.UUID, in dto.TaskInput) (dto.Task, error) {
	if _, err := s.loadTask(ctx, actor, id); err != nil {
		return dto.Task{}, err
	}
	in, err := normaliseTask(in)
	if err != nil {
		return dto.Task{}, err
	}
	t, err := s.Q.UpdateTask(ctx, repository.UpdateTaskParams{ID: id, Title: in.Title, Instructions: in.Instructions, AllowedTypes: in.AllowedTypes,
		MaxMarks: in.MaxMarks, PassMarks: in.PassMarks, DueAt: in.DueAt, AllowLate: in.AllowLate, MaxFiles: in.MaxFiles, MaxFileMb: in.MaxFileMB})
	if err != nil {
		return dto.Task{}, dbErr(err, "task")
	}
	s.audit.Log(ctx, actor, "update", "task", id, map[string]string{"title": t.Title})
	return toTask(t), nil
}

func (s *CourseService) DeleteTask(ctx context.Context, actor *auth.Principal, id uuid.UUID) error {
	t, err := s.loadTask(ctx, actor, id)
	if err != nil {
		return err
	}
	if err := s.removeItem(ctx, "task", id, s.Q.ArchiveTask, s.Q.DeleteTask); err != nil {
		return dbErr(err, "task")
	}
	s.audit.Log(ctx, actor, "delete", "task", id, map[string]string{"title": t.Title})
	return nil
}

func (s *CourseService) ReorderTasks(ctx context.Context, actor *auth.Principal, videoID uuid.UUID, ids []uuid.UUID) error {
	if _, err := s.loadVideo(ctx, actor, videoID); err != nil {
		return err
	}
	return dbErr(s.Q.ReorderTasks(ctx, repository.ReorderTasksParams{VideoID: videoID, Ids: ids}), "tasks")
}
