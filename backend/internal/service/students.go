package service

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/lms/backend/internal/apperr"
	"github.com/lms/backend/internal/auth"
	"github.com/lms/backend/internal/dto"
	"github.com/lms/backend/internal/repository"
)

// StudentService manages student accounts, enrollments and CSV import/export.
type StudentService struct{ base }

func toStudent(u repository.User, courses int32) dto.Student {
	return dto.Student{ID: u.ID, Name: u.Name, Email: u.Email, Phone: str(u.Phone), AvatarURL: str(u.AvatarUrl), Status: u.Status,
		StudentCode: str(u.StudentCode), CourseCount: courses, LastLoginAt: u.LastLoginAt, CreatedAt: u.CreatedAt}
}

func (s *StudentService) List(ctx context.Context, actor *auth.Principal, f dto.StudentFilter) (dto.List[dto.Student], error) {
	rows, err := s.Q.ListStudents(ctx, repository.ListStudentsParams{Q: optStr(f.Q), Status: optStr(f.Status), CourseID: f.CourseID, BatchID: f.BatchID,
		MentorID: actor.MentorScope(), Lim: f.Lim(), Off: f.Off()})
	if err != nil {
		return dto.List[dto.Student]{}, dbErr(err, "students")
	}
	out := make([]dto.Student, 0, len(rows))
	var total int64
	for _, r := range rows {
		total = r.TotalCount
		out = append(out, dto.Student{ID: r.ID, Name: r.Name, Email: r.Email, Phone: str(r.Phone), AvatarURL: str(r.AvatarUrl), Status: r.Status,
			StudentCode: str(r.StudentCode), CourseCount: r.CourseCount, LastLoginAt: r.LastLoginAt, CreatedAt: r.CreatedAt})
	}
	return dto.NewList(out, total, f.PageQuery), nil
}

// load fetches a student the actor is allowed to see.
func (s *StudentService) load(ctx context.Context, actor *auth.Principal, id uuid.UUID) (repository.User, error) {
	u, err := s.Q.GetUserByID(ctx, id)
	if err != nil || u.Kind != auth.KindStudent {
		return u, apperr.NotFound("student")
	}
	return u, s.access.EnsureStudent(ctx, actor, id)
}

// Enrollments returns a student's courses with progress (shared with the portal).
func (b base) enrollments(ctx context.Context, studentID uuid.UUID) ([]dto.Enrollment, error) {
	rows, err := b.Q.ListStudentEnrollments(ctx, studentID)
	if err != nil {
		return nil, dbErr(err, "enrollments")
	}
	out := make([]dto.Enrollment, 0, len(rows))
	for _, r := range rows {
		out = append(out, dto.Enrollment{ID: r.ID, CourseID: r.CourseID, CourseTitle: r.CourseTitle, CourseSlug: r.CourseSlug, CourseThumbnail: r.CourseThumbnail,
			BatchID: r.BatchID, BatchName: str(r.BatchName), Status: r.Status, EnrolledAt: r.EnrolledAt, CompletedAt: r.CompletedAt,
			TotalTasks: r.TotalTasks, ApprovedTasks: r.ApprovedTasks, ProgressPct: pct(r.ApprovedTasks, r.TotalTasks)})
	}
	return out, nil
}

func (s *StudentService) detail(ctx context.Context, u repository.User) (dto.StudentDetail, error) {
	en, err := s.enrollments(ctx, u.ID)
	if err != nil {
		return dto.StudentDetail{}, err
	}
	return dto.StudentDetail{Student: toStudent(u, int32(len(en))), Bio: str(u.Bio), Enrollments: en}, nil
}

func (s *StudentService) Get(ctx context.Context, actor *auth.Principal, id uuid.UUID) (dto.StudentDetail, error) {
	u, err := s.load(ctx, actor, id)
	if err != nil {
		return dto.StudentDetail{}, err
	}
	return s.detail(ctx, u)
}

// checkEnrollment validates the course/batch pair and the actor's scope.
func (s *StudentService) checkEnrollment(ctx context.Context, actor *auth.Principal, e dto.EnrollInput) error {
	if _, err := s.Q.GetCourse(ctx, e.CourseID); err != nil {
		return dbErr(err, "course")
	}
	if err := s.access.EnsureCourse(ctx, actor, e.CourseID); err != nil {
		return err
	}
	if e.BatchID != nil {
		b, err := s.Q.GetBatch(ctx, *e.BatchID)
		if err != nil {
			return dbErr(err, "batch")
		}
		if b.CourseID != e.CourseID {
			return apperr.Invalid("batch %q belongs to another course", b.Name)
		}
	}
	return nil
}

func (s *StudentService) Create(ctx context.Context, actor *auth.Principal, in dto.StudentInput) (dto.StudentDetail, error) {
	for _, e := range in.Enrollments {
		if err := s.checkEnrollment(ctx, actor, e); err != nil {
			return dto.StudentDetail{}, err
		}
	}
	if actor.MentorScope() != nil && len(in.Enrollments) == 0 {
		return dto.StudentDetail{}, apperr.Invalid("assign at least one of your courses")
	}
	hash, invite, err := passwordOrInvite(in.Password)
	if err != nil {
		return dto.StudentDetail{}, err
	}
	var u repository.User
	err = s.tx(ctx, func(q *repository.Queries) error {
		if u, err = q.CreateUser(ctx, repository.CreateUserParams{Kind: auth.KindStudent, Email: strings.TrimSpace(in.Email), PasswordHash: &hash,
			Name: strings.TrimSpace(in.Name), Phone: optStr(in.Phone), Status: orDefault(in.Status, "active")}); err != nil {
			return err
		}
		for _, e := range in.Enrollments {
			if _, err := q.UpsertEnrollment(ctx, repository.UpsertEnrollmentParams{StudentID: u.ID, CourseID: e.CourseID, BatchID: e.BatchID, AssignedBy: &actor.ID}); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return dto.StudentDetail{}, dbErr(err, "a student with this email")
	}
	if invite {
		s.sendInvite(ctx, u, s.Cfg.StudentAppURL)
	}
	if len(in.Enrollments) > 0 {
		s.notify.Send(ctx, []uuid.UUID{u.ID}, "enrollment", "New course assigned", "You have been enrolled. Start learning now!", "/learn")
	}
	s.audit.Log(ctx, actor, "create", "student", u.ID, map[string]any{"email": u.Email, "enrollments": in.Enrollments})
	return s.detail(ctx, u)
}

func (s *StudentService) Update(ctx context.Context, actor *auth.Principal, id uuid.UUID, in dto.StudentInput) (dto.StudentDetail, error) {
	cur, err := s.load(ctx, actor, id)
	if err != nil {
		return dto.StudentDetail{}, err
	}
	status := orDefault(in.Status, cur.Status)
	var u repository.User
	err = s.tx(ctx, func(q *repository.Queries) error {
		if u, err = q.UpdateUserAdmin(ctx, repository.UpdateUserAdminParams{ID: id, Name: strings.TrimSpace(in.Name), Email: strings.TrimSpace(in.Email),
			Phone: optStr(in.Phone), Status: status}); err != nil {
			return err
		}
		return applyPasswordAndStatus(ctx, q, id, in.Password, status)
	})
	if err != nil {
		return dto.StudentDetail{}, dbErr(err, "student")
	}
	s.access.Invalidate(&id)
	s.audit.Log(ctx, actor, "update", "student", id, map[string]any{"email": u.Email, "status": status})
	return s.detail(ctx, u)
}

func (s *StudentService) Delete(ctx context.Context, actor *auth.Principal, id uuid.UUID) error {
	u, err := s.load(ctx, actor, id)
	if err != nil {
		return err
	}
	if _, err := s.Q.DeleteUserOfKind(ctx, repository.DeleteUserOfKindParams{ID: id, Kind: auth.KindStudent}); err != nil {
		return dbErr(err, "student")
	}
	s.access.Invalidate(&id)
	s.audit.Log(ctx, actor, "delete", "student", id, map[string]string{"email": u.Email, "name": u.Name})
	return nil
}

func (s *StudentService) Enroll(ctx context.Context, actor *auth.Principal, id uuid.UUID, in dto.EnrollInput) (dto.StudentDetail, error) {
	u, err := s.load(ctx, actor, id)
	if err != nil {
		return dto.StudentDetail{}, err
	}
	if err := s.checkEnrollment(ctx, actor, in); err != nil {
		return dto.StudentDetail{}, err
	}
	if _, err := s.Q.UpsertEnrollment(ctx, repository.UpsertEnrollmentParams{StudentID: id, CourseID: in.CourseID, BatchID: in.BatchID, AssignedBy: &actor.ID}); err != nil {
		return dto.StudentDetail{}, dbErr(err, "enrollment")
	}
	c, _ := s.Q.GetCourse(ctx, in.CourseID)
	s.notify.Send(ctx, []uuid.UUID{id}, "enrollment", "New course: "+c.Title, "You now have access to "+c.Title+".", "/learn/courses/"+c.ID.String())
	s.audit.Log(ctx, actor, "enroll", "student", id, in)
	return s.detail(ctx, u)
}

func (s *StudentService) loadEnrollment(ctx context.Context, actor *auth.Principal, id uuid.UUID) (repository.Enrollment, error) {
	e, err := s.Q.GetEnrollment(ctx, id)
	if err != nil {
		return e, dbErr(err, "enrollment")
	}
	return e, s.access.EnsureCourse(ctx, actor, e.CourseID)
}

func (s *StudentService) UpdateEnrollment(ctx context.Context, actor *auth.Principal, id uuid.UUID, in dto.EnrollmentUpdate) error {
	e, err := s.loadEnrollment(ctx, actor, id)
	if err != nil {
		return err
	}
	if err := s.checkEnrollment(ctx, actor, dto.EnrollInput{CourseID: e.CourseID, BatchID: in.BatchID}); err != nil {
		return err
	}
	if _, err := s.Q.UpdateEnrollment(ctx, repository.UpdateEnrollmentParams{ID: id, BatchID: in.BatchID, Status: in.Status}); err != nil {
		return dbErr(err, "enrollment")
	}
	s.audit.Log(ctx, actor, "update", "enrollment", id, in)
	return nil
}

func (s *StudentService) DeleteEnrollment(ctx context.Context, actor *auth.Principal, id uuid.UUID) error {
	e, err := s.loadEnrollment(ctx, actor, id)
	if err != nil {
		return err
	}
	if err := s.Q.DeleteEnrollment(ctx, id); err != nil {
		return dbErr(err, "enrollment")
	}
	s.audit.Log(ctx, actor, "delete", "enrollment", id, map[string]string{"student": e.StudentID.String(), "course": e.CourseID.String()})
	return nil
}

func (s *StudentService) Export(ctx context.Context, actor *auth.Principal) (dto.File, error) {
	rows, err := s.Q.ListStudentsForExport(ctx, actor.MentorScope())
	if err != nil {
		return dto.File{}, dbErr(err, "students")
	}
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	_ = w.Write([]string{"student_code", "name", "email", "phone", "status", "courses", "joined"})
	for _, r := range rows {
		_ = w.Write([]string{str(r.StudentCode), safeCSV(r.Name), r.Email, safeCSV(str(r.Phone)), r.Status, safeCSV(r.Courses), r.CreatedAt.Format("2006-01-02")})
	}
	w.Flush()
	s.audit.Log(ctx, actor, "export", "student", "", map[string]int{"rows": len(rows)})
	return dto.File{Name: fmt.Sprintf("students-%s.csv", time.Now().Format("2006-01-02")), ContentType: "text/csv; charset=utf-8", Data: buf.Bytes()}, nil
}

// Import creates students from CSV text (header: name,email,phone,password). Existing emails are skipped.
func (s *StudentService) Import(ctx context.Context, actor *auth.Principal, in dto.ImportInput) (dto.ImportResult, error) {
	var enroll *dto.EnrollInput
	if in.CourseID != nil {
		enroll = &dto.EnrollInput{CourseID: *in.CourseID, BatchID: in.BatchID}
		if err := s.checkEnrollment(ctx, actor, *enroll); err != nil {
			return dto.ImportResult{}, err
		}
	} else if actor.MentorScope() != nil {
		return dto.ImportResult{}, apperr.Invalid("choose one of your courses for imported students")
	}
	r := csv.NewReader(strings.NewReader(in.CSV))
	r.TrimLeadingSpace, r.FieldsPerRecord = true, -1
	header, err := r.Read()
	if err != nil {
		return dto.ImportResult{}, apperr.Invalid("could not read the CSV header")
	}
	col := map[string]int{}
	for i, h := range header {
		col[strings.ToLower(strings.TrimSpace(strings.TrimPrefix(h, "\uFEFF")))] = i
	}
	if _, ok := col["email"]; !ok {
		return dto.ImportResult{}, apperr.Invalid("CSV needs an 'email' column (plus 'name', optional 'phone' and 'password')")
	}
	val := func(rec []string, k string) string {
		if i, ok := col[k]; ok && i < len(rec) {
			return strings.TrimSpace(rec[i])
		}
		return ""
	}
	res := dto.ImportResult{Errors: []string{}}
	for line := 2; ; line++ {
		rec, err := r.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			res.Errors = append(res.Errors, fmt.Sprintf("line %d: %v", line, err))
			continue
		}
		if line > 5001 {
			res.Errors = append(res.Errors, "stopped after 5000 rows")
			break
		}
		email, name := strings.ToLower(val(rec, "email")), val(rec, "name")
		if !strings.Contains(email, "@") {
			res.Errors = append(res.Errors, fmt.Sprintf("line %d: invalid email", line))
			continue
		}
		if _, err := s.Q.GetUserByEmail(ctx, email); err == nil {
			res.Skipped++
			continue
		}
		hash, invite, err := passwordOrInvite(val(rec, "password"))
		if err != nil {
			res.Errors = append(res.Errors, fmt.Sprintf("line %d: %v", line, err))
			continue
		}
		u, err := s.Q.CreateUser(ctx, repository.CreateUserParams{Kind: auth.KindStudent, Email: email, PasswordHash: &hash,
			Name: orDefault(name, strings.Split(email, "@")[0]), Phone: optStr(val(rec, "phone")), Status: "active"})
		if err != nil {
			res.Errors = append(res.Errors, fmt.Sprintf("line %d: %v", line, dbErr(err, "student")))
			continue
		}
		if enroll != nil {
			_, _ = s.Q.UpsertEnrollment(ctx, repository.UpsertEnrollmentParams{StudentID: u.ID, CourseID: enroll.CourseID, BatchID: enroll.BatchID, AssignedBy: &actor.ID})
		}
		if invite && in.SendInvites {
			s.sendInvite(ctx, u, s.Cfg.StudentAppURL)
		}
		res.Created++
	}
	s.audit.Log(ctx, actor, "import", "student", "", res)
	return res, nil
}

