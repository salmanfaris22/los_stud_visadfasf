package service

import (
	"context"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/lms/backend/internal/apperr"
	"github.com/lms/backend/internal/auth"
	"github.com/lms/backend/internal/dto"
	"github.com/lms/backend/internal/repository"
)

// SubmissionService covers the task workflow: students submit, mentors review
// (marks, feedback, approve / reject / resubmit) and both sides talk in a thread.
type SubmissionService struct {
	base
	certs *CertificateService
}

func (s *SubmissionService) List(ctx context.Context, actor *auth.Principal, f dto.SubmissionFilter) (dto.List[dto.SubmissionRow], error) {
	rows, err := s.Q.ListSubmissions(ctx, repository.ListSubmissionsParams{Status: optStr(f.Status), CourseID: f.CourseID, TaskID: f.TaskID, StudentID: f.StudentID,
		BatchID: f.BatchID, Q: optStr(f.Q), MentorID: actor.MentorScope(), Lim: f.Lim(), Off: f.Off()})
	if err != nil {
		return dto.List[dto.SubmissionRow]{}, dbErr(err, "submissions")
	}
	out := make([]dto.SubmissionRow, 0, len(rows))
	var total int64
	for _, r := range rows {
		total = r.TotalCount
		out = append(out, dto.SubmissionRow{ID: r.ID, TaskID: r.TaskID, TaskTitle: r.TaskTitle, VideoTitle: r.VideoTitle, CourseID: r.CourseID, CourseTitle: r.CourseTitle,
			StudentID: r.StudentID, StudentName: r.StudentName, StudentEmail: r.StudentEmail, StudentCode: str(r.StudentCode), Attempt: r.Attempt, Status: r.Status,
			Marks: r.Marks, MaxMarks: r.MaxMarks, IsLate: r.IsLate, CreatedAt: r.CreatedAt, ReviewedAt: r.ReviewedAt})
	}
	return dto.NewList(out, total, f.PageQuery), nil
}

// history returns every attempt (newest first) of a student for a task, with items.
func (b base) history(ctx context.Context, taskID, studentID uuid.UUID) ([]dto.Submission, error) {
	rows, err := b.Q.ListStudentTaskSubmissions(ctx, repository.ListStudentTaskSubmissionsParams{TaskID: taskID, StudentID: studentID})
	if err != nil {
		return nil, dbErr(err, "submissions")
	}
	ids := make([]uuid.UUID, 0, len(rows))
	for _, r := range rows {
		ids = append(ids, r.ID)
	}
	items, err := b.items(ctx, ids)
	if err != nil {
		return nil, err
	}
	out := make([]dto.Submission, 0, len(rows))
	for _, r := range rows {
		it := items[r.ID]
		if it == nil {
			it = []dto.SubmissionItem{}
		}
		out = append(out, dto.Submission{ID: r.ID, Attempt: r.Attempt, Status: r.Status, Marks: r.Marks, Feedback: r.Feedback, IsLate: r.IsLate,
			ReviewerName: str(r.ReviewerName), ReviewedAt: r.ReviewedAt, CreatedAt: r.CreatedAt, Items: it})
	}
	return out, nil
}

func (b base) items(ctx context.Context, submissionIDs []uuid.UUID) (map[uuid.UUID][]dto.SubmissionItem, error) {
	out := map[uuid.UUID][]dto.SubmissionItem{}
	if len(submissionIDs) == 0 {
		return out, nil
	}
	rows, err := b.Q.ListSubmissionItems(ctx, submissionIDs)
	if err != nil {
		return nil, dbErr(err, "submission items")
	}
	for _, r := range rows {
		it := dto.SubmissionItem{ID: r.ID, Kind: r.Kind, Content: r.Content, Language: r.Language, UploadID: r.UploadID, FileName: str(r.FileName), Mime: str(r.Mime)}
		if r.SizeBytes != nil {
			it.SizeBytes = *r.SizeBytes
		}
		if r.UploadID != nil {
			it.URL = fileURLByID(*r.UploadID)
		}
		out[r.SubmissionID] = append(out[r.SubmissionID], it)
	}
	return out, nil
}

// thread returns the conversation between a student and mentors about one task.
func (b base) thread(ctx context.Context, taskID, studentID uuid.UUID) ([]dto.ThreadComment, error) {
	rows, err := b.Q.ListTaskComments(ctx, repository.ListTaskCommentsParams{TaskID: taskID, StudentID: studentID})
	if err != nil {
		return nil, dbErr(err, "comments")
	}
	out := make([]dto.ThreadComment, 0, len(rows))
	for _, r := range rows {
		c := dto.ThreadComment{ID: r.ID, AuthorID: r.AuthorID, AuthorName: r.AuthorName, AuthorAvatar: str(r.AuthorAvatar), AuthorKind: r.AuthorKind, Body: r.Body, CreatedAt: r.CreatedAt}
		if r.UploadID != nil {
			c.Attachment = &dto.Attachment{ID: *r.UploadID, FileName: str(r.FileName), Mime: str(r.Mime), URL: fileURLByID(*r.UploadID)}
		}
		out = append(out, c)
	}
	return out, nil
}

func (s *SubmissionService) Get(ctx context.Context, actor *auth.Principal, id uuid.UUID) (dto.SubmissionDetail, error) {
	r, err := s.Q.GetSubmission(ctx, id)
	if err != nil {
		return dto.SubmissionDetail{}, dbErr(err, "submission")
	}
	if err := s.access.EnsureStudent(ctx, actor, r.StudentID); err != nil {
		return dto.SubmissionDetail{}, err
	}
	hist, err := s.history(ctx, r.TaskID, r.StudentID)
	if err != nil {
		return dto.SubmissionDetail{}, err
	}
	comments, err := s.thread(ctx, r.TaskID, r.StudentID)
	if err != nil {
		return dto.SubmissionDetail{}, err
	}
	out := dto.SubmissionDetail{
		Task: dto.TaskBrief{ID: r.TaskID, Title: r.TaskTitle, Instructions: r.TaskInstructions, AllowedTypes: r.AllowedTypes, MaxMarks: r.MaxMarks, PassMarks: r.PassMarks,
			DueAt: r.DueAt, VideoID: r.VideoID, VideoTitle: r.VideoTitle, CourseID: r.CourseID, CourseTitle: r.CourseTitle},
		Student:  dto.Person{ID: r.StudentID, Name: r.StudentName, Email: r.StudentEmail, AvatarURL: str(r.StudentAvatar)},
		History:  hist,
		Comments: comments,
	}
	for _, h := range hist {
		if h.ID == id {
			out.Current = h
		}
	}
	return out, nil
}

func (s *SubmissionService) Review(ctx context.Context, actor *auth.Principal, id uuid.UUID, in dto.ReviewInput) (dto.SubmissionDetail, error) {
	r, err := s.Q.GetSubmission(ctx, id)
	if err != nil {
		return dto.SubmissionDetail{}, dbErr(err, "submission")
	}
	if err := s.access.EnsureStudent(ctx, actor, r.StudentID); err != nil {
		return dto.SubmissionDetail{}, err
	}
	latest, err := s.Q.LatestSubmission(ctx, repository.LatestSubmissionParams{TaskID: r.TaskID, StudentID: r.StudentID})
	if err == nil && latest.ID != id {
		return dto.SubmissionDetail{}, apperr.Conflict("a newer attempt exists, review that one")
	}
	if in.Marks != nil && *in.Marks > r.MaxMarks {
		return dto.SubmissionDetail{}, apperr.Invalid("marks cannot be more than %d", r.MaxMarks)
	}
	if in.Status == "approved" && in.Marks != nil && r.PassMarks > 0 && *in.Marks < r.PassMarks {
		return dto.SubmissionDetail{}, apperr.Invalid("marks are below the pass mark (%d); reject or ask for a resubmission", r.PassMarks)
	}
	if _, err := s.Q.ReviewSubmission(ctx, repository.ReviewSubmissionParams{ID: id, Status: in.Status, Marks: in.Marks, Feedback: strings.TrimSpace(in.Feedback), ReviewedBy: &actor.ID}); err != nil {
		return dto.SubmissionDetail{}, dbErr(err, "submission")
	}
	titles := map[string]string{"approved": "Task approved ✅", "rejected": "Task rejected", "resubmit": "Please resubmit your task"}
	body := r.TaskTitle
	if in.Marks != nil {
		body += fmt.Sprintf(" — %d/%d marks", *in.Marks, r.MaxMarks)
	}
	s.notify.Send(ctx, []uuid.UUID{r.StudentID}, "review", titles[in.Status], body, "/learn/tasks/"+r.TaskID.String())
	s.audit.Log(ctx, actor, "review", "submission", id, in)
	if in.Status == "approved" {
		s.certs.CheckCompletion(ctx, r.StudentID, r.CourseID)
	}
	return s.Get(ctx, actor, id)
}

// Thread returns the task conversation for staff (scope-checked).
func (s *SubmissionService) Thread(ctx context.Context, actor *auth.Principal, taskID, studentID uuid.UUID) ([]dto.ThreadComment, error) {
	if err := s.access.EnsureStudent(ctx, actor, studentID); err != nil {
		return nil, err
	}
	return s.thread(ctx, taskID, studentID)
}

// Comment adds a message to the task thread. Staff reply to a student; students write their own thread.
func (s *SubmissionService) Comment(ctx context.Context, actor *auth.Principal, taskID, studentID uuid.UUID, in dto.CommentInput) ([]dto.ThreadComment, error) {
	t, err := s.Q.GetTask(ctx, taskID)
	if err != nil {
		return nil, dbErr(err, "task")
	}
	if actor.IsStudent() {
		studentID = actor.ID
		if err := s.access.EnsureHasItem(ctx, actor, t.CourseID, "task", taskID); err != nil {
			return nil, err
		}
	} else if err := s.access.EnsureStudent(ctx, actor, studentID); err != nil {
		return nil, err
	}
	if in.UploadID != nil {
		if _, err := s.requireReady(ctx, actor.ID, *in.UploadID); err != nil {
			return nil, err
		}
	}
	if _, err := s.Q.CreateTaskComment(ctx, repository.CreateTaskCommentParams{TaskID: taskID, StudentID: studentID, AuthorID: actor.ID, Body: strings.TrimSpace(in.Body), UploadID: in.UploadID}); err != nil {
		return nil, dbErr(err, "comment")
	}
	if actor.IsStudent() {
		ids, _ := s.Q.TaskReviewers(ctx, repository.TaskReviewersParams{CourseID: t.CourseID, StudentID: studentID})
		s.notify.Send(ctx, ids, "task_comment", actor.Name+" commented on "+t.Title, trim(in.Body, 120), "/submissions?task_id="+taskID.String())
	} else {
		s.notify.Send(ctx, []uuid.UUID{studentID}, "task_comment", "Mentor replied on "+t.Title, trim(in.Body, 120), "/learn/tasks/"+taskID.String())
	}
	return s.thread(ctx, taskID, studentID)
}

func trim(s string, n int) string {
	s = strings.TrimSpace(s)
	if len([]rune(s)) <= n {
		return s
	}
	return string([]rune(s)[:n]) + "…"
}

// Submit records a new attempt for a task after validating every item against the task rules.
func (s *SubmissionService) Submit(ctx context.Context, student *auth.Principal, taskID uuid.UUID, in dto.SubmissionInput) (repository.Submission, error) {
	t, err := s.Q.GetTask(ctx, taskID)
	if err != nil {
		return repository.Submission{}, dbErr(err, "task")
	}
	if err := s.access.EnsureHasItem(ctx, student, t.CourseID, "task", taskID); err != nil {
		return repository.Submission{}, err
	}
	if latest, err := s.Q.LatestSubmission(ctx, repository.LatestSubmissionParams{TaskID: taskID, StudentID: student.ID}); err == nil {
		switch latest.Status {
		case "approved":
			return repository.Submission{}, apperr.Conflict("this task is already approved")
		case "pending":
			return repository.Submission{}, apperr.Conflict("your last submission is waiting for review")
		}
	}
	late := t.DueAt != nil && time.Now().After(*t.DueAt)
	if late && !t.AllowLate {
		return repository.Submission{}, apperr.Invalid("the deadline has passed and late submissions are closed")
	}
	if err := s.validateItems(ctx, student, t, in.Items); err != nil {
		return repository.Submission{}, err
	}
	var sub repository.Submission
	err = s.tx(ctx, func(q *repository.Queries) error {
		if sub, err = q.CreateSubmission(ctx, repository.CreateSubmissionParams{TaskID: taskID, StudentID: student.ID, IsLate: late}); err != nil {
			return err
		}
		for i, it := range in.Items {
			if _, err := q.AddSubmissionItem(ctx, repository.AddSubmissionItemParams{SubmissionID: sub.ID, Position: int32(i), Kind: it.Kind,
				Content: strings.TrimSpace(it.Content), Language: strings.TrimSpace(it.Language), UploadID: it.UploadID}); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return repository.Submission{}, dbErr(err, "submission")
	}
	ids, _ := s.Q.TaskReviewers(ctx, repository.TaskReviewersParams{CourseID: t.CourseID, StudentID: student.ID})
	s.notify.Send(ctx, ids, "submission", "New submission: "+t.Title, student.Name+fmt.Sprintf(" submitted attempt %d", sub.Attempt), "/submissions/"+sub.ID.String())
	s.audit.Log(ctx, student, "submit", "submission", sub.ID, map[string]any{"task": taskID, "attempt": sub.Attempt, "late": late})
	return sub, nil
}

func (s *SubmissionService) validateItems(ctx context.Context, student *auth.Principal, t repository.GetTaskRow, items []dto.SubmissionItemInput) error {
	allowed := map[string]bool{}
	for _, k := range t.AllowedTypes {
		allowed[k] = true
	}
	st := s.settings.Get(ctx)
	files := 0
	for i, it := range items {
		n := i + 1
		if !allowed[it.Kind] {
			return apperr.Invalid("item %d: %s answers are not allowed for this task", n, it.Kind)
		}
		switch it.Kind {
		case "file", "image":
			files++
			if it.UploadID == nil {
				return apperr.Invalid("item %d: attach a file", n)
			}
			u, err := s.requireReady(ctx, student.ID, *it.UploadID)
			if err != nil {
				return err
			}
			if it.Kind == "image" {
				if !IsImage(u.Mime) {
					return apperr.Invalid("item %d: %s is not an image", n, u.FileName)
				}
				if u.SizeBytes > int64(st.Uploads.MaxImageMB)<<20 {
					return apperr.Invalid("item %d: images must be %d MB or smaller", n, st.Uploads.MaxImageMB)
				}
			} else if u.SizeBytes > int64(t.MaxFileMb)<<20 {
				return apperr.Invalid("item %d: files must be %d MB or smaller for this task", n, t.MaxFileMb)
			}
		case "link", "drive":
			if err := validLink(it.Content, it.Kind == "drive"); err != nil {
				return apperr.Invalid("item %d: %s", n, err.Error())
			}
		case "text":
			if strings.TrimSpace(it.Content) == "" || len(it.Content) > 20000 {
				return apperr.Invalid("item %d: write your answer (max 20,000 characters)", n)
			}
		case "code":
			if strings.TrimSpace(it.Content) == "" {
				return apperr.Invalid("item %d: paste your code", n)
			}
		}
	}
	if t.MaxFiles > 0 && files > int(t.MaxFiles) {
		return apperr.Invalid("you can attach at most %d files", t.MaxFiles)
	}
	return nil
}

func validLink(raw string, drive bool) error {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || len(raw) > 2000 {
		return fmt.Errorf("enter a full link starting with https://")
	}
	if drive {
		h := strings.ToLower(u.Hostname())
		if h != "drive.google.com" && h != "docs.google.com" {
			return fmt.Errorf("use a Google Drive / Docs share link")
		}
	}
	return nil
}
