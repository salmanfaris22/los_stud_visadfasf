package service

import (
	"context"
	"strings"

	"github.com/google/uuid"

	"github.com/lms/backend/internal/apperr"
	"github.com/lms/backend/internal/auth"
	"github.com/lms/backend/internal/dto"
	"github.com/lms/backend/internal/platform/secure"
	"github.com/lms/backend/internal/repository"
)

// CertificateService issues, lists, renders and verifies completion certificates.
type CertificateService struct{ base }

func (s *CertificateService) verifyURL(code string) string { return s.Cfg.StudentAppURL + "/verify/" + code }

// Issue creates (or restores) the certificate for a student/course and notifies the student.
// The certificate keeps the template it was issued with: the course's template, else the current default.
func (s *CertificateService) Issue(ctx context.Context, studentID, courseID uuid.UUID, issuedBy *uuid.UUID) (repository.Certificate, error) {
	course, err := s.Q.GetCourse(ctx, courseID)
	if err != nil {
		return repository.Certificate{}, dbErr(err, "course")
	}
	tpl := course.CertificateTemplateID
	if tpl == nil {
		tpl = s.defaultTemplateID(ctx)
	}
	c, err := s.Q.IssueCertificate(ctx, repository.IssueCertificateParams{Code: "MS-" + secure.Code(8), StudentID: studentID, CourseID: courseID, IssuedBy: issuedBy, TemplateID: tpl})
	if err != nil {
		return c, dbErr(err, "certificate")
	}
	s.notify.Send(ctx, []uuid.UUID{studentID}, "certificate", "Certificate earned 🎉", "You completed "+course.Title+". Download your certificate.", "/learn/certificates")
	return c, nil
}

// CheckCompletion completes the enrollment and auto-issues a certificate once every task is approved
// (unless the course has certificates turned off).
func (s *CertificateService) CheckCompletion(ctx context.Context, studentID, courseID uuid.UUID) {
	p, err := s.Q.GetEnrollmentProgress(ctx, repository.GetEnrollmentProgressParams{StudentID: studentID, CourseID: courseID})
	if err != nil || p.TotalTasks == 0 || p.ApprovedTasks < p.TotalTasks {
		return
	}
	_ = s.Q.MarkEnrollmentCompleted(ctx, repository.MarkEnrollmentCompletedParams{StudentID: studentID, CourseID: courseID})
	if course, err := s.Q.GetCourse(ctx, courseID); err != nil || !course.CertificateEnabled {
		return
	}
	if c, err := s.Issue(ctx, studentID, courseID, nil); err == nil {
		s.audit.Log(ctx, nil, "auto_issue", "certificate", c.ID, map[string]string{"student": studentID.String(), "course": courseID.String()})
	}
}

func (s *CertificateService) List(ctx context.Context, f dto.CertificateFilter) (dto.List[dto.Certificate], error) {
	rows, err := s.Q.ListCertificates(ctx, repository.ListCertificatesParams{CourseID: f.CourseID, Q: optStr(f.Q), Lim: f.Lim(), Off: f.Off()})
	if err != nil {
		return dto.List[dto.Certificate]{}, dbErr(err, "certificates")
	}
	out := make([]dto.Certificate, 0, len(rows))
	var total int64
	for _, r := range rows {
		total = r.TotalCount
		out = append(out, dto.Certificate{ID: r.ID, Code: r.Code, StudentID: r.StudentID, StudentName: r.StudentName, StudentEmail: r.StudentEmail,
			CourseID: r.CourseID, CourseTitle: r.CourseTitle, IssuedAt: r.IssuedAt, RevokedAt: r.RevokedAt, VerifyURL: s.verifyURL(r.Code)})
	}
	return dto.NewList(out, total, f.PageQuery), nil
}

func (s *CertificateService) IssueManual(ctx context.Context, actor *auth.Principal, in dto.CertificateInput) (dto.Certificate, error) {
	if err := s.access.EnsureCourse(ctx, actor, in.CourseID); err != nil {
		return dto.Certificate{}, err
	}
	ok, err := s.Q.IsEnrolled(ctx, repository.IsEnrolledParams{StudentID: in.StudentID, CourseID: in.CourseID})
	if err != nil {
		return dto.Certificate{}, dbErr(err, "enrollment")
	}
	if !ok {
		return dto.Certificate{}, apperr.Invalid("the student is not enrolled in this course")
	}
	c, err := s.Issue(ctx, in.StudentID, in.CourseID, &actor.ID)
	if err != nil {
		return dto.Certificate{}, err
	}
	s.audit.Log(ctx, actor, "issue", "certificate", c.ID, in)
	r, err := s.Q.GetCertificate(ctx, c.ID)
	if err != nil {
		return dto.Certificate{}, dbErr(err, "certificate")
	}
	return dto.Certificate{ID: r.ID, Code: r.Code, StudentID: r.StudentID, StudentName: r.StudentName, StudentEmail: r.StudentEmail, CourseID: r.CourseID,
		CourseTitle: r.CourseTitle, IssuedAt: r.IssuedAt, RevokedAt: r.RevokedAt, VerifyURL: s.verifyURL(r.Code)}, nil
}

func (s *CertificateService) Revoke(ctx context.Context, actor *auth.Principal, id uuid.UUID) error {
	if err := s.Q.RevokeCertificate(ctx, id); err != nil {
		return dbErr(err, "certificate")
	}
	s.audit.Log(ctx, actor, "revoke", "certificate", id, nil)
	return nil
}

func (s *CertificateService) Mine(ctx context.Context, student *auth.Principal) ([]dto.Certificate, error) {
	rows, err := s.Q.MyCertificates(ctx, student.ID)
	if err != nil {
		return nil, dbErr(err, "certificates")
	}
	out := make([]dto.Certificate, 0, len(rows))
	for _, r := range rows {
		out = append(out, dto.Certificate{ID: r.ID, Code: r.Code, StudentID: r.StudentID, StudentName: student.Name, StudentEmail: student.Email, CourseID: r.CourseID,
			CourseTitle: r.CourseTitle, CourseThumbnail: r.CourseThumbnail, IssuedAt: r.IssuedAt, VerifyURL: s.verifyURL(r.Code)})
	}
	return out, nil
}

// PDF renders a certificate. Students may only download their own, unrevoked certificates.
func (s *CertificateService) PDF(ctx context.Context, actor *auth.Principal, id uuid.UUID) (dto.File, error) {
	r, err := s.Q.GetCertificate(ctx, id)
	if err != nil {
		return dto.File{}, dbErr(err, "certificate")
	}
	if actor.IsStudent() && (r.StudentID != actor.ID || r.RevokedAt != nil) {
		return dto.File{}, apperr.NotFound("certificate")
	}
	name := "certificate-" + r.Code + ".pdf"
	if t, ok := s.templateFor(ctx, r.TemplateID, r.CourseTemplateID); ok {
		v := CertValues{Student: r.StudentName, Course: r.CourseTitle, CourseText: r.CourseCertificateText, Code: r.Code,
			VerifyURL: s.verifyURL(r.Code), Issued: r.IssuedAt.In(s.settings.Location(ctx))}
		raw, err := s.render(ctx, t, v)
		if err != nil {
			return dto.File{}, err
		}
		return dto.File{Name: name, ContentType: "application/pdf", Data: raw}, nil
	}
	// No template at all (every template deleted): the plain built-in layout.
	brand := s.settings.Get(ctx).Branding
	raw, err := RenderCertificatePDF(brand.Name, brand.PrimaryColor, r.StudentName, r.CourseTitle, r.Code, r.IssuedAt, s.verifyURL(r.Code))
	if err != nil {
		return dto.File{}, apperr.Internal(err)
	}
	return dto.File{Name: name, ContentType: "application/pdf", Data: raw}, nil
}

func (s *CertificateService) Verify(ctx context.Context, code string) (dto.CertificateVerification, error) {
	r, err := s.Q.GetCertificateByCode(ctx, strings.ToUpper(strings.TrimSpace(code)))
	if err != nil {
		return dto.CertificateVerification{}, apperr.NotFound("certificate with this code")
	}
	return dto.CertificateVerification{Valid: r.RevokedAt == nil, Code: r.Code, StudentName: r.StudentName, CourseTitle: r.CourseTitle,
		IssuedAt: r.IssuedAt, Issuer: s.settings.Get(ctx).Branding.Name}, nil
}
