package service

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/lms/backend/internal/apperr"
	"github.com/lms/backend/internal/auth"
	"github.com/lms/backend/internal/dto"
	"github.com/lms/backend/internal/platform/secure"
	"github.com/lms/backend/internal/repository"
)

// AttendanceService handles offline class sessions, manual marking and QR check-in.
type AttendanceService struct{ base }

const qrValidity = 10 * time.Minute

func toClass(c repository.ClassSession, present int32) dto.ClassSession {
	active := c.QrToken != nil && c.QrExpiresAt != nil && time.Now().Before(*c.QrExpiresAt)
	return dto.ClassSession{ID: c.ID, BatchID: c.BatchID, Title: c.Title, StartsAt: c.StartsAt, EndsAt: c.EndsAt, PresentCount: present, QRActive: active, QRExpiresAt: c.QrExpiresAt}
}

func (s *AttendanceService) Classes(ctx context.Context, actor *auth.Principal, batchID uuid.UUID) ([]dto.ClassSession, error) {
	if err := s.access.EnsureBatch(ctx, actor, batchID); err != nil {
		return nil, err
	}
	rows, err := s.Q.ListBatchClasses(ctx, batchID)
	if err != nil {
		return nil, dbErr(err, "classes")
	}
	out := make([]dto.ClassSession, 0, len(rows))
	for _, r := range rows {
		out = append(out, toClass(repository.ClassSession{ID: r.ID, BatchID: r.BatchID, Title: r.Title, StartsAt: r.StartsAt, EndsAt: r.EndsAt, QrToken: r.QrToken, QrExpiresAt: r.QrExpiresAt}, r.PresentCount))
	}
	return out, nil
}

func validClass(in dto.ClassInput) error {
	if !in.EndsAt.After(in.StartsAt) {
		return apperr.Invalid("end time must be after start time")
	}
	return nil
}

func (s *AttendanceService) CreateClass(ctx context.Context, actor *auth.Principal, batchID uuid.UUID, in dto.ClassInput) (dto.ClassSession, error) {
	if err := s.access.EnsureBatch(ctx, actor, batchID); err != nil {
		return dto.ClassSession{}, err
	}
	if err := validClass(in); err != nil {
		return dto.ClassSession{}, err
	}
	c, err := s.Q.CreateClassSession(ctx, repository.CreateClassSessionParams{BatchID: batchID, Title: strings.TrimSpace(in.Title), StartsAt: in.StartsAt, EndsAt: in.EndsAt, CreatedBy: &actor.ID})
	if err != nil {
		return dto.ClassSession{}, dbErr(err, "class")
	}
	s.audit.Log(ctx, actor, "create", "class", c.ID, in)
	return toClass(c, 0), nil
}

func (s *AttendanceService) loadClass(ctx context.Context, actor *auth.Principal, id uuid.UUID) (repository.ClassSession, error) {
	c, err := s.Q.GetClassSession(ctx, id)
	if err != nil {
		return c, dbErr(err, "class")
	}
	return c, s.access.EnsureBatch(ctx, actor, c.BatchID)
}

func (s *AttendanceService) UpdateClass(ctx context.Context, actor *auth.Principal, id uuid.UUID, in dto.ClassInput) (dto.ClassSession, error) {
	if _, err := s.loadClass(ctx, actor, id); err != nil {
		return dto.ClassSession{}, err
	}
	if err := validClass(in); err != nil {
		return dto.ClassSession{}, err
	}
	c, err := s.Q.UpdateClassSession(ctx, repository.UpdateClassSessionParams{ID: id, Title: strings.TrimSpace(in.Title), StartsAt: in.StartsAt, EndsAt: in.EndsAt})
	if err != nil {
		return dto.ClassSession{}, dbErr(err, "class")
	}
	s.audit.Log(ctx, actor, "update", "class", id, in)
	return toClass(c, 0), nil
}

func (s *AttendanceService) DeleteClass(ctx context.Context, actor *auth.Principal, id uuid.UUID) error {
	if _, err := s.loadClass(ctx, actor, id); err != nil {
		return err
	}
	if err := s.Q.DeleteClassSession(ctx, id); err != nil {
		return dbErr(err, "class")
	}
	s.audit.Log(ctx, actor, "delete", "class", id, nil)
	return nil
}

func (s *AttendanceService) Roster(ctx context.Context, actor *auth.Principal, classID uuid.UUID) ([]dto.RosterRow, error) {
	c, err := s.loadClass(ctx, actor, classID)
	if err != nil {
		return nil, err
	}
	students, err := s.Q.ListBatchStudents(ctx, &c.BatchID)
	if err != nil {
		return nil, dbErr(err, "roster")
	}
	marks, err := s.Q.ListClassAttendance(ctx, classID)
	if err != nil {
		return nil, dbErr(err, "roster")
	}
	byStudent := map[uuid.UUID]repository.ClassAttendance{}
	for _, a := range marks {
		byStudent[a.StudentID] = a
	}
	out := make([]dto.RosterRow, 0, len(students))
	for _, st := range students {
		row := dto.RosterRow{StudentID: st.ID, Name: st.Name, Email: st.Email, StudentCode: str(st.StudentCode)}
		if a, ok := byStudent[st.ID]; ok {
			t := a.MarkedAt
			row.Status, row.Source, row.MarkedAt = a.Status, a.Source, &t
		}
		out = append(out, row)
	}
	return out, nil
}

func (s *AttendanceService) Mark(ctx context.Context, actor *auth.Principal, classID uuid.UUID, in dto.AttendanceInput) error {
	if _, err := s.loadClass(ctx, actor, classID); err != nil {
		return err
	}
	err := s.tx(ctx, func(q *repository.Queries) error {
		for _, r := range in.Records {
			if err := q.UpsertClassAttendance(ctx, repository.UpsertClassAttendanceParams{ClassID: classID, StudentID: r.StudentID, Status: r.Status, Source: "manual", MarkedBy: &actor.ID}); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return dbErr(err, "attendance")
	}
	s.audit.Log(ctx, actor, "mark", "class_attendance", classID, map[string]int{"records": len(in.Records)})
	return nil
}

// StartQR opens a 10-minute QR check-in window for the class.
func (s *AttendanceService) StartQR(ctx context.Context, actor *auth.Principal, classID uuid.UUID) (dto.ClassQR, error) {
	if _, err := s.loadClass(ctx, actor, classID); err != nil {
		return dto.ClassQR{}, err
	}
	token, exp := secure.Token(18), time.Now().Add(qrValidity)
	if _, err := s.Q.SetClassQR(ctx, repository.SetClassQRParams{ID: classID, QrToken: &token, QrExpiresAt: &exp}); err != nil {
		return dto.ClassQR{}, dbErr(err, "class")
	}
	return dto.ClassQR{Token: token, ExpiresAt: exp, CheckinURL: s.Cfg.StudentAppURL + "/learn/checkin?token=" + token}, nil
}

// Checkin marks the student present (or late after 15 minutes) from a scanned QR code.
func (s *AttendanceService) Checkin(ctx context.Context, student *auth.Principal, token string) (dto.CheckinResult, error) {
	c, err := s.Q.GetClassByQR(ctx, &token)
	if err != nil || c.QrExpiresAt == nil || time.Now().After(*c.QrExpiresAt) {
		return dto.CheckinResult{}, apperr.Invalid("this QR code has expired, ask your mentor for a new one")
	}
	ok, err := s.Q.StudentInBatch(ctx, repository.StudentInBatchParams{StudentID: student.ID, BatchID: &c.BatchID})
	if err != nil {
		return dto.CheckinResult{}, dbErr(err, "batch")
	}
	if !ok {
		return dto.CheckinResult{}, apperr.Forbidden("you are not part of this batch")
	}
	status := "present"
	if time.Now().After(c.StartsAt.Add(15 * time.Minute)) {
		status = "late"
	}
	if err := s.Q.UpsertClassAttendance(ctx, repository.UpsertClassAttendanceParams{ClassID: c.ID, StudentID: student.ID, Status: status, Source: "qr"}); err != nil {
		return dto.CheckinResult{}, dbErr(err, "attendance")
	}
	b, _ := s.Q.GetBatch(ctx, c.BatchID)
	return dto.CheckinResult{ClassTitle: c.Title, BatchName: b.Name, Status: status}, nil
}

// Mine lists a student's offline class attendance.
func (s *AttendanceService) Mine(ctx context.Context, student *auth.Principal) ([]dto.MyClassAttendance, error) {
	rows, err := s.Q.MyClassAttendance(ctx, student.ID)
	if err != nil {
		return nil, dbErr(err, "attendance")
	}
	out := make([]dto.MyClassAttendance, 0, len(rows))
	for _, r := range rows {
		status := str(r.Status)
		if status == "" {
			status = "not marked"
		}
		out = append(out, dto.MyClassAttendance{ClassID: r.ID, Title: r.Title, BatchName: r.BatchName, StartsAt: r.StartsAt, Status: status, MarkedAt: r.MarkedAt})
	}
	return out, nil
}
