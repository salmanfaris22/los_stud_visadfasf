package handler

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/lms/backend/internal/dto"
)

type submissionListIn struct {
	dto.PageQuery
	Status    string `query:"status" enum:"pending,approved,rejected,resubmit,"`
	CourseID  string `query:"course_id"`
	TaskID    string `query:"task_id"`
	StudentID string `query:"student_id"`
	BatchID   string `query:"batch_id"`
	Q         string `query:"q" maxLength:"100"`
}

type threadIn struct {
	TaskID    string `path:"task_id"`
	StudentID string `path:"student_id"`
}

type threadPostIn struct {
	TaskID    string `path:"task_id"`
	StudentID string `path:"student_id"`
	Body      dto.CommentInput
}

func (h *Handler) submissionRoutes(api huma.API) {
	t, g := "Task reviews", h.g
	huma.Register(api, op("list-submissions", http.MethodGet, "/submissions", t, "Review queue", g.Perm("submissions", "view")), h.listSubmissions)
	huma.Register(api, op("get-submission", http.MethodGet, "/submissions/{id}", t, "Submission with history and thread", g.Perm("submissions", "view")), h.getSubmission)
	huma.Register(api, op("review-submission", http.MethodPost, "/submissions/{id}/review", t, "Approve, reject or ask to resubmit", g.Perm("submissions", "edit")), h.reviewSubmission)
	huma.Register(api, op("task-thread", http.MethodGet, "/tasks/{task_id}/threads/{student_id}", t, "Task conversation with a student", g.Perm("submissions", "view")), h.thread)
	huma.Register(api, op("task-thread-reply", http.MethodPost, "/tasks/{task_id}/threads/{student_id}", t, "Reply in a task conversation", g.Perm("submissions", "edit")), h.threadReply)
}

func (h *Handler) listSubmissions(ctx context.Context, in *submissionListIn) (*Out[dto.List[dto.SubmissionRow]], error) {
	f := dto.SubmissionFilter{PageQuery: in.PageQuery, Status: in.Status, Q: in.Q}
	var err error
	if f.CourseID, err = optID(in.CourseID); err != nil {
		return nil, err
	}
	if f.TaskID, err = optID(in.TaskID); err != nil {
		return nil, err
	}
	if f.StudentID, err = optID(in.StudentID); err != nil {
		return nil, err
	}
	if f.BatchID, err = optID(in.BatchID); err != nil {
		return nil, err
	}
	return ok(h.s.Submissions.List(ctx, actor(ctx), f))
}

func (h *Handler) getSubmission(ctx context.Context, in *idPath) (*Out[dto.SubmissionDetail], error) {
	id, err := parseID(in.ID, "submission")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Submissions.Get(ctx, actor(ctx), id))
}

func (h *Handler) reviewSubmission(ctx context.Context, in *idBody[dto.ReviewInput]) (*Out[dto.SubmissionDetail], error) {
	id, err := parseID(in.ID, "submission")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Submissions.Review(ctx, actor(ctx), id, in.Body))
}

func (h *Handler) thread(ctx context.Context, in *threadIn) (*Out[[]dto.ThreadComment], error) {
	tid, err := parseID(in.TaskID, "task")
	if err != nil {
		return nil, err
	}
	sid, err := parseID(in.StudentID, "student")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Submissions.Thread(ctx, actor(ctx), tid, sid))
}

func (h *Handler) threadReply(ctx context.Context, in *threadPostIn) (*Out[[]dto.ThreadComment], error) {
	tid, err := parseID(in.TaskID, "task")
	if err != nil {
		return nil, err
	}
	sid, err := parseID(in.StudentID, "student")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Submissions.Comment(ctx, actor(ctx), tid, sid, in.Body))
}
