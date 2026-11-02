package handler

import (
	"context"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/lms/backend/internal/dto"
)

type batchListIn struct {
	dto.PageQuery
	CourseID string `query:"course_id"`
	Status   string `query:"status" enum:"upcoming,running,completed,cancelled,"`
	Q        string `query:"q" maxLength:"100"`
}

type batchOptionsIn struct {
	CourseID string `query:"course_id"`
}

type studentIDs struct {
	StudentIDs []uuid.UUID `json:"student_ids" minItems:"1" maxItems:"1000"`
}

func (h *Handler) batchRoutes(api huma.API) {
	t, g := "Batches", h.g
	huma.Register(api, op("list-batch-types", http.MethodGet, "/batch-types", t, "List batch types", g.Staff()), h.listBatchTypes)
	huma.Register(api, op("create-batch-type", http.MethodPost, "/batch-types", t, "Create a batch type (Online, Offline, Weekend…)", g.Perm("batches", "create")), h.createBatchType)
	huma.Register(api, op("update-batch-type", http.MethodPut, "/batch-types/{id}", t, "Update a batch type", g.Perm("batches", "edit")), h.updateBatchType)
	huma.Register(api, op("delete-batch-type", http.MethodDelete, "/batch-types/{id}", t, "Delete an unused batch type", g.Perm("batches", "delete")), h.deleteBatchType)
	huma.Register(api, op("batch-options", http.MethodGet, "/batches/options", t, "Batches for pickers", g.Staff()), h.batchOptions)
	huma.Register(api, op("list-batches", http.MethodGet, "/batches", t, "List batches", g.Perm("batches", "view")), h.listBatches)
	huma.Register(api, op("create-batch", http.MethodPost, "/batches", t, "Create a batch", g.Perm("batches", "create")), h.createBatch)
	huma.Register(api, op("get-batch", http.MethodGet, "/batches/{id}", t, "Batch with mentors and students", g.Perm("batches", "view")), h.getBatch)
	huma.Register(api, op("update-batch", http.MethodPut, "/batches/{id}", t, "Update a batch", g.Perm("batches", "edit")), h.updateBatch)
	huma.Register(api, op("delete-batch", http.MethodDelete, "/batches/{id}", t, "Delete a batch", g.Perm("batches", "delete")), h.deleteBatch)
	huma.Register(api, op("add-batch-students", http.MethodPost, "/batches/{id}/students", t, "Enroll students into the batch", g.Perm("students", "edit")), h.addBatchStudents)
}

func (h *Handler) listBatchTypes(ctx context.Context, _ *noInput) (*Out[[]dto.BatchType], error) {
	return ok(h.s.Batches.ListTypes(ctx))
}

func (h *Handler) createBatchType(ctx context.Context, in *bodyIn[dto.BatchTypeInput]) (*Out[dto.BatchType], error) {
	return ok(h.s.Batches.CreateType(ctx, actor(ctx), in.Body))
}

func (h *Handler) updateBatchType(ctx context.Context, in *idBody[dto.BatchTypeInput]) (*Out[dto.BatchType], error) {
	id, err := parseID(in.ID, "batch type")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Batches.UpdateType(ctx, actor(ctx), id, in.Body))
}

func (h *Handler) deleteBatchType(ctx context.Context, in *idPath) (*struct{}, error) {
	id, err := parseID(in.ID, "batch type")
	if err != nil {
		return nil, err
	}
	return done(h.s.Batches.DeleteType(ctx, actor(ctx), id))
}

func (h *Handler) batchOptions(ctx context.Context, in *batchOptionsIn) (*Out[[]dto.BatchOption], error) {
	cid, err := optID(in.CourseID)
	if err != nil {
		return nil, err
	}
	return ok(h.s.Batches.Options(ctx, cid))
}

func (h *Handler) listBatches(ctx context.Context, in *batchListIn) (*Out[dto.List[dto.Batch]], error) {
	cid, err := optID(in.CourseID)
	if err != nil {
		return nil, err
	}
	return ok(h.s.Batches.List(ctx, actor(ctx), dto.BatchFilter{PageQuery: in.PageQuery, CourseID: cid, Status: in.Status, Q: in.Q}))
}

func (h *Handler) createBatch(ctx context.Context, in *bodyIn[dto.BatchInput]) (*Out[dto.BatchDetail], error) {
	return ok(h.s.Batches.Create(ctx, actor(ctx), in.Body))
}

func (h *Handler) getBatch(ctx context.Context, in *idPath) (*Out[dto.BatchDetail], error) {
	id, err := parseID(in.ID, "batch")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Batches.Get(ctx, actor(ctx), id))
}

func (h *Handler) updateBatch(ctx context.Context, in *idBody[dto.BatchInput]) (*Out[dto.BatchDetail], error) {
	id, err := parseID(in.ID, "batch")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Batches.Update(ctx, actor(ctx), id, in.Body))
}

func (h *Handler) deleteBatch(ctx context.Context, in *idPath) (*struct{}, error) {
	id, err := parseID(in.ID, "batch")
	if err != nil {
		return nil, err
	}
	return done(h.s.Batches.Delete(ctx, actor(ctx), id))
}

func (h *Handler) addBatchStudents(ctx context.Context, in *idBody[studentIDs]) (*Out[dto.BatchDetail], error) {
	id, err := parseID(in.ID, "batch")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Batches.AddStudents(ctx, actor(ctx), id, in.Body.StudentIDs))
}

func (h *Handler) attendanceRoutes(api huma.API) {
	t, g := "Attendance", h.g
	huma.Register(api, op("list-classes", http.MethodGet, "/batches/{id}/classes", t, "Offline class sessions of a batch", g.Perm("attendance", "view")), h.listClasses)
	huma.Register(api, op("create-class", http.MethodPost, "/batches/{id}/classes", t, "Schedule a class session", g.Perm("attendance", "create")), h.createClass)
	huma.Register(api, op("update-class", http.MethodPut, "/classes/{id}", t, "Update a class session", g.Perm("attendance", "edit")), h.updateClass)
	huma.Register(api, op("delete-class", http.MethodDelete, "/classes/{id}", t, "Delete a class session", g.Perm("attendance", "delete")), h.deleteClass)
	huma.Register(api, op("class-roster", http.MethodGet, "/classes/{id}/attendance", t, "Attendance roster", g.Perm("attendance", "view")), h.roster)
	huma.Register(api, op("mark-class-attendance", http.MethodPut, "/classes/{id}/attendance", t, "Mark attendance", g.Perm("attendance", "edit")), h.markClass)
	huma.Register(api, op("start-class-qr", http.MethodPost, "/classes/{id}/qr", t, "Start a 10-minute QR check-in", g.Perm("attendance", "edit")), h.startQR)
	huma.Register(api, op("student-checkin", http.MethodPost, "/me/attendance/checkin", t, "Student QR check-in", g.Student(), g.RateLimit("checkin", 30, time.Minute)), h.checkin)
	huma.Register(api, op("my-attendance", http.MethodGet, "/me/attendance", t, "My offline class attendance", g.Student()), h.myAttendance)
}

func (h *Handler) listClasses(ctx context.Context, in *idPath) (*Out[[]dto.ClassSession], error) {
	id, err := parseID(in.ID, "batch")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Attendance.Classes(ctx, actor(ctx), id))
}

func (h *Handler) createClass(ctx context.Context, in *idBody[dto.ClassInput]) (*Out[dto.ClassSession], error) {
	id, err := parseID(in.ID, "batch")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Attendance.CreateClass(ctx, actor(ctx), id, in.Body))
}

func (h *Handler) updateClass(ctx context.Context, in *idBody[dto.ClassInput]) (*Out[dto.ClassSession], error) {
	id, err := parseID(in.ID, "class")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Attendance.UpdateClass(ctx, actor(ctx), id, in.Body))
}

func (h *Handler) deleteClass(ctx context.Context, in *idPath) (*struct{}, error) {
	id, err := parseID(in.ID, "class")
	if err != nil {
		return nil, err
	}
	return done(h.s.Attendance.DeleteClass(ctx, actor(ctx), id))
}

func (h *Handler) roster(ctx context.Context, in *idPath) (*Out[[]dto.RosterRow], error) {
	id, err := parseID(in.ID, "class")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Attendance.Roster(ctx, actor(ctx), id))
}

func (h *Handler) markClass(ctx context.Context, in *idBody[dto.AttendanceInput]) (*Out[dto.OK], error) {
	id, err := parseID(in.ID, "class")
	if err != nil {
		return nil, err
	}
	return ack(h.s.Attendance.Mark(ctx, actor(ctx), id, in.Body), "attendance saved")
}

func (h *Handler) startQR(ctx context.Context, in *idPath) (*Out[dto.ClassQR], error) {
	id, err := parseID(in.ID, "class")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Attendance.StartQR(ctx, actor(ctx), id))
}

func (h *Handler) checkin(ctx context.Context, in *bodyIn[dto.CheckinInput]) (*Out[dto.CheckinResult], error) {
	return ok(h.s.Attendance.Checkin(ctx, actor(ctx), in.Body.Token))
}

func (h *Handler) myAttendance(ctx context.Context, _ *noInput) (*Out[[]dto.MyClassAttendance], error) {
	return ok(h.s.Attendance.Mine(ctx, actor(ctx)))
}
