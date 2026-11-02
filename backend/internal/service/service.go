// Package service contains all business logic. Services receive plain inputs (dto types),
// talk to the database through the repository package and return dto results or apperr
// errors. They never import HTTP or framework packages, so they are easy to test and reuse.
package service

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/lms/backend/internal/auth"
	"github.com/lms/backend/internal/config"
	"github.com/lms/backend/internal/dto"
	"github.com/lms/backend/internal/platform/google"
	"github.com/lms/backend/internal/platform/mailer"
	"github.com/lms/backend/internal/platform/realtime"
	"github.com/lms/backend/internal/platform/storage"
	"github.com/lms/backend/internal/repository"
)

// Deps are the infrastructure dependencies shared by every service.
type Deps struct {
	Cfg     *config.Config
	Pool    *pgxpool.Pool
	Q       *repository.Queries
	Redis   *redis.Client
	Store   *storage.Store
	Mail    *mailer.Mailer
	Hub     *realtime.Hub
	Google  *google.Client
	Tokens  *auth.Tokens
	Cookies auth.CookieFactory
}

// Services is the container handed to the HTTP layer.
type Services struct {
	Access        *AccessService
	Audit         *AuditService
	Notify        *NotificationService
	Settings      *SettingsService
	Auth          *AuthService
	Staff         *StaffService
	Roles         *RoleService
	Students      *StudentService
	Courses       *CourseService
	Batches       *BatchService
	Attendance    *AttendanceService
	Uploads       *UploadService
	Submissions   *SubmissionService
	Certificates  *CertificateService
	Live          *LiveService
	Quizzes       *QuizService
	Comments      *CommentService
	Announcements *AnnouncementService
	Portal        *PortalService
	Site          *SiteService
	Analytics     *AnalyticsService
	Leads         *LeadService
}

// New wires every service. Shared helpers (access, audit, notify, settings) are built first.
func New(d *Deps) *Services {
	if d.Pool != nil && d.Q == nil {
		d.Q = repository.New(d.Pool)
	}
	s := &Services{}
	s.Settings = &SettingsService{deps: d, cache: newTTLCache[*Settings](settingsTTL), sales: newTTLCache[*dto.SalesSettings](settingsTTL), wa: newTTLCache[*WAConn](settingsTTL)}
	s.Access = &AccessService{deps: d, cache: newTTLCache[*auth.Principal](principalTTL)}
	s.Audit = &AuditService{deps: d}
	s.Settings.audit = s.Audit
	s.Notify = &NotificationService{deps: d}
	b := base{Deps: d, access: s.Access, audit: s.Audit, notify: s.Notify, settings: s.Settings}

	s.Auth = &AuthService{base: b}
	s.Staff = &StaffService{base: b}
	s.Roles = &RoleService{base: b}
	s.Students = &StudentService{base: b}
	s.Courses = &CourseService{base: b}
	s.Batches = &BatchService{base: b}
	s.Attendance = &AttendanceService{base: b}
	s.Uploads = &UploadService{base: b}
	s.Certificates = &CertificateService{base: b}
	s.Submissions = &SubmissionService{base: b, certs: s.Certificates}
	s.Live = &LiveService{base: b}
	s.Quizzes = &QuizService{base: b}
	s.Comments = &CommentService{base: b}
	s.Announcements = &AnnouncementService{base: b}
	s.Portal = &PortalService{base: b, submissions: s.Submissions, live: s.Live, announcements: s.Announcements, certificates: s.Certificates, quizzes: s.Quizzes}
	s.Leads = &LeadService{base: b} // commissions wired when commissions.go lands
	s.Site = &SiteService{base: b, leads: s.Leads}
	s.Analytics = &AnalyticsService{base: b}
	return s
}

// base is embedded by every domain service.
type base struct {
	*Deps
	access   *AccessService
	audit    *AuditService
	notify   *NotificationService
	settings *SettingsService
}

// tx runs fn inside a database transaction.
func (b base) tx(ctx context.Context, fn func(q *repository.Queries) error) error {
	t, err := b.Pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer func() { _ = t.Rollback(ctx) }()
	if err := fn(b.Q.WithTx(t)); err != nil {
		return err
	}
	return t.Commit(ctx)
}
