package service

import (
	"context"
	"sort"
	"strings"

	"github.com/google/uuid"

	"github.com/lms/backend/internal/apperr"
	"github.com/lms/backend/internal/auth"
	"github.com/lms/backend/internal/dto"
	"github.com/lms/backend/internal/platform/secure"
	"github.com/lms/backend/internal/repository"
)

// StaffService manages admin/mentor accounts and their roles.
type StaffService struct{ base }

func (s *StaffService) Options(ctx context.Context) ([]dto.Person, error) {
	rows, err := s.Q.ListStaffOptions(ctx)
	if err != nil {
		return nil, dbErr(err, "staff")
	}
	out := make([]dto.Person, 0, len(rows))
	for _, r := range rows {
		out = append(out, dto.Person{ID: r.ID, Name: r.Name, Email: r.Email, AvatarURL: str(r.AvatarUrl)})
	}
	return out, nil
}

func (s *StaffService) List(ctx context.Context, f dto.StaffFilter) (dto.List[dto.Staff], error) {
	rows, err := s.Q.ListStaff(ctx, repository.ListStaffParams{Q: optStr(f.Q), RoleID: f.RoleID, Lim: f.Lim(), Off: f.Off()})
	if err != nil {
		return dto.List[dto.Staff]{}, dbErr(err, "staff")
	}
	out := make([]dto.Staff, 0, len(rows))
	var total int64
	for _, r := range rows {
		total = r.TotalCount
		out = append(out, dto.Staff{ID: r.ID, Name: r.Name, Email: r.Email, Phone: str(r.Phone), AvatarURL: str(r.AvatarUrl), Status: r.Status,
			IsSuperAdmin: r.IsSuperAdmin, LastLoginAt: r.LastLoginAt, CreatedAt: r.CreatedAt, RoleNames: r.RoleNames, Roles: []dto.RoleRef{}})
	}
	return dto.NewList(out, total, f.PageQuery), nil
}

func (s *StaffService) toStaff(ctx context.Context, u repository.User) (dto.Staff, error) {
	roles, err := s.Q.ListUserRoles(ctx, u.ID)
	if err != nil {
		return dto.Staff{}, dbErr(err, "staff")
	}
	out := dto.Staff{ID: u.ID, Name: u.Name, Email: u.Email, Phone: str(u.Phone), AvatarURL: str(u.AvatarUrl), Status: u.Status,
		IsSuperAdmin: u.IsSuperAdmin, LastLoginAt: u.LastLoginAt, CreatedAt: u.CreatedAt, RoleNames: []string{}, Roles: []dto.RoleRef{}}
	for _, r := range roles {
		out.Roles = append(out.Roles, dto.RoleRef{ID: r.ID, Name: r.Name})
		out.RoleNames = append(out.RoleNames, r.Name)
	}
	sort.Strings(out.RoleNames)
	return out, nil
}

func (s *StaffService) load(ctx context.Context, id uuid.UUID) (repository.User, error) {
	u, err := s.Q.GetUserByID(ctx, id)
	if err != nil || u.Kind != auth.KindStaff {
		return u, apperr.NotFound("staff user")
	}
	return u, nil
}

func (s *StaffService) Get(ctx context.Context, id uuid.UUID) (dto.Staff, error) {
	u, err := s.load(ctx, id)
	if err != nil {
		return dto.Staff{}, err
	}
	return s.toStaff(ctx, u)
}

// passwordOrInvite returns the hash to store and whether an invite email is needed.
func passwordOrInvite(pw string) (hash string, invite bool, err error) {
	if pw == "" {
		pw, invite = secure.Token(24), true
	} else if len(pw) < 8 {
		return "", false, apperr.Invalid("password must be at least 8 characters")
	}
	hash, err = secure.HashPassword(pw)
	if err != nil {
		return "", false, apperr.Internal(err)
	}
	return hash, invite, nil
}

func (s *StaffService) Create(ctx context.Context, actor *auth.Principal, in dto.StaffInput) (dto.Staff, error) {
	if in.IsSuperAdmin && !actor.Super {
		return dto.Staff{}, apperr.Forbidden("only a super admin can create super admins")
	}
	hash, invite, err := passwordOrInvite(in.Password)
	if err != nil {
		return dto.Staff{}, err
	}
	var u repository.User
	err = s.tx(ctx, func(q *repository.Queries) error {
		if u, err = q.CreateUser(ctx, repository.CreateUserParams{Kind: auth.KindStaff, Email: strings.TrimSpace(in.Email), PasswordHash: &hash,
			Name: strings.TrimSpace(in.Name), Phone: optStr(in.Phone), IsSuperAdmin: in.IsSuperAdmin, Status: orDefault(in.Status, "active")}); err != nil {
			return err
		}
		return setRoles(ctx, q, u.ID, in.RoleIDs)
	})
	if err != nil {
		return dto.Staff{}, dbErr(err, "a user with this email")
	}
	if invite {
		s.sendInvite(ctx, u, s.Cfg.AdminAppURL)
	}
	s.audit.Log(ctx, actor, "create", "staff", u.ID, map[string]any{"email": u.Email, "roles": in.RoleIDs, "super": in.IsSuperAdmin})
	return s.toStaff(ctx, u)
}

func setRoles(ctx context.Context, q *repository.Queries, userID uuid.UUID, roleIDs []uuid.UUID) error {
	if err := q.ClearUserRoles(ctx, userID); err != nil {
		return err
	}
	for _, rid := range roleIDs {
		if err := q.AddUserRole(ctx, repository.AddUserRoleParams{UserID: userID, RoleID: rid}); err != nil {
			return err
		}
	}
	return nil
}

func (s *StaffService) Update(ctx context.Context, actor *auth.Principal, id uuid.UUID, in dto.StaffInput) (dto.Staff, error) {
	cur, err := s.load(ctx, id)
	if err != nil {
		return dto.Staff{}, err
	}
	if (in.IsSuperAdmin || cur.IsSuperAdmin) && !actor.Super {
		return dto.Staff{}, apperr.Forbidden("only a super admin can change super admins")
	}
	status := orDefault(in.Status, cur.Status)
	if cur.IsSuperAdmin && (!in.IsSuperAdmin || status != "active") {
		if n, err := s.Q.CountSuperAdmins(ctx); err != nil {
			return dto.Staff{}, dbErr(err, "staff user")
		} else if n <= 1 {
			return dto.Staff{}, apperr.Conflict("this is the last active super admin")
		}
	}
	var u repository.User
	err = s.tx(ctx, func(q *repository.Queries) error {
		if u, err = q.UpdateUserAdmin(ctx, repository.UpdateUserAdminParams{ID: id, Name: strings.TrimSpace(in.Name), Email: strings.TrimSpace(in.Email),
			Phone: optStr(in.Phone), Status: status, IsSuperAdmin: in.IsSuperAdmin}); err != nil {
			return err
		}
		if err := setRoles(ctx, q, id, in.RoleIDs); err != nil {
			return err
		}
		return applyPasswordAndStatus(ctx, q, id, in.Password, status)
	})
	if err != nil {
		return dto.Staff{}, dbErr(err, "staff user")
	}
	s.access.Invalidate(&id)
	s.audit.Log(ctx, actor, "update", "staff", id, map[string]any{"email": u.Email, "roles": in.RoleIDs, "status": status, "super": in.IsSuperAdmin})
	return s.toStaff(ctx, u)
}

// applyPasswordAndStatus sets a new password when given and ends sessions of disabled users.
func applyPasswordAndStatus(ctx context.Context, q *repository.Queries, id uuid.UUID, password, status string) error {
	if password != "" {
		if len(password) < 8 {
			return apperr.Invalid("password must be at least 8 characters")
		}
		hash, err := secure.HashPassword(password)
		if err != nil {
			return err
		}
		if err := q.SetUserPassword(ctx, repository.SetUserPasswordParams{ID: id, PasswordHash: &hash}); err != nil {
			return err
		}
	}
	if status != "active" {
		return q.RevokeAllUserTokens(ctx, id)
	}
	return nil
}

func (s *StaffService) Delete(ctx context.Context, actor *auth.Principal, id uuid.UUID) error {
	if id == actor.ID {
		return apperr.Conflict("you cannot delete your own account")
	}
	u, err := s.load(ctx, id)
	if err != nil {
		return err
	}
	if u.IsSuperAdmin && !actor.Super {
		return apperr.Forbidden("only a super admin can delete super admins")
	}
	if _, err := s.Q.DeleteUserOfKind(ctx, repository.DeleteUserOfKindParams{ID: id, Kind: auth.KindStaff}); err != nil {
		return dbErr(err, "staff user")
	}
	s.access.Invalidate(&id)
	s.audit.Log(ctx, actor, "delete", "staff", id, map[string]string{"email": u.Email})
	return nil
}
