-- name: ListRoles :many
SELECT r.*, (SELECT count(*) FROM user_roles ur WHERE ur.role_id = r.id)::int AS user_count
FROM roles r
ORDER BY r.is_system DESC, r.name;

-- name: GetRole :one
SELECT * FROM roles WHERE id = $1;

-- name: GetRoleByName :one
SELECT * FROM roles WHERE name = $1;

-- name: CreateRole :one
INSERT INTO roles (name, description, scoped, sales_scope, is_system) VALUES (@name, @description, @scoped, @sales_scope, @is_system) RETURNING *;

-- name: UpdateRole :one
UPDATE roles SET name = @name, description = @description, scoped = @scoped, sales_scope = @sales_scope, updated_at = now() WHERE id = @id RETURNING *;

-- name: DeleteRole :execrows
DELETE FROM roles WHERE id = $1 AND NOT is_system;

-- name: ListRolePermissions :many
SELECT * FROM role_permissions WHERE role_id = $1 ORDER BY module, action;

-- name: ListAllRolePermissions :many
SELECT * FROM role_permissions ORDER BY role_id, module, action;

-- name: ClearRolePermissions :exec
DELETE FROM role_permissions WHERE role_id = $1;

-- name: AddRolePermission :exec
INSERT INTO role_permissions (role_id, module, action) VALUES (@role_id, @module, @action) ON CONFLICT DO NOTHING;

-- name: ListUserRoles :many
SELECT r.* FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = $1 ORDER BY r.name;

-- name: ClearUserRoles :exec
DELETE FROM user_roles WHERE user_id = $1;

-- name: AddUserRole :exec
INSERT INTO user_roles (user_id, role_id) VALUES (@user_id, @role_id) ON CONFLICT DO NOTHING;

-- name: GetUserPermissions :many
SELECT DISTINCT rp.module, rp.action
FROM role_permissions rp JOIN user_roles ur ON ur.role_id = rp.role_id
WHERE ur.user_id = $1;

-- name: UserIsScoped :one
SELECT COALESCE(bool_and(r.scoped), false)::boolean
FROM roles r JOIN user_roles ur ON ur.role_id = r.id
WHERE ur.user_id = $1;
