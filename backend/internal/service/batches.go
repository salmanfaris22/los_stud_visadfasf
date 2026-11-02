package service

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/lms/backend/internal/apperr"
	"github.com/lms/backend/internal/auth"
	"github.com/lms/backend/internal/dto"
	"github.com/lms/backend/internal/repository"
)

// BatchService manages batch types (Online, Offline…), batches and their members.
type BatchService struct{ base }

const dateLayout = "2006-01-02"

func dateStr(t *time.Time) string {
	if t == nil {
		return ""
	}
	return t.Format(dateLayout)
}

func parseDate(s string) (*time.Time, error) {
	if s == "" {
		return nil, nil
	}
	t, err := time.Parse(dateLayout, s)
	if err != nil {
		return nil, apperr.Invalid("dates must look like 2026-01-31")
	}
	return &t, nil
}

func (s *BatchService) ListTypes(ctx context.Context) ([]dto.BatchType, error) {
	rows, err := s.Q.ListBatchTypes(ctx)
	if err != nil {
		return nil, dbErr(err, "batch types")
	}
	out := make([]dto.BatchType, 0, len(rows))
	for _, r := range rows {
		out = append(out, dto.BatchType{ID: r.ID, Name: r.Name, IsOffline: r.IsOffline, Color: r.Color, BatchCount: r.BatchCount})
	}
	return out, nil
}

func (s *BatchService) CreateType(ctx context.Context, actor *auth.Principal, in dto.BatchTypeInput) (dto.BatchType, error) {
	t, err := s.Q.CreateBatchType(ctx, repository.CreateBatchTypeParams{Name: strings.TrimSpace(in.Name), IsOffline: in.IsOffline, Color: orDefault(in.Color, "#6366f1")})
	if err != nil {
		return dto.BatchType{}, dbErr(err, "batch type")
	}
	s.audit.Log(ctx, actor, "create", "batch_type", t.ID, in)
	return dto.BatchType{ID: t.ID, Name: t.Name, IsOffline: t.IsOffline, Color: t.Color}, nil
}

func (s *BatchService) UpdateType(ctx context.Context, actor *auth.Principal, id uuid.UUID, in dto.BatchTypeInput) (dto.BatchType, error) {
	t, err := s.Q.UpdateBatchType(ctx, repository.UpdateBatchTypeParams{ID: id, Name: strings.TrimSpace(in.Name), IsOffline: in.IsOffline, Color: orDefault(in.Color, "#6366f1")})
	if err != nil {
		return dto.BatchType{}, dbErr(err, "batch type")
	}
	s.audit.Log(ctx, actor, "update", "batch_type", id, in)
	return dto.BatchType{ID: t.ID, Name: t.Name, IsOffline: t.IsOffline, Color: t.Color}, nil
}

func (s *BatchService) DeleteType(ctx context.Context, actor *auth.Principal, id uuid.UUID) error {
	if err := s.Q.DeleteBatchType(ctx, id); err != nil {
		return dbErr(err, "batch type")
	}
	s.audit.Log(ctx, actor, "delete", "batch_type", id, nil)
	return nil
}

func (s *BatchService) Options(ctx context.Context, courseID *uuid.UUID) ([]dto.BatchOption, error) {
	rows, err := s.Q.BatchOptions(ctx, courseID)
	if err != nil {
		return nil, dbErr(err, "batches")
	}
	out := make([]dto.BatchOption, 0, len(rows))
	for _, r := range rows {
		out = append(out, dto.BatchOption{ID: r.ID, Name: r.Name, CourseID: r.CourseID, CourseTitle: r.CourseTitle})
	}
	return out, nil
}

func (s *BatchService) List(ctx context.Context, actor *auth.Principal, f dto.BatchFilter) (dto.List[dto.Batch], error) {
	rows, err := s.Q.ListBatches(ctx, repository.ListBatchesParams{CourseID: f.CourseID, Status: optStr(f.Status), Q: optStr(f.Q), MentorID: actor.MentorScope(), Lim: f.Lim(), Off: f.Off()})
	if err != nil {
		return dto.List[dto.Batch]{}, dbErr(err, "batches")
	}
	out := make([]dto.Batch, 0, len(rows))
	var total int64
	for _, r := range rows {
		total = r.TotalCount
		out = append(out, dto.Batch{ID: r.ID, CourseID: r.CourseID, CourseTitle: r.CourseTitle, BatchTypeID: r.BatchTypeID, TypeName: r.TypeName, TypeColor: r.TypeColor,
			IsOffline: r.IsOffline, Name: r.Name, StartDate: dateStr(r.StartDate), EndDate: dateStr(r.EndDate), Capacity: r.Capacity, Location: r.Location,
			ScheduleNote: r.ScheduleNote, Status: r.Status, StudentCount: r.StudentCount, CreatedAt: r.CreatedAt})
	}
	return dto.NewList(out, total, f.PageQuery), nil
}

func (s *BatchService) detail(ctx context.Context, id uuid.UUID) (dto.BatchDetail, error) {
	r, err := s.Q.GetBatch(ctx, id)
	if err != nil {
		return dto.BatchDetail{}, dbErr(err, "batch")
	}
	mentors, err := s.Q.ListBatchMentors(ctx, id)
	if err != nil {
		return dto.BatchDetail{}, dbErr(err, "batch")
	}
	students, err := s.Q.ListBatchStudents(ctx, &id)
	if err != nil {
		return dto.BatchDetail{}, dbErr(err, "batch")
	}
	out := dto.BatchDetail{
		Batch: dto.Batch{ID: r.ID, CourseID: r.CourseID, CourseTitle: r.CourseTitle, BatchTypeID: r.BatchTypeID, TypeName: r.TypeName, TypeColor: r.TypeColor,
			IsOffline: r.IsOffline, Name: r.Name, StartDate: dateStr(r.StartDate), EndDate: dateStr(r.EndDate), Capacity: r.Capacity, Location: r.Location,
			ScheduleNote: r.ScheduleNote, Status: r.Status, StudentCount: int32(len(students)), CreatedAt: r.CreatedAt},
		Mentors: make([]dto.Person, 0, len(mentors)), Students: make([]dto.BatchStudent, 0, len(students)),
	}
	for _, m := range mentors {
		out.Mentors = append(out.Mentors, dto.Person{ID: m.ID, Name: m.Name, Email: m.Email, AvatarURL: str(m.AvatarUrl)})
	}
	for _, st := range students {
		out.Students = append(out.Students, dto.BatchStudent{ID: st.ID, Name: st.Name, Email: st.Email, StudentCode: str(st.StudentCode), AvatarURL: str(st.AvatarUrl),
			EnrollmentID: st.EnrollmentID, EnrollmentStatus: st.EnrollmentStatus, TotalTasks: st.TotalTasks, ApprovedTasks: st.ApprovedTasks,
			ProgressPct: pct(st.ApprovedTasks, st.TotalTasks)})
	}
	return out, nil
}

func (s *BatchService) Get(ctx context.Context, actor *auth.Principal, id uuid.UUID) (dto.BatchDetail, error) {
	if err := s.access.EnsureBatch(ctx, actor, id); err != nil {
		return dto.BatchDetail{}, err
	}
	return s.detail(ctx, id)
}

func (s *BatchService) validate(ctx context.Context, actor *auth.Principal, in dto.BatchInput) (start, end *time.Time, err error) {
	if start, err = parseDate(in.StartDate); err != nil {
		return
	}
	if end, err = parseDate(in.EndDate); err != nil {
		return
	}
	if start != nil && end != nil && end.Before(*start) {
		return nil, nil, apperr.Invalid("end date is before start date")
	}
	if _, e := s.Q.GetBatchType(ctx, in.BatchTypeID); e != nil {
		return nil, nil, dbErr(e, "batch type")
	}
	if _, e := s.Q.GetCourse(ctx, in.CourseID); e != nil {
		return nil, nil, dbErr(e, "course")
	}
	return start, end, s.access.EnsureCourse(ctx, actor, in.CourseID)
}

func (s *BatchService) Create(ctx context.Context, actor *auth.Principal, in dto.BatchInput) (dto.BatchDetail, error) {
	start, end, err := s.validate(ctx, actor, in)
	if err != nil {
		return dto.BatchDetail{}, err
	}
	var b repository.Batch
	err = s.tx(ctx, func(q *repository.Queries) error {
		if b, err = q.CreateBatch(ctx, repository.CreateBatchParams{CourseID: in.CourseID, BatchTypeID: in.BatchTypeID, Name: strings.TrimSpace(in.Name),
			StartDate: start, EndDate: end, Capacity: in.Capacity, Location: in.Location, ScheduleNote: in.ScheduleNote, Status: orDefault(in.Status, "upcoming")}); err != nil {
			return err
		}
		if len(in.MentorIDs) > 0 {
			return q.AddBatchMentors(ctx, repository.AddBatchMentorsParams{BatchID: b.ID, UserIds: in.MentorIDs})
		}
		return nil
	})
	if err != nil {
		return dto.BatchDetail{}, dbErr(err, "batch")
	}
	s.access.Invalidate(nil)
	s.audit.Log(ctx, actor, "create", "batch", b.ID, in)
	return s.detail(ctx, b.ID)
}

func (s *BatchService) Update(ctx context.Context, actor *auth.Principal, id uuid.UUID, in dto.BatchInput) (dto.BatchDetail, error) {
	if err := s.access.EnsureBatch(ctx, actor, id); err != nil {
		return dto.BatchDetail{}, err
	}
	start, end, err := s.validate(ctx, actor, in)
	if err != nil {
		return dto.BatchDetail{}, err
	}
	err = s.tx(ctx, func(q *repository.Queries) error {
		if _, err := q.UpdateBatch(ctx, repository.UpdateBatchParams{ID: id, CourseID: in.CourseID, BatchTypeID: in.BatchTypeID, Name: strings.TrimSpace(in.Name),
			StartDate: start, EndDate: end, Capacity: in.Capacity, Location: in.Location, ScheduleNote: in.ScheduleNote, Status: orDefault(in.Status, "upcoming")}); err != nil {
			return err
		}
		if in.MentorIDs != nil {
			if err := q.ClearBatchMentors(ctx, id); err != nil {
				return err
			}
			if len(in.MentorIDs) > 0 {
				return q.AddBatchMentors(ctx, repository.AddBatchMentorsParams{BatchID: id, UserIds: in.MentorIDs})
			}
		}
		return nil
	})
	if err != nil {
		return dto.BatchDetail{}, dbErr(err, "batch")
	}
	s.access.Invalidate(nil)
	s.audit.Log(ctx, actor, "update", "batch", id, in)
	return s.detail(ctx, id)
}

func (s *BatchService) Delete(ctx context.Context, actor *auth.Principal, id uuid.UUID) error {
	if err := s.access.EnsureBatch(ctx, actor, id); err != nil {
		return err
	}
	if err := s.Q.DeleteBatch(ctx, id); err != nil {
		return dbErr(err, "batch")
	}
	s.audit.Log(ctx, actor, "delete", "batch", id, nil)
	return nil
}

// AddStudents enrolls students into the batch's course and puts them in this batch.
func (s *BatchService) AddStudents(ctx context.Context, actor *auth.Principal, id uuid.UUID, studentIDs []uuid.UUID) (dto.BatchDetail, error) {
	if err := s.access.EnsureBatch(ctx, actor, id); err != nil {
		return dto.BatchDetail{}, err
	}
	b, err := s.Q.GetBatch(ctx, id)
	if err != nil {
		return dto.BatchDetail{}, dbErr(err, "batch")
	}
	added := make([]uuid.UUID, 0, len(studentIDs))
	err = s.tx(ctx, func(q *repository.Queries) error {
		for _, sid := range studentIDs {
			if u, err := q.GetUserByID(ctx, sid); err != nil || u.Kind != auth.KindStudent {
				continue
			}
			if _, err := q.UpsertEnrollment(ctx, repository.UpsertEnrollmentParams{StudentID: sid, CourseID: b.CourseID, BatchID: &id, AssignedBy: &actor.ID}); err != nil {
				return err
			}
			added = append(added, sid)
		}
		return nil
	})
	if err != nil {
		return dto.BatchDetail{}, dbErr(err, "enrollment")
	}
	s.notify.Send(ctx, added, "enrollment", "Added to "+b.Name, "You are now part of "+b.Name+" ("+b.CourseTitle+").", "/learn/courses/"+b.CourseID.String())
	s.audit.Log(ctx, actor, "add_students", "batch", id, map[string]int{"count": len(added)})
	return s.detail(ctx, id)
}
