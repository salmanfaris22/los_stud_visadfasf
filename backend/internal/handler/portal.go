package handler

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/lms/backend/internal/dto"
)

type myTasksIn struct {
	CourseID string `query:"course_id"`
	Status   string `query:"status" enum:"todo,pending,approved,rejected,resubmit,"`
}

func (h *Handler) portalRoutes(api huma.API) {
	t, g := "Student portal", h.g
	huma.Register(api, op("my-dashboard", http.MethodGet, "/me/dashboard", t, "Home: progress, next tasks, live classes, news", g.Student()), h.dashboard)
	huma.Register(api, op("my-courses", http.MethodGet, "/me/courses", t, "My enrolled courses with progress", g.Student()), h.myCourses)
	huma.Register(api, op("my-course", http.MethodGet, "/me/courses/{id}", t, "Course overview and playlist", g.Student()), h.myCourse)
	huma.Register(api, op("watch-video", http.MethodGet, "/me/videos/{id}", t, "Watch page: player, playlist, tasks, quizzes", g.Student()), h.watch)
	huma.Register(api, op("my-tasks", http.MethodGet, "/me/tasks", t, "All my tasks with status", g.Student()), h.myTasks)
	huma.Register(api, op("my-task", http.MethodGet, "/me/tasks/{id}", t, "Task page with attempts and conversation", g.Student()), h.myTask)
	huma.Register(api, op("submit-task", http.MethodPost, "/me/tasks/{id}/submissions", t, "Submit a task", g.Student()), h.submitTask)
	huma.Register(api, op("comment-task", http.MethodPost, "/me/tasks/{id}/comments", t, "Message the mentor about a task", g.Student()), h.commentTask)
}

func (h *Handler) dashboard(ctx context.Context, _ *noInput) (*Out[dto.Dashboard], error) {
	return ok(h.s.Portal.Dashboard(ctx, actor(ctx)))
}

func (h *Handler) myCourses(ctx context.Context, _ *noInput) (*Out[[]dto.MyCourse], error) {
	return ok(h.s.Portal.Courses(ctx, actor(ctx)))
}

func (h *Handler) myCourse(ctx context.Context, in *idPath) (*Out[dto.MyCourseDetail], error) {
	id, err := parseID(in.ID, "course")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Portal.Course(ctx, actor(ctx), id))
}

func (h *Handler) watch(ctx context.Context, in *idPath) (*Out[dto.WatchPage], error) {
	id, err := parseID(in.ID, "video")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Portal.Watch(ctx, actor(ctx), id))
}

func (h *Handler) myTasks(ctx context.Context, in *myTasksIn) (*Out[[]dto.MyTask], error) {
	cid, err := optID(in.CourseID)
	if err != nil {
		return nil, err
	}
	return ok(h.s.Portal.Tasks(ctx, actor(ctx), cid, nil, in.Status))
}

func (h *Handler) myTask(ctx context.Context, in *idPath) (*Out[dto.TaskPage], error) {
	id, err := parseID(in.ID, "task")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Portal.Task(ctx, actor(ctx), id))
}

func (h *Handler) submitTask(ctx context.Context, in *idBody[dto.SubmissionInput]) (*Out[dto.TaskPage], error) {
	id, err := parseID(in.ID, "task")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Portal.Submit(ctx, actor(ctx), id, in.Body))
}

func (h *Handler) commentTask(ctx context.Context, in *idBody[dto.CommentInput]) (*Out[dto.TaskPage], error) {
	id, err := parseID(in.ID, "task")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Portal.Comment(ctx, actor(ctx), id, in.Body))
}
