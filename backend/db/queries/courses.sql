-- name: ListCourses :many
SELECT c.*,
       (SELECT count(*) FROM videos v WHERE v.course_id = c.id)::int AS video_count,
       (SELECT count(*) FROM enrollments e WHERE e.course_id = c.id)::int AS student_count,
       count(*) OVER () AS total_count
FROM courses c
WHERE (sqlc.narg('q')::text IS NULL OR c.title ILIKE '%' || sqlc.narg('q') || '%')
  AND (sqlc.narg('status')::text IS NULL OR c.status = sqlc.narg('status'))
  AND (sqlc.narg('mentor_id')::uuid IS NULL OR c.id IN (SELECT mentor_course_ids(sqlc.narg('mentor_id'))))
ORDER BY c.created_at DESC
LIMIT @lim::int OFFSET @off::int;

-- name: CourseOptions :many
SELECT id, slug, title, status, fee_paise, gst_bp FROM courses
WHERE (sqlc.narg('mentor_id')::uuid IS NULL OR id IN (SELECT mentor_course_ids(sqlc.narg('mentor_id'))))
ORDER BY title;

-- name: GetCourse :one
SELECT * FROM courses WHERE id = $1;

-- name: GetCourseBySlug :one
SELECT * FROM courses WHERE slug = $1;

-- name: CreateCourse :one
INSERT INTO courses (slug, title, subtitle, description, thumbnail_url, level, language, category, status, is_public,
                     price_label, what_you_learn, fee_paise, gst_bp, created_by)
VALUES (@slug, @title, @subtitle, @description, @thumbnail_url, @level, @language, @category, @status, @is_public,
        @price_label, @what_you_learn, @fee_paise, @gst_bp, sqlc.narg('created_by'))
RETURNING *;

-- name: UpdateCourse :one
UPDATE courses
SET slug = @slug, title = @title, subtitle = @subtitle, description = @description, thumbnail_url = @thumbnail_url,
    level = @level, language = @language, category = @category, status = @status, is_public = @is_public,
    price_label = @price_label, what_you_learn = @what_you_learn, fee_paise = @fee_paise, gst_bp = @gst_bp, updated_at = now()
WHERE id = @id
RETURNING *;

-- name: DeleteCourse :exec
DELETE FROM courses WHERE id = $1;

-- name: ListCourseMentors :many
SELECT u.id, u.name, u.email, u.avatar_url, u.bio
FROM course_mentors cm JOIN users u ON u.id = cm.user_id
WHERE cm.course_id = $1
ORDER BY u.name;

-- name: ClearCourseMentors :exec
DELETE FROM course_mentors WHERE course_id = $1;

-- name: AddCourseMentors :exec
INSERT INTO course_mentors (course_id, user_id)
SELECT @course_id, unnest(@user_ids::uuid[])
ON CONFLICT DO NOTHING;

-- name: CourseInMentorScope :one
SELECT (@course_id::uuid IN (SELECT mentor_course_ids(@mentor_id::uuid)))::boolean;

-- name: ListPublicCourses :many
SELECT c.id, c.slug, c.title, c.subtitle, c.thumbnail_url, c.level, c.language, c.category, c.price_label, c.created_at,
       (SELECT count(*) FROM videos v WHERE v.course_id = c.id)::int AS video_count,
       (SELECT COALESCE(sum(v.duration_seconds), 0) FROM videos v WHERE v.course_id = c.id)::int AS total_seconds,
       (SELECT count(*) FROM enrollments e WHERE e.course_id = c.id)::int AS student_count
FROM courses c
WHERE c.status = 'published' AND c.is_public
  AND (sqlc.narg('q')::text IS NULL OR c.title ILIKE '%' || sqlc.narg('q') || '%' OR c.category ILIKE '%' || sqlc.narg('q') || '%')
  AND (sqlc.narg('category')::text IS NULL OR c.category = sqlc.narg('category'))
ORDER BY c.created_at DESC
LIMIT @lim::int;

-- name: ListPublicCategories :many
SELECT DISTINCT category FROM courses WHERE status = 'published' AND is_public AND category <> '' ORDER BY category;

-- name: ListCourseOpenBatches :many
SELECT b.id, b.name, b.start_date, b.end_date, b.location, b.schedule_note, b.status, bt.name AS type_name, bt.is_offline
FROM batches b JOIN batch_types bt ON bt.id = b.batch_type_id
WHERE b.course_id = $1 AND b.status IN ('upcoming', 'running')
ORDER BY b.start_date NULLS LAST;

-- name: ListCourseVideos :many
SELECT * FROM videos WHERE course_id = $1 ORDER BY position, created_at;

-- name: GetVideo :one
SELECT * FROM videos WHERE id = $1;

-- name: CreateVideo :one
INSERT INTO videos (course_id, position, title, description, provider, provider_ref, source_url, duration_seconds, is_preview)
VALUES (@course_id, (SELECT COALESCE(max(position) + 1, 0) FROM videos WHERE course_id = @course_id)::int,
        @title, @description, @provider, @provider_ref, @source_url, @duration_seconds, @is_preview)
RETURNING *;

-- name: UpdateVideo :one
UPDATE videos
SET title = @title, description = @description, provider = @provider, provider_ref = @provider_ref, source_url = @source_url,
    duration_seconds = @duration_seconds, is_preview = @is_preview, updated_at = now()
WHERE id = @id
RETURNING *;

-- name: DeleteVideo :exec
DELETE FROM videos WHERE id = $1;

-- name: ReorderVideos :exec
UPDATE videos SET position = array_position(@ids::uuid[], id) - 1
WHERE course_id = @course_id AND id = ANY (@ids::uuid[]);

-- name: ListTasksByCourse :many
SELECT t.* FROM tasks t JOIN videos v ON v.id = t.video_id WHERE v.course_id = $1 ORDER BY v.position, t.position;

-- name: GetTask :one
SELECT t.*, v.course_id, v.title AS video_title
FROM tasks t JOIN videos v ON v.id = t.video_id
WHERE t.id = $1;

-- name: CreateTask :one
INSERT INTO tasks (video_id, position, title, instructions, allowed_types, max_marks, pass_marks, due_at, allow_late, max_files, max_file_mb)
VALUES (@video_id, (SELECT COALESCE(max(position) + 1, 0) FROM tasks WHERE video_id = @video_id)::int,
        @title, @instructions, @allowed_types, @max_marks, @pass_marks, sqlc.narg('due_at'), @allow_late, @max_files, @max_file_mb)
RETURNING *;

-- name: UpdateTask :one
UPDATE tasks
SET title = @title, instructions = @instructions, allowed_types = @allowed_types, max_marks = @max_marks, pass_marks = @pass_marks,
    due_at = sqlc.narg('due_at'), allow_late = @allow_late, max_files = @max_files, max_file_mb = @max_file_mb, updated_at = now()
WHERE id = @id
RETURNING *;

-- name: DeleteTask :exec
DELETE FROM tasks WHERE id = $1;

-- name: ReorderTasks :exec
UPDATE tasks SET position = array_position(@ids::uuid[], id) - 1
WHERE video_id = @video_id AND id = ANY (@ids::uuid[]);
