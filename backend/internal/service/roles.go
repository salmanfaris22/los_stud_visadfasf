package service

import (
	"context"
	"strings"

	"github.com/google/uuid"

	"github.com/lms/backend/internal/apperr"
	"github.com/lms/backend/internal/auth"
	"github.com/lms/backend/internal/dto"
	"github.com/lms/backend/internal/repository"
)

// RoleService manages roles and their permission matrix.
type RoleService struct{ base }

func (s *RoleService) Catalog() dto.PermissionCatalog {
	mods := make([]dto.ModuleDef, 0, len(auth.Modules))
	for _, m := range auth.Modules {
		mods = append(mods, dto.ModuleDef{Key: m.Key, Label: m.Label, Group: m.Group})
	}
	return dto.PermissionCatalog{Modules: mods, Actions: auth.Actions}
}

func (s *RoleService) List(ctx context.Context) ([]dto.Role, error) {
	rows, err := s.Q.ListRoles(ctx)
	if err != nil {
		return nil, dbErr(err, "roles")
	}
	all, err := s.Q.ListAllRolePermissions(ctx)
	if err != nil {
		return nil, dbErr(err, "roles")
	}
	byRole := map[uuid.UUID]map[string][]string{}
	for _, p := range all {
		if byRole[p.RoleID] == nil {
			byRole[p.RoleID] = map[string][]string{}
		}
		byRole[p.RoleID][p.Module] = append(byRole[p.RoleID][p.Module], p.Action)
	}
	out := make([]dto.Role, 0, len(rows))
	for _, r := range rows {
		perms := byRole[r.ID]
		if perms == nil {
			perms = map[string][]string{}
		}
		out = append(out, dto.Role{ID: r.ID, Name: r.Name, Description: r.Description, Scoped: r.Scoped, IsSystem: r.IsSystem, UserCount: r.UserCount, Permissions: perms})
	}
	return out, nil
}

func (s *RoleService) Get(ctx context.Context, id uuid.UUID) (dto.Role, error) {
	r, err := s.Q.GetRole(ctx, id)
	if err != nil {
		return dto.Role{}, dbErr(err, "role")
	}
	return s.toRole(ctx, r)
}

func (s *RoleService) toRole(ctx context.Context, r repository.Role) (dto.Role, error) {
	perms, err := s.Q.ListRolePermissions(ctx, r.ID)
	if err != nil {
		return dto.Role{}, dbErr(err, "role")
	}
	out := dto.Role{ID: r.ID, Name: r.Name, Description: r.Description, Scoped: r.Scoped, IsSystem: r.IsSystem, Permissions: map[string][]string{}}
	for _, p := range perms {
		out.Permissions[p.Module] = append(out.Permissions[p.Module], p.Action)
	}
	return out, nil
}

// ValidatePermissions checks every module/action exists.
func ValidatePermissions(perms map[string][]string) error {
	for mod, acts := range perms {
		if !auth.ValidModule(mod) {
			return apperr.Invalid("unknown module %q", mod)
		}
		for _, a := range acts {
			if !auth.ValidAction(a) {
				return apperr.Invalid("unknown action %q", a)
			}
		}
	}
	return nil
}

// SaveRolePermissions replaces a role's permission set (used by the service and the seeder).
func SaveRolePermissions(ctx context.Context, q *repository.Queries, roleID uuid.UUID, perms map[string][]string) error {
	if err := q.ClearRolePermissions(ctx, roleID); err != nil {
		return err
	}
	for mod, acts := range perms {
		for _, a := range acts {
			if err := q.AddRolePermission(ctx, repository.AddRolePermissionParams{RoleID: roleID, Module: mod, Action: a}); err != nil {
				return err
			}
		}
	}
	return nil
}

func (s *RoleService) Create(ctx context.Context, actor *auth.Principal, in dto.RoleInput) (dto.Role, error) {
	if err := ValidatePermissions(in.Permissions); err != nil {
		return dto.Role{}, err
	}
	var role repository.Role
	err := s.tx(ctx, func(q *repository.Queries) error {
		var err error
		// sales_scope is required by the table; roles made without one see all sales data (the column default).
		params := repository.CreateRoleParams{Name: strings.TrimSpace(in.Name), Description: in.Description, Scoped: in.Scoped, SalesScope: orDefault(in.SalesScope, auth.SalesAll)}
		if role, err = q.CreateRole(ctx, params); err != nil {
			return err
		}
		return SaveRolePermissions(ctx, q, role.ID, in.Permissions)
	})
	if err != nil {
		return dto.Role{}, dbErr(err, "role")
	}
	s.audit.Log(ctx, actor, "create", "role", role.ID, in)
	return s.toRole(ctx, role)
}

func (s *RoleService) Update(ctx context.Context, actor *auth.Principal, id uuid.UUID, in dto.RoleInput) (dto.Role, error) {
	if err := ValidatePermissions(in.Permissions); err != nil {
		return dto.Role{}, err
	}
	var role repository.Role
	err := s.tx(ctx, func(q *repository.Queries) error {
		// An update without sales_scope (e.g. from the v1 roles page) keeps the role's current one.
		cur, err := q.GetRole(ctx, id)
		if err != nil {
			return err
		}
		params := repository.UpdateRoleParams{ID: id, Name: strings.TrimSpace(in.Name), Description: in.Description, Scoped: in.Scoped, SalesScope: orDefault(in.SalesScope, cur.SalesScope)}
		if role, err = q.UpdateRole(ctx, params); err != nil {
			return err
		}
		return SaveRolePermissions(ctx, q, id, in.Permissions)
	})
	if err != nil {
		return dto.Role{}, dbErr(err, "role")
	}
	s.access.Invalidate(nil)
	s.audit.Log(ctx, actor, "update", "role", id, in)
	return s.toRole(ctx, role)
}

func (s *RoleService) Delete(ctx context.Context, actor *auth.Principal, id uuid.UUID) error {
	n, err := s.Q.DeleteRole(ctx, id)
	if err != nil {
		return dbErr(err, "role")
	}
	if n == 0 {
		return apperr.Conflict("built-in roles cannot be deleted")
	}
	s.access.Invalidate(nil)
	s.audit.Log(ctx, actor, "delete", "role", id, nil)
	return nil
}
