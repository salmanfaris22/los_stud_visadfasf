-- name: ListBatchTypes :many
SELECT bt.*, (SELECT count(*) FROM batches b WHERE b.batch_type_id = bt.id)::int AS batch_count
FROM batch_types bt ORDER BY bt.name;

-- name: GetBatchType :one
SELECT * FROM batch_types WHERE id = $1;

-- name: GetBatchTypeByName :one
SELECT * FROM batch_types WHERE name = $1;

-- name: CreateBatchType :one
INSERT INTO batch_types (name, is_offline, color) VALUES (@name, @is_offline, @color) RETURNING *;

-- name: UpdateBatchType :one
UPDATE batch_types SET name = @name, is_offline = @is_offline, color = @color WHERE id = @id RETURNING *;

-- name: DeleteBatchType :exec
DELETE FROM batch_types WHERE id = $1;

-- name: ListBatches :many
SELECT b.*, c.title AS course_title, bt.name AS type_name, bt.is_offline, bt.color AS type_color,
       (SELECT count(*) FROM enrollments e WHERE e.batch_id = b.id)::int AS student_count,
       count(*) OVER () AS total_count
FROM batches b
JOIN courses c ON c.id = b.course_id
JOIN batch_types bt ON bt.id = b.batch_type_id
WHERE (sqlc.narg('course_id')::uuid IS NULL OR b.course_id = sqlc.narg('course_id'))
  AND (sqlc.narg('status')::text IS NULL OR b.status = sqlc.narg('status'))
  AND (sqlc.narg('q')::text IS NULL OR b.name ILIKE '%' || sqlc.narg('q') || '%')
  AND (sqlc.narg('mentor_id')::uuid IS NULL
       OR b.id IN (SELECT batch_id FROM batch_mentors WHERE user_id = sqlc.narg('mentor_id'))
       OR b.course_id IN (SELECT course_id FROM course_mentors WHERE user_id = sqlc.narg('mentor_id')))
ORDER BY b.start_date DESC NULLS LAST, b.created_at DESC
LIMIT @lim::int OFFSET @off::int;

-- name: BatchOptions :many
SELECT b.id, b.name, b.course_id, c.title AS course_title
FROM batches b JOIN courses c ON c.id = b.course_id
WHERE (sqlc.narg('course_id')::uuid IS NULL OR b.course_id = sqlc.narg('course_id'))
ORDER BY c.title, b.name;

-- name: GetBatch :one
SELECT b.*, c.title AS course_title, bt.name AS type_name, bt.is_offline, bt.color AS type_color
FROM batches b
JOIN courses c ON c.id = b.course_id
JOIN batch_types bt ON bt.id = b.batch_type_id
WHERE b.id = $1;

-- name: CreateBatch :one
INSERT INTO batches (course_id, batch_type_id, name, start_date, end_date, capacity, location, schedule_note, status)
VALUES (@course_id, @batch_type_id, @name, sqlc.narg('start_date'), sqlc.narg('end_date'), @capacity, @location, @schedule_note, @status)
RETURNING *;

-- name: UpdateBatch :one
UPDATE batches
SET course_id = @course_id, batch_type_id = @batch_type_id, name = @name, start_date = sqlc.narg('start_date'),
    end_date = sqlc.narg('end_date'), capacity = @capacity, location = @location, schedule_note = @schedule_note,
    status = @status, updated_at = now()
WHERE id = @id
RETURNING *;

-- name: DeleteBatch :exec
DELETE FROM batches WHERE id = $1;

-- name: ListBatchMentors :many
SELECT u.id, u.name, u.email, u.avatar_url
FROM batch_mentors bm JOIN users u ON u.id = bm.user_id
WHERE bm.batch_id = $1 ORDER BY u.name;

-- name: ClearBatchMentors :exec
DELETE FROM batch_mentors WHERE batch_id = $1;

-- name: AddBatchMentors :exec
INSERT INTO batch_mentors (batch_id, user_id)
SELECT @batch_id, unnest(@user_ids::uuid[])
ON CONFLICT DO NOTHING;

-- name: ListBatchStudents :many
SELECT u.id, u.name, u.email, u.student_code, u.avatar_url, e.id AS enrollment_id, e.status AS enrollment_status,
       p.total_tasks, p.approved_tasks
FROM enrollments e
JOIN users u ON u.id = e.student_id
JOIN enrollment_progress p ON p.enrollment_id = e.id
WHERE e.batch_id = $1
ORDER BY u.name;

-- name: BatchInMentorScope :one
SELECT EXISTS (SELECT 1 FROM batches b
                WHERE b.id = @batch_id
                  AND (b.id IN (SELECT bm.batch_id FROM batch_mentors bm WHERE bm.user_id = @mentor_id::uuid)
                       OR b.course_id IN (SELECT cm.course_id FROM course_mentors cm WHERE cm.user_id = @mentor_id::uuid)))::boolean;

-- name: ListStudentEnrollments :many
SELECT e.*, c.title AS course_title, c.slug AS course_slug, c.thumbnail_url AS course_thumbnail,
       b.name AS batch_name, p.total_tasks, p.approved_tasks
FROM enrollments e
JOIN courses c ON c.id = e.course_id
LEFT JOIN batches b ON b.id = e.batch_id
JOIN enrollment_progress p ON p.enrollment_id = e.id
WHERE e.student_id = $1
ORDER BY e.enrolled_at DESC;

-- name: UpsertEnrollment :one
INSERT INTO enrollments (student_id, course_id, batch_id, assigned_by)
VALUES (@student_id, @course_id, sqlc.narg('batch_id'), sqlc.narg('assigned_by'))
ON CONFLICT (student_id, course_id) DO UPDATE
SET batch_id = EXCLUDED.batch_id,
    status = CASE WHEN enrollments.status = 'suspended' THEN 'active' ELSE enrollments.status END
RETURNING *;

-- name: GetEnrollment :one
SELECT * FROM enrollments WHERE id = $1;

-- name: UpdateEnrollment :one
UPDATE enrollments
SET batch_id = sqlc.narg('batch_id'), status = @status::text,
    completed_at = CASE WHEN @status::text = 'completed' THEN COALESCE(completed_at, now()) END
WHERE id = @id
RETURNING *;

-- name: DeleteEnrollment :exec
DELETE FROM enrollments WHERE id = $1;

-- name: MarkEnrollmentCompleted :exec
UPDATE enrollments SET status = 'completed', completed_at = COALESCE(completed_at, now())
WHERE student_id = @student_id AND course_id = @course_id AND status = 'active';

-- name: GetEnrollmentProgress :one
SELECT * FROM enrollment_progress WHERE student_id = @student_id AND course_id = @course_id;

-- name: IsEnrolled :one
SELECT EXISTS (SELECT 1 FROM enrollments e JOIN courses c ON c.id = e.course_id
                WHERE e.student_id = @student_id AND e.course_id = @course_id
                  AND e.status <> 'suspended' AND c.status <> 'draft')::boolean;

-- name: ListBatchClasses :many
SELECT cs.*,
       (SELECT count(*) FROM class_attendance ca WHERE ca.class_id = cs.id AND ca.status IN ('present', 'late'))::int AS present_count
FROM class_sessions cs
WHERE cs.batch_id = $1
ORDER BY cs.starts_at DESC;

-- name: GetClassSession :one
SELECT * FROM class_sessions WHERE id = $1;

-- name: CreateClassSession :one
INSERT INTO class_sessions (batch_id, title, starts_at, ends_at, created_by)
VALUES (@batch_id, @title, @starts_at, @ends_at, sqlc.narg('created_by'))
RETURNING *;

-- name: UpdateClassSession :one
UPDATE class_sessions SET title = @title, starts_at = @starts_at, ends_at = @ends_at WHERE id = @id RETURNING *;

-- name: DeleteClassSession :exec
DELETE FROM class_sessions WHERE id = $1;

-- name: SetClassQR :one
UPDATE class_sessions SET qr_token = @qr_token, qr_expires_at = @qr_expires_at WHERE id = @id RETURNING *;

-- name: GetClassByQR :one
SELECT * FROM class_sessions WHERE qr_token = $1;

-- name: ListClassAttendance :many
SELECT * FROM class_attendance WHERE class_id = $1;

-- name: UpsertClassAttendance :exec
INSERT INTO class_attendance (class_id, student_id, status, source, marked_by)
VALUES (@class_id, @student_id, @status, @source, sqlc.narg('marked_by'))
ON CONFLICT (class_id, student_id) DO UPDATE
SET status = EXCLUDED.status, source = EXCLUDED.source, marked_by = EXCLUDED.marked_by, marked_at = now();

-- name: StudentInBatch :one
SELECT EXISTS (SELECT 1 FROM enrollments WHERE student_id = @student_id AND batch_id = @batch_id)::boolean;

-- name: MyClassAttendance :many
SELECT cs.id, cs.title, cs.starts_at, cs.ends_at, b.name AS batch_name, ca.status, ca.marked_at
FROM class_sessions cs
JOIN batches b ON b.id = cs.batch_id
JOIN enrollments e ON e.batch_id = b.id AND e.student_id = @student_id
LEFT JOIN class_attendance ca ON ca.class_id = cs.id AND ca.student_id = @student_id
WHERE cs.starts_at < now()
ORDER BY cs.starts_at DESC
LIMIT 100;
