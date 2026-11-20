-- name: ListCertificateTemplates :many
SELECT t.*, (SELECT count(*) FROM courses c WHERE c.certificate_template_id = t.id)::int AS course_count
FROM certificate_templates t
ORDER BY t.is_default DESC, t.created_at;

-- name: GetCertificateTemplate :one
SELECT t.*, (SELECT count(*) FROM courses c WHERE c.certificate_template_id = t.id)::int AS course_count
FROM certificate_templates t
WHERE t.id = $1;

-- name: GetDefaultCertificateTemplate :one
SELECT * FROM certificate_templates WHERE is_default LIMIT 1;

-- name: CreateCertificateTemplate :one
INSERT INTO certificate_templates (name, background_url, fields, is_default, created_by)
VALUES (@name, @background_url, @fields, @is_default, sqlc.narg('created_by'))
RETURNING *;

-- name: UpdateCertificateTemplate :one
UPDATE certificate_templates
SET name = @name, background_url = @background_url, fields = @fields, updated_at = now()
WHERE id = @id
RETURNING *;

-- name: ClearDefaultCertificateTemplate :exec
UPDATE certificate_templates SET is_default = false WHERE is_default;

-- name: MakeDefaultCertificateTemplate :execrows
UPDATE certificate_templates SET is_default = true, updated_at = now() WHERE id = $1;

-- name: DeleteCertificateTemplate :execrows
DELETE FROM certificate_templates WHERE id = $1 AND NOT is_default;
