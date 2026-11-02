package handler

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/lms/backend/internal/dto"
)

type staffListIn struct {
	dto.PageQuery
	Q      string `query:"q" maxLength:"100"`
	RoleID string `query:"role_id"`
}

func (h *Handler) staffRoutes(api huma.API) {
	t, g := "Staff & roles", h.g
	huma.Register(api, op("permission-catalog", http.MethodGet, "/permissions/modules", t, "Modules and actions for the permission matrix", g.Staff()), h.catalog)
	huma.Register(api, op("list-roles", http.MethodGet, "/roles", t, "List roles", g.Perm("roles", "view")), h.listRoles)
	huma.Register(api, op("get-role", http.MethodGet, "/roles/{id}", t, "Get a role", g.Perm("roles", "view")), h.getRole)
	huma.Register(api, op("create-role", http.MethodPost, "/roles", t, "Create a role", g.Perm("roles", "create")), h.createRole)
	huma.Register(api, op("update-role", http.MethodPut, "/roles/{id}", t, "Update a role and its permissions", g.Perm("roles", "edit")), h.updateRole)
	huma.Register(api, op("delete-role", http.MethodDelete, "/roles/{id}", t, "Delete a role", g.Perm("roles", "delete")), h.deleteRole)

	huma.Register(api, op("staff-options", http.MethodGet, "/staff/options", t, "Active staff for pickers", g.Staff()), h.staffOptions)
	huma.Register(api, op("list-staff", http.MethodGet, "/staff", t, "List staff users", g.Perm("users", "view")), h.listStaff)
	huma.Register(api, op("get-staff", http.MethodGet, "/staff/{id}", t, "Get a staff user", g.Perm("users", "view")), h.getStaff)
	huma.Register(api, op("create-staff", http.MethodPost, "/staff", t, "Create a staff user (admin / mentor)", g.Perm("users", "create")), h.createStaff)
	huma.Register(api, op("update-staff", http.MethodPut, "/staff/{id}", t, "Update a staff user", g.Perm("users", "edit")), h.updateStaff)
	huma.Register(api, op("delete-staff", http.MethodDelete, "/staff/{id}", t, "Delete a staff user", g.Perm("users", "delete")), h.deleteStaff)
}

func (h *Handler) catalog(ctx context.Context, _ *noInput) (*Out[dto.PermissionCatalog], error) {
	return ok(h.s.Roles.Catalog(), nil)
}

func (h *Handler) listRoles(ctx context.Context, _ *noInput) (*Out[[]dto.Role], error) {
	return ok(h.s.Roles.List(ctx))
}

func (h *Handler) getRole(ctx context.Context, in *idPath) (*Out[dto.Role], error) {
	id, err := parseID(in.ID, "role")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Roles.Get(ctx, id))
}

func (h *Handler) createRole(ctx context.Context, in *bodyIn[dto.RoleInput]) (*Out[dto.Role], error) {
	return ok(h.s.Roles.Create(ctx, actor(ctx), in.Body))
}

func (h *Handler) updateRole(ctx context.Context, in *idBody[dto.RoleInput]) (*Out[dto.Role], error) {
	id, err := parseID(in.ID, "role")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Roles.Update(ctx, actor(ctx), id, in.Body))
}

func (h *Handler) deleteRole(ctx context.Context, in *idPath) (*struct{}, error) {
	id, err := parseID(in.ID, "role")
	if err != nil {
		return nil, err
	}
	return done(h.s.Roles.Delete(ctx, actor(ctx), id))
}

func (h *Handler) staffOptions(ctx context.Context, _ *noInput) (*Out[[]dto.Person], error) {
	return ok(h.s.Staff.Options(ctx))
}

func (h *Handler) listStaff(ctx context.Context, in *staffListIn) (*Out[dto.List[dto.Staff]], error) {
	roleID, err := optID(in.RoleID)
	if err != nil {
		return nil, err
	}
	return ok(h.s.Staff.List(ctx, dto.StaffFilter{PageQuery: in.PageQuery, Q: in.Q, RoleID: roleID}))
}

func (h *Handler) getStaff(ctx context.Context, in *idPath) (*Out[dto.Staff], error) {
	id, err := parseID(in.ID, "staff user")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Staff.Get(ctx, id))
}

func (h *Handler) createStaff(ctx context.Context, in *bodyIn[dto.StaffInput]) (*Out[dto.Staff], error) {
	return ok(h.s.Staff.Create(ctx, actor(ctx), in.Body))
}

func (h *Handler) updateStaff(ctx context.Context, in *idBody[dto.StaffInput]) (*Out[dto.Staff], error) {
	id, err := parseID(in.ID, "staff user")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Staff.Update(ctx, actor(ctx), id, in.Body))
}

func (h *Handler) deleteStaff(ctx context.Context, in *idPath) (*struct{}, error) {
	id, err := parseID(in.ID, "staff user")
	if err != nil {
		return nil, err
	}
	return done(h.s.Staff.Delete(ctx, actor(ctx), id))
}
