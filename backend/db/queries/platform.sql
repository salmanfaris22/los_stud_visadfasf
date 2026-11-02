-- name: CreateNotifications :many
INSERT INTO notifications (user_id, kind, title, body, link)
SELECT uid, sqlc.arg(kind)::text, sqlc.arg(title)::text, sqlc.arg(body)::text, sqlc.arg(link)::text
FROM unnest(sqlc.arg(user_ids)::uuid[]) AS uid
RETURNING *;

-- name: ListNotifications :many
SELECT * FROM notifications
WHERE user_id = @user_id AND (NOT @unread_only::boolean OR read_at IS NULL)
ORDER BY created_at DESC
LIMIT @lim::int;

-- name: CountUnreadNotifications :one
SELECT count(*)::int FROM notifications WHERE user_id = $1 AND read_at IS NULL;

-- name: MarkNotificationsRead :exec
UPDATE notifications SET read_at = now()
WHERE user_id = @user_id AND read_at IS NULL AND (cardinality(@ids::uuid[]) = 0 OR id = ANY (@ids::uuid[]));

-- name: ListCMSBlocks :many
SELECT * FROM cms_blocks ORDER BY key;

-- name: UpsertCMSBlock :one
INSERT INTO cms_blocks (key, data, updated_by) VALUES (@key, @data, sqlc.narg('updated_by'))
ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_by = EXCLUDED.updated_by, updated_at = now()
RETURNING *;

-- name: InsertCMSBlockIfMissing :exec
INSERT INTO cms_blocks (key, data) VALUES (@key, @data) ON CONFLICT (key) DO NOTHING;

-- name: ListSettings :many
SELECT * FROM settings ORDER BY key;

-- name: GetSetting :one
SELECT value FROM settings WHERE key = $1;

-- name: UpsertSetting :exec
INSERT INTO settings (key, value) VALUES (@key, @value)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- name: GetGoogleToken :one
SELECT * FROM google_tokens WHERE owner = $1;

-- name: UpsertGoogleToken :exec
INSERT INTO google_tokens (owner, email, token_enc, scopes) VALUES (@owner, @email, @token_enc, @scopes)
ON CONFLICT (owner) DO UPDATE SET email = EXCLUDED.email, token_enc = EXCLUDED.token_enc, scopes = EXCLUDED.scopes, updated_at = now();

-- name: DeleteGoogleToken :exec
DELETE FROM google_tokens WHERE owner = $1;

-- name: ListBlogPosts :many
SELECT b.*, u.name AS author_name, count(*) OVER () AS total_count
FROM blog_posts b LEFT JOIN users u ON u.id = b.author_id
WHERE (sqlc.narg('status')::text IS NULL OR b.status = sqlc.narg('status'))
  AND (sqlc.narg('q')::text IS NULL OR b.title ILIKE '%' || sqlc.narg('q') || '%')
ORDER BY b.created_at DESC
LIMIT @lim::int OFFSET @off::int;

-- name: ListPublishedPosts :many
SELECT b.id, b.slug, b.title, b.excerpt, b.cover_url, b.tags, b.published_at, u.name AS author_name
FROM blog_posts b LEFT JOIN users u ON u.id = b.author_id
WHERE b.status = 'published'
ORDER BY b.published_at DESC
LIMIT @lim::int;

-- name: GetBlogPost :one
SELECT * FROM blog_posts WHERE id = $1;

-- name: GetPublishedPostBySlug :one
SELECT b.*, u.name AS author_name
FROM blog_posts b LEFT JOIN users u ON u.id = b.author_id
WHERE b.slug = $1 AND b.status = 'published';

-- name: CreateBlogPost :one
INSERT INTO blog_posts (slug, title, excerpt, content, cover_url, tags, status, published_at, seo_title, seo_description, author_id)
VALUES (@slug, @title, @excerpt, @content, @cover_url, @tags, @status::text,
        CASE WHEN @status::text = 'published' THEN now() END, @seo_title, @seo_description, sqlc.narg('author_id'))
RETURNING *;

-- name: UpdateBlogPost :one
UPDATE blog_posts
SET slug = @slug, title = @title, excerpt = @excerpt, content = @content, cover_url = @cover_url, tags = @tags,
    status = @status::text,
    published_at = CASE WHEN @status::text = 'published' THEN COALESCE(published_at, now()) END,
    seo_title = @seo_title, seo_description = @seo_description, updated_at = now()
WHERE id = @id
RETURNING *;

-- name: DeleteBlogPost :exec
DELETE FROM blog_posts WHERE id = $1;

-- name: InsertAudit :exec
INSERT INTO audit_logs (actor_id, action, entity, entity_id, data, ip)
VALUES (sqlc.narg('actor_id'), @action, @entity, @entity_id, @data, @ip);

-- name: ListAudit :many
SELECT a.*, u.name AS actor_name, u.email AS actor_email, count(*) OVER () AS total_count
FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
WHERE (sqlc.narg('entity')::text IS NULL OR a.entity = sqlc.narg('entity'))
  AND (sqlc.narg('actor_id')::uuid IS NULL OR a.actor_id = sqlc.narg('actor_id'))
  AND (sqlc.narg('action')::text IS NULL OR a.action = sqlc.narg('action'))
ORDER BY a.created_at DESC
LIMIT @lim::int OFFSET @off::int;

-- name: AnalyticsCounts :one
SELECT (SELECT count(*) FROM users WHERE kind = 'student')::int AS students,
       (SELECT count(*) FROM users WHERE kind = 'student' AND last_login_at > now() - interval '7 days')::int AS active_students,
       (SELECT count(*) FROM users WHERE kind = 'staff')::int AS staff,
       (SELECT count(*) FROM courses WHERE status = 'published')::int AS published_courses,
       (SELECT count(*) FROM batches WHERE status IN ('upcoming', 'running'))::int AS active_batches,
       (SELECT count(*) FROM submissions WHERE status = 'pending')::int AS pending_reviews,
       (SELECT count(*) FROM submissions WHERE status = 'approved')::int AS approved_submissions,
       (SELECT count(*) FROM submissions WHERE status IN ('approved', 'rejected', 'resubmit'))::int AS reviewed_submissions,
       (SELECT count(*) FROM live_sessions WHERE starts_at > now() AND status = 'scheduled')::int AS upcoming_live,
       (SELECT count(*) FROM leads l JOIN lead_stages s ON s.id = l.stage_id WHERE s.kind = 'open' AND l.first_contacted_at IS NULL)::int AS new_leads,
       (SELECT count(*) FROM certificates WHERE revoked_at IS NULL)::int AS certificates;

-- name: SubmissionsPerDay :many
SELECT date_trunc('day', created_at)::date AS day, count(*)::int AS total
FROM submissions
WHERE created_at >= @since::timestamptz
GROUP BY 1
ORDER BY 1;

-- name: ApprovalsPerDay :many
SELECT date_trunc('day', reviewed_at)::date AS day, count(*)::int AS total
FROM submissions
WHERE status = 'approved' AND reviewed_at >= @since::timestamptz
GROUP BY 1
ORDER BY 1;

-- name: CourseCompletionStats :many
SELECT c.id, c.title, count(e.id)::int AS students,
       COALESCE(avg(CASE WHEN p.total_tasks > 0 THEN p.approved_tasks::float8 / p.total_tasks ELSE 0 END), 0)::float8 AS avg_progress,
       (count(*) FILTER (WHERE p.total_tasks > 0 AND p.approved_tasks >= p.total_tasks))::int AS completed
FROM courses c
LEFT JOIN enrollments e ON e.course_id = c.id
LEFT JOIN enrollment_progress p ON p.enrollment_id = e.id
WHERE c.status <> 'archived'
GROUP BY c.id, c.title
ORDER BY students DESC
LIMIT 10;

-- name: AttendanceStats :one
SELECT (SELECT count(*) FROM live_sessions WHERE ends_at < now() AND starts_at > now() - interval '30 days')::int AS live_sessions_30d,
       (SELECT count(*) FROM live_attendance la JOIN live_sessions ls ON ls.id = la.session_id
         WHERE la.present AND ls.starts_at > now() - interval '30 days')::int AS live_present_30d,
       (SELECT count(*) FROM class_attendance WHERE status IN ('present', 'late') AND marked_at > now() - interval '30 days')::int AS offline_present_30d,
       (SELECT count(*) FROM class_attendance WHERE marked_at > now() - interval '30 days')::int AS offline_marked_30d;
