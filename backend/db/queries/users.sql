-- name: GetUserByID :one
SELECT * FROM users WHERE id = $1;

-- name: GetUserByEmail :one
SELECT * FROM users WHERE email = lower(@email::text);

-- name: GetUserByGoogleID :one
SELECT * FROM users WHERE google_id = $1;

-- name: CreateUser :one
INSERT INTO users (kind, email, password_hash, name, phone, is_super_admin, status, student_code)
VALUES (@kind::text, lower(@email::text), sqlc.narg('password_hash'), @name, sqlc.narg('phone'), @is_super_admin, @status,
        CASE WHEN @kind::text = 'student' THEN 'STU' || nextval('student_code_seq')::text END)
RETURNING *;

-- name: UpdateOwnProfile :one
UPDATE users
SET name = @name, phone = sqlc.narg('phone'), avatar_url = sqlc.narg('avatar_url'), bio = sqlc.narg('bio'), updated_at = now()
WHERE id = @id
RETURNING *;

-- name: UpdateUserAdmin :one
UPDATE users
SET name = @name, email = lower(@email::text), phone = sqlc.narg('phone'), status = @status,
    is_super_admin = @is_super_admin, updated_at = now()
WHERE id = @id
RETURNING *;

-- name: SetUserPassword :exec
UPDATE users SET password_hash = @password_hash, updated_at = now() WHERE id = @id;

-- name: LinkGoogle :exec
UPDATE users SET google_id = @google_id, avatar_url = COALESCE(avatar_url, sqlc.narg('avatar_url')), updated_at = now()
WHERE id = @id;

-- name: TouchLogin :exec
UPDATE users SET last_login_at = now() WHERE id = $1;

-- name: DeleteUserOfKind :execrows
DELETE FROM users WHERE id = @id AND kind = @kind;

-- name: CountSuperAdmins :one
SELECT count(*)::int FROM users WHERE is_super_admin AND status = 'active';

-- name: ListStaff :many
SELECT u.id, u.email, u.name, u.phone, u.avatar_url, u.status, u.is_super_admin, u.last_login_at, u.created_at,
       COALESCE((SELECT array_agg(r.name ORDER BY r.name)
                   FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                  WHERE ur.user_id = u.id), '{}')::text[] AS role_names,
       count(*) OVER () AS total_count
FROM users u
WHERE u.kind = 'staff'
  AND (sqlc.narg('q')::text IS NULL OR u.name ILIKE '%' || sqlc.narg('q') || '%' OR u.email ILIKE '%' || sqlc.narg('q') || '%')
  AND (sqlc.narg('role_id')::uuid IS NULL OR EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role_id = sqlc.narg('role_id')))
ORDER BY u.created_at DESC
LIMIT @lim::int OFFSET @off::int;

-- name: ListStaffOptions :many
SELECT id, name, email, avatar_url FROM users WHERE kind = 'staff' AND status = 'active' ORDER BY name;

-- name: ListStudents :many
SELECT u.id, u.email, u.name, u.phone, u.avatar_url, u.status, u.student_code, u.last_login_at, u.created_at,
       (SELECT count(*) FROM enrollments e WHERE e.student_id = u.id)::int AS course_count,
       count(*) OVER () AS total_count
FROM users u
WHERE u.kind = 'student'
  AND (sqlc.narg('q')::text IS NULL OR u.name ILIKE '%' || sqlc.narg('q') || '%'
       OR u.email ILIKE '%' || sqlc.narg('q') || '%' OR u.student_code ILIKE '%' || sqlc.narg('q') || '%')
  AND (sqlc.narg('status')::text IS NULL OR u.status = sqlc.narg('status'))
  AND (sqlc.narg('course_id')::uuid IS NULL OR EXISTS (SELECT 1 FROM enrollments e WHERE e.student_id = u.id AND e.course_id = sqlc.narg('course_id')))
  AND (sqlc.narg('batch_id')::uuid IS NULL OR EXISTS (SELECT 1 FROM enrollments e WHERE e.student_id = u.id AND e.batch_id = sqlc.narg('batch_id')))
  AND (sqlc.narg('mentor_id')::uuid IS NULL OR mentor_sees_student(sqlc.narg('mentor_id'), u.id))
ORDER BY u.created_at DESC
LIMIT @lim::int OFFSET @off::int;

-- name: ListStudentsForExport :many
SELECT u.student_code, u.name, u.email, u.phone, u.status, u.created_at,
       COALESCE((SELECT string_agg(c.title, '; ' ORDER BY c.title)
                   FROM enrollments e JOIN courses c ON c.id = e.course_id
                  WHERE e.student_id = u.id), '')::text AS courses
FROM users u
WHERE u.kind = 'student'
  AND (sqlc.narg('mentor_id')::uuid IS NULL OR mentor_sees_student(sqlc.narg('mentor_id'), u.id))
ORDER BY u.created_at DESC;

-- name: MentorSeesStudent :one
SELECT mentor_sees_student(@mentor_id, @student_id)::boolean;

-- name: CreateRefreshToken :one
INSERT INTO refresh_tokens (user_id, token_hash, app, user_agent, ip, expires_at)
VALUES (@user_id, @token_hash, @app, @user_agent, @ip, @expires_at)
RETURNING *;

-- name: GetRefreshToken :one
SELECT * FROM refresh_tokens WHERE token_hash = $1;

-- name: RevokeRefreshToken :exec
UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL;

-- name: RevokeAllUserTokens :exec
UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL;

-- name: DeleteExpiredTokens :exec
DELETE FROM refresh_tokens WHERE expires_at < now() - interval '7 days';

-- name: CreatePasswordReset :exec
INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (@token_hash, @user_id, @expires_at);

-- name: GetPasswordReset :one
SELECT * FROM password_resets WHERE token_hash = $1;

-- name: UsePasswordReset :exec
UPDATE password_resets SET used_at = now() WHERE token_hash = $1;
