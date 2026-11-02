package handler

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/lms/backend/internal/dto"
)

type studentListIn struct {
	dto.PageQuery
	Q        string `query:"q" maxLength:"100"`
	Status   string `query:"status" enum:"active,disabled,"`
	CourseID string `query:"course_id"`
	BatchID  string `query:"batch_id"`
}

func (h *Handler) studentRoutes(api huma.API) {
	t, g := "Students", h.g
	huma.Register(api, op("list-students", http.MethodGet, "/students", t, "List students", g.Perm("students", "view")), h.listStudents)
	huma.Register(api, op("export-students", http.MethodGet, "/students/export", t, "Download students as CSV", g.Perm("students", "view")), h.exportStudents)
	imp := op("import-students", http.MethodPost, "/students/import", t, "Bulk create students from CSV", g.Perm("students", "create"))
	imp.MaxBodyBytes = 4 << 20
	huma.Register(api, imp, h.importStudents)
	huma.Register(api, op("get-student", http.MethodGet, "/students/{id}", t, "Student profile with enrollments", g.Perm("students", "view")), h.getStudent)
	huma.Register(api, op("create-student", http.MethodPost, "/students", t, "Create a student and assign courses", g.Perm("students", "create")), h.createStudent)
	huma.Register(api, op("update-student", http.MethodPut, "/students/{id}", t, "Update a student", g.Perm("students", "edit")), h.updateStudent)
	huma.Register(api, op("delete-student", http.MethodDelete, "/students/{id}", t, "Delete a student", g.Perm("students", "delete")), h.deleteStudent)
	huma.Register(api, op("enroll-student", http.MethodPost, "/students/{id}/enrollments", t, "Assign a course to a student", g.Perm("students", "edit")), h.enroll)
	huma.Register(api, op("update-enrollment", http.MethodPut, "/enrollments/{id}", t, "Change batch or status of an enrollment", g.Perm("students", "edit")), h.updateEnrollment)
	huma.Register(api, op("delete-enrollment", http.MethodDelete, "/enrollments/{id}", t, "Remove a course from a student", g.Perm("students", "edit")), h.deleteEnrollment)
}

func (h *Handler) listStudents(ctx context.Context, in *studentListIn) (*Out[dto.List[dto.Student]], error) {
	cid, err := optID(in.CourseID)
	if err != nil {
		return nil, err
	}
	bid, err := optID(in.BatchID)
	if err != nil {
		return nil, err
	}
	return ok(h.s.Students.List(ctx, actor(ctx), dto.StudentFilter{PageQuery: in.PageQuery, Q: in.Q, Status: in.Status, CourseID: cid, BatchID: bid}))
}

func (h *Handler) exportStudents(ctx context.Context, _ *noInput) (*FileOut, error) {
	return file(h.s.Students.Export(ctx, actor(ctx)))
}

func (h *Handler) importStudents(ctx context.Context, in *bodyIn[dto.ImportInput]) (*Out[dto.ImportResult], error) {
	return ok(h.s.Students.Import(ctx, actor(ctx), in.Body))
}

func (h *Handler) getStudent(ctx context.Context, in *idPath) (*Out[dto.StudentDetail], error) {
	id, err := parseID(in.ID, "student")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Students.Get(ctx, actor(ctx), id))
}

func (h *Handler) createStudent(ctx context.Context, in *bodyIn[dto.StudentInput]) (*Out[dto.StudentDetail], error) {
	return ok(h.s.Students.Create(ctx, actor(ctx), in.Body))
}

func (h *Handler) updateStudent(ctx context.Context, in *idBody[dto.StudentInput]) (*Out[dto.StudentDetail], error) {
	id, err := parseID(in.ID, "student")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Students.Update(ctx, actor(ctx), id, in.Body))
}

func (h *Handler) deleteStudent(ctx context.Context, in *idPath) (*struct{}, error) {
	id, err := parseID(in.ID, "student")
	if err != nil {
		return nil, err
	}
	return done(h.s.Students.Delete(ctx, actor(ctx), id))
}

func (h *Handler) enroll(ctx context.Context, in *idBody[dto.EnrollInput]) (*Out[dto.StudentDetail], error) {
	id, err := parseID(in.ID, "student")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Students.Enroll(ctx, actor(ctx), id, in.Body))
}

func (h *Handler) updateEnrollment(ctx context.Context, in *idBody[dto.EnrollmentUpdate]) (*Out[dto.OK], error) {
	id, err := parseID(in.ID, "enrollment")
	if err != nil {
		return nil, err
	}
	return ack(h.s.Students.UpdateEnrollment(ctx, actor(ctx), id, in.Body), "")
}

func (h *Handler) deleteEnrollment(ctx context.Context, in *idPath) (*struct{}, error) {
	id, err := parseID(in.ID, "enrollment")
	if err != nil {
		return nil, err
	}
	return done(h.s.Students.DeleteEnrollment(ctx, actor(ctx), id))
}
