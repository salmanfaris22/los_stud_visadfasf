package service

import (
	"context"
	"errors"

	"github.com/google/uuid"

	"github.com/lms/backend/internal/apperr"
	"github.com/lms/backend/internal/auth"
	"github.com/lms/backend/internal/repository"
)

// AccessService loads principals (with a short cache) and enforces mentor scope rules.
type AccessService struct {
	deps  *Deps
	cache *ttlCache[*auth.Principal]
}

var errOutOfScope = apperr.Forbidden("this item is outside the courses and batches assigned to you")

// Load fetches the user, roles and permissions for a token subject.
func (s *AccessService) Load(ctx context.Context, id uuid.UUID, app string) (*auth.Principal, error) {
	key := id.String() + "|" + app
	if p, ok := s.cache.Get(key); ok {
		return p, nil
	}
	u, err := s.deps.Q.GetUserByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if u.Status != "active" {
		return nil, errors.New("account disabled")
	}
	p := &auth.Principal{ID: u.ID, Kind: u.Kind, Name: u.Name, Email: u.Email, Avatar: str(u.AvatarUrl), Super: u.IsSuperAdmin, App: app, Perms: map[string]bool{}}
	if u.Kind == auth.KindStaff && !u.IsSuperAdmin {
		perms, err := s.deps.Q.GetUserPermissions(ctx, id)
		if err != nil {
			return nil, err
		}
		for _, pr := range perms {
			p.Perms[pr.Module+":"+pr.Action] = true
		}
		if p.Scoped, err = s.deps.Q.UserIsScoped(ctx, id); err != nil {
			return nil, err
		}
	}
	if u.Kind == auth.KindStaff {
		sc, err := s.deps.Q.UserSalesScope(ctx, id)
		if err != nil {
			return nil, err
		}
		p.SalesScope, p.TeamID = sc.Scope, sc.TeamID
		if u.IsSuperAdmin {
			p.SalesScope = auth.SalesAll
		}
	}
	s.cache.Set(key, p)
	return p, nil
}

// Invalidate drops cached permissions for one user, or everyone when id is nil.
func (s *AccessService) Invalidate(id *uuid.UUID) {
	if id == nil {
		s.cache.Clear()
		return
	}
	s.cache.Delete(id.String() + "|" + auth.AppAdmin)
	s.cache.Delete(id.String() + "|" + auth.AppStudent)
}

// EnsureCourse checks a scoped mentor may manage the course.
func (s *AccessService) EnsureCourse(ctx context.Context, p *auth.Principal, courseID uuid.UUID) error {
	scope := p.MentorScope()
	if scope == nil {
		return nil
	}
	ok, err := s.deps.Q.CourseInMentorScope(ctx, repository.CourseInMentorScopeParams{CourseID: courseID, MentorID: *scope})
	if err != nil {
		return apperr.DB(err, "course")
	}
	if !ok {
		return errOutOfScope
	}
	return nil
}

// EnsureBatch checks a scoped mentor may manage the batch.
func (s *AccessService) EnsureBatch(ctx context.Context, p *auth.Principal, batchID uuid.UUID) error {
	scope := p.MentorScope()
	if scope == nil {
		return nil
	}
	ok, err := s.deps.Q.BatchInMentorScope(ctx, repository.BatchInMentorScopeParams{BatchID: batchID, MentorID: *scope})
	if err != nil {
		return apperr.DB(err, "batch")
	}
	if !ok {
		return errOutOfScope
	}
	return nil
}

// EnsureStudent checks a scoped mentor may see the student.
func (s *AccessService) EnsureStudent(ctx context.Context, p *auth.Principal, studentID uuid.UUID) error {
	scope := p.MentorScope()
	if scope == nil {
		return nil
	}
	ok, err := s.deps.Q.MentorSeesStudent(ctx, repository.MentorSeesStudentParams{MentorID: *scope, StudentID: studentID})
	if err != nil {
		return apperr.DB(err, "student")
	}
	if !ok {
		return errOutOfScope
	}
	return nil
}

// EnsureEnrolled checks a student can open the course.
func (s *AccessService) EnsureEnrolled(ctx context.Context, p *auth.Principal, courseID uuid.UUID) error {
	ok, err := s.deps.Q.IsEnrolled(ctx, repository.IsEnrolledParams{StudentID: p.ID, CourseID: courseID})
	if err != nil {
		return apperr.DB(err, "enrollment")
	}
	if !ok {
		return apperr.Forbidden("you are not enrolled in this course")
	}
	return nil
}
