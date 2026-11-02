package handler

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/lms/backend/internal/dto"
)

type courseListIn struct {
	dto.PageQuery
	Q      string `query:"q" maxLength:"100"`
	Status string `query:"status" enum:"draft,published,archived,"`
}

func (h *Handler) courseRoutes(api huma.API) {
	t, g := "Courses", h.g
	huma.Register(api, op("course-options", http.MethodGet, "/courses/options", t, "Courses for pickers", g.Staff()), h.courseOptions)
	huma.Register(api, op("list-courses", http.MethodGet, "/courses", t, "List courses", g.Perm("courses", "view")), h.listCourses)
	huma.Register(api, op("create-course", http.MethodPost, "/courses", t, "Create a course", g.Perm("courses", "create")), h.createCourse)
	huma.Register(api, op("get-course", http.MethodGet, "/courses/{id}", t, "Get a course", g.Perm("courses", "view")), h.getCourse)
	huma.Register(api, op("update-course", http.MethodPut, "/courses/{id}", t, "Update a course", g.Perm("courses", "edit")), h.updateCourse)
	huma.Register(api, op("delete-course", http.MethodDelete, "/courses/{id}", t, "Delete a course", g.Perm("courses", "delete")), h.deleteCourse)

	t = "Curriculum"
	huma.Register(api, op("parse-video-link", http.MethodPost, "/videos/parse", t, "Validate a video link and preview the embed", g.Staff()), h.parseVideo)
	huma.Register(api, op("get-curriculum", http.MethodGet, "/courses/{id}/curriculum", t, "Videos with their tasks", g.Perm("courses", "view")), h.curriculum)
	huma.Register(api, op("create-video", http.MethodPost, "/courses/{id}/videos", t, "Add a video (YouTube / Vimeo / Bunny / Cloudflare)", g.Perm("courses", "create")), h.createVideo)
	huma.Register(api, op("reorder-videos", http.MethodPut, "/courses/{id}/videos/order", t, "Reorder videos", g.Perm("courses", "edit")), h.reorderVideos)
	huma.Register(api, op("update-video", http.MethodPut, "/videos/{id}", t, "Update a video", g.Perm("courses", "edit")), h.updateVideo)
	huma.Register(api, op("delete-video", http.MethodDelete, "/videos/{id}", t, "Delete a video and its tasks", g.Perm("courses", "delete")), h.deleteVideo)
	huma.Register(api, op("create-task", http.MethodPost, "/videos/{id}/tasks", t, "Add a task under a video", g.Perm("courses", "create")), h.createTask)
	huma.Register(api, op("reorder-tasks", http.MethodPut, "/videos/{id}/tasks/order", t, "Reorder tasks of a video", g.Perm("courses", "edit")), h.reorderTasks)
	huma.Register(api, op("update-task", http.MethodPut, "/tasks/{id}", t, "Update a task", g.Perm("courses", "edit")), h.updateTask)
	huma.Register(api, op("delete-task", http.MethodDelete, "/tasks/{id}", t, "Delete a task", g.Perm("courses", "delete")), h.deleteTask)
}

func (h *Handler) courseOptions(ctx context.Context, _ *noInput) (*Out[[]dto.CourseOption], error) {
	return ok(h.s.Courses.Options(ctx, actor(ctx)))
}

func (h *Handler) listCourses(ctx context.Context, in *courseListIn) (*Out[dto.List[dto.Course]], error) {
	return ok(h.s.Courses.List(ctx, actor(ctx), dto.CourseFilter{PageQuery: in.PageQuery, Q: in.Q, Status: in.Status}))
}

func (h *Handler) createCourse(ctx context.Context, in *bodyIn[dto.CourseInput]) (*Out[dto.Course], error) {
	return ok(h.s.Courses.Create(ctx, actor(ctx), in.Body))
}

func (h *Handler) getCourse(ctx context.Context, in *idPath) (*Out[dto.Course], error) {
	id, err := parseID(in.ID, "course")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Courses.Get(ctx, actor(ctx), id))
}

func (h *Handler) updateCourse(ctx context.Context, in *idBody[dto.CourseInput]) (*Out[dto.Course], error) {
	id, err := parseID(in.ID, "course")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Courses.Update(ctx, actor(ctx), id, in.Body))
}

func (h *Handler) deleteCourse(ctx context.Context, in *idPath) (*struct{}, error) {
	id, err := parseID(in.ID, "course")
	if err != nil {
		return nil, err
	}
	return done(h.s.Courses.Delete(ctx, actor(ctx), id))
}

func (h *Handler) parseVideo(ctx context.Context, in *bodyIn[dto.VideoLinkInput]) (*Out[dto.VideoLink], error) {
	return ok(h.s.Courses.ParseLink(in.Body))
}

func (h *Handler) curriculum(ctx context.Context, in *idPath) (*Out[[]dto.Video], error) {
	id, err := parseID(in.ID, "course")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Courses.Curriculum(ctx, actor(ctx), id))
}

func (h *Handler) createVideo(ctx context.Context, in *idBody[dto.VideoInput]) (*Out[dto.Video], error) {
	id, err := parseID(in.ID, "course")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Courses.CreateVideo(ctx, actor(ctx), id, in.Body))
}

func (h *Handler) reorderVideos(ctx context.Context, in *idBody[dto.IDs]) (*Out[dto.OK], error) {
	id, err := parseID(in.ID, "course")
	if err != nil {
		return nil, err
	}
	return ack(h.s.Courses.ReorderVideos(ctx, actor(ctx), id, in.Body.IDs), "")
}

func (h *Handler) updateVideo(ctx context.Context, in *idBody[dto.VideoInput]) (*Out[dto.Video], error) {
	id, err := parseID(in.ID, "video")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Courses.UpdateVideo(ctx, actor(ctx), id, in.Body))
}

func (h *Handler) deleteVideo(ctx context.Context, in *idPath) (*struct{}, error) {
	id, err := parseID(in.ID, "video")
	if err != nil {
		return nil, err
	}
	return done(h.s.Courses.DeleteVideo(ctx, actor(ctx), id))
}

func (h *Handler) createTask(ctx context.Context, in *idBody[dto.TaskInput]) (*Out[dto.Task], error) {
	id, err := parseID(in.ID, "video")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Courses.CreateTask(ctx, actor(ctx), id, in.Body))
}

func (h *Handler) reorderTasks(ctx context.Context, in *idBody[dto.IDs]) (*Out[dto.OK], error) {
	id, err := parseID(in.ID, "video")
	if err != nil {
		return nil, err
	}
	return ack(h.s.Courses.ReorderTasks(ctx, actor(ctx), id, in.Body.IDs), "")
}

func (h *Handler) updateTask(ctx context.Context, in *idBody[dto.TaskInput]) (*Out[dto.Task], error) {
	id, err := parseID(in.ID, "task")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Courses.UpdateTask(ctx, actor(ctx), id, in.Body))
}

func (h *Handler) deleteTask(ctx context.Context, in *idPath) (*struct{}, error) {
	id, err := parseID(in.ID, "task")
	if err != nil {
		return nil, err
	}
	return done(h.s.Courses.DeleteTask(ctx, actor(ctx), id))
}
