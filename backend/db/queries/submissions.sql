-- name: CreateUpload :one
INSERT INTO uploads (owner_id, purpose, object_key, file_name, mime, size_bytes, is_public)
VALUES (@owner_id, @purpose, @object_key, @file_name, @mime, @size_bytes, @is_public)
RETURNING *;

-- name: GetUpload :one
SELECT * FROM uploads WHERE id = $1;

-- name: GetUploadByKey :one
SELECT * FROM uploads WHERE object_key = $1;

-- name: MarkUploadReady :one
UPDATE uploads SET status = 'ready', size_bytes = @size_bytes WHERE id = @id RETURNING *;

-- name: DeleteUpload :exec
DELETE FROM uploads WHERE id = $1;

-- name: LatestSubmission :one
SELECT * FROM submissions
WHERE task_id = @task_id AND student_id = @student_id
ORDER BY attempt DESC
LIMIT 1;

-- name: CreateSubmission :one
INSERT INTO submissions (task_id, student_id, attempt, is_late)
VALUES (@task_id, @student_id,
        (SELECT COALESCE(max(attempt), 0) + 1 FROM submissions WHERE task_id = @task_id AND student_id = @student_id)::int,
        @is_late)
RETURNING *;

-- name: AddSubmissionItem :one
INSERT INTO submission_items (submission_id, position, kind, content, language, upload_id)
VALUES (@submission_id, @position, @kind, @content, @language, sqlc.narg('upload_id'))
RETURNING *;

-- name: ListSubmissionItems :many
SELECT si.*, up.file_name, up.mime, up.size_bytes, up.object_key
FROM submission_items si
LEFT JOIN uploads up ON up.id = si.upload_id
WHERE si.submission_id = ANY (@ids::uuid[])
ORDER BY si.submission_id, si.position;

-- name: GetSubmission :one
SELECT s.*, t.title AS task_title, t.max_marks, t.pass_marks, t.instructions AS task_instructions, t.allowed_types, t.due_at,
       v.id AS video_id, v.title AS video_title, c.id AS course_id, c.title AS course_title,
       u.name AS student_name, u.email AS student_email, u.student_code, u.avatar_url AS student_avatar,
       r.name AS reviewer_name
FROM submissions s
JOIN tasks t ON t.id = s.task_id
JOIN videos v ON v.id = t.video_id
JOIN courses c ON c.id = v.course_id
JOIN users u ON u.id = s.student_id
LEFT JOIN users r ON r.id = s.reviewed_by
WHERE s.id = $1;

-- name: ListSubmissions :many
SELECT s.id, s.task_id, s.student_id, s.attempt, s.status, s.marks, s.is_late, s.created_at, s.reviewed_at,
       t.title AS task_title, t.max_marks, v.title AS video_title, c.id AS course_id, c.title AS course_title,
       u.name AS student_name, u.email AS student_email, u.student_code,
       count(*) OVER () AS total_count
FROM submissions s
JOIN tasks t ON t.id = s.task_id
JOIN videos v ON v.id = t.video_id
JOIN courses c ON c.id = v.course_id
JOIN users u ON u.id = s.student_id
WHERE (sqlc.narg('status')::text IS NULL OR s.status = sqlc.narg('status'))
  AND (sqlc.narg('course_id')::uuid IS NULL OR c.id = sqlc.narg('course_id'))
  AND (sqlc.narg('task_id')::uuid IS NULL OR s.task_id = sqlc.narg('task_id'))
  AND (sqlc.narg('student_id')::uuid IS NULL OR s.student_id = sqlc.narg('student_id'))
  AND (sqlc.narg('batch_id')::uuid IS NULL OR EXISTS (
        SELECT 1 FROM enrollments e WHERE e.student_id = s.student_id AND e.course_id = c.id AND e.batch_id = sqlc.narg('batch_id')))
  AND (sqlc.narg('q')::text IS NULL OR u.name ILIKE '%' || sqlc.narg('q') || '%' OR t.title ILIKE '%' || sqlc.narg('q') || '%')
  AND (sqlc.narg('mentor_id')::uuid IS NULL OR EXISTS (
        SELECT 1 FROM enrollments e
         WHERE e.student_id = s.student_id AND e.course_id = c.id
           AND (c.id IN (SELECT course_id FROM course_mentors WHERE user_id = sqlc.narg('mentor_id'))
                OR e.batch_id IN (SELECT batch_id FROM batch_mentors WHERE user_id = sqlc.narg('mentor_id')))))
ORDER BY s.created_at DESC
LIMIT @lim::int OFFSET @off::int;

-- name: ReviewSubmission :one
UPDATE submissions
SET status = @status, marks = sqlc.narg('marks'), feedback = @feedback, reviewed_by = @reviewed_by,
    reviewed_at = now(), updated_at = now()
WHERE id = @id
RETURNING *;

-- name: ListStudentTaskSubmissions :many
SELECT s.*, r.name AS reviewer_name
FROM submissions s LEFT JOIN users r ON r.id = s.reviewed_by
WHERE s.task_id = @task_id AND s.student_id = @student_id
ORDER BY s.attempt DESC;

-- name: ListTaskComments :many
SELECT tc.*, u.name AS author_name, u.avatar_url AS author_avatar, u.kind AS author_kind,
       up.file_name, up.mime, up.object_key
FROM task_comments tc
JOIN users u ON u.id = tc.author_id
LEFT JOIN uploads up ON up.id = tc.upload_id
WHERE tc.task_id = @task_id AND tc.student_id = @student_id
ORDER BY tc.created_at;

-- name: CreateTaskComment :one
INSERT INTO task_comments (task_id, student_id, author_id, body, upload_id)
VALUES (@task_id, @student_id, @author_id, @body, sqlc.narg('upload_id'))
RETURNING *;

-- name: TaskReviewers :many
-- Staff who should hear about a submission: course mentors + batch mentors of the student's batch.
SELECT DISTINCT u.id FROM users u
WHERE u.status = 'active' AND (
      u.id IN (SELECT cm.user_id FROM course_mentors cm WHERE cm.course_id = @course_id)
   OR u.id IN (SELECT bm.user_id FROM batch_mentors bm JOIN enrollments e ON e.batch_id = bm.batch_id
                WHERE e.student_id = @student_id AND e.course_id = @course_id));

-- name: MyEnrollments :many
SELECT e.id AS enrollment_id, e.status AS enrollment_status, e.enrolled_at, e.batch_id, b.name AS batch_name,
       c.id, c.slug, c.title, c.subtitle, c.thumbnail_url, c.level, c.category,
       p.total_tasks, p.approved_tasks,
       (SELECT count(*) FROM videos v WHERE v.course_id = c.id)::int AS video_count
FROM enrollments e
JOIN courses c ON c.id = e.course_id
LEFT JOIN batches b ON b.id = e.batch_id
JOIN enrollment_progress p ON p.enrollment_id = e.id
WHERE e.student_id = $1 AND e.status <> 'suspended' AND c.status <> 'draft'
ORDER BY e.enrolled_at DESC;

-- name: MyCourseVideos :many
SELECT v.*,
       (SELECT count(*) FROM tasks t WHERE t.video_id = v.id)::int AS task_count,
       (SELECT count(DISTINCT s.task_id) FROM submissions s JOIN tasks t ON t.id = s.task_id
         WHERE t.video_id = v.id AND s.student_id = @student_id AND s.status = 'approved')::int AS approved_count
FROM videos v
WHERE v.course_id = @course_id
ORDER BY v.position, v.created_at;

-- name: MyTasks :many
SELECT t.id, t.title, t.due_at, t.max_marks, t.allowed_types, t.position,
       v.id AS video_id, v.title AS video_title, v.position AS video_position,
       c.id AS course_id, c.title AS course_title
FROM enrollments e
JOIN courses c ON c.id = e.course_id
JOIN videos v ON v.course_id = c.id
JOIN tasks t ON t.video_id = v.id
WHERE e.student_id = @student_id AND e.status <> 'suspended' AND c.status <> 'draft'
  AND (sqlc.narg('course_id')::uuid IS NULL OR c.id = sqlc.narg('course_id'))
  AND (sqlc.narg('video_id')::uuid IS NULL OR v.id = sqlc.narg('video_id'))
ORDER BY c.title, v.position, t.position;

-- name: MyLatestSubmissions :many
SELECT DISTINCT ON (task_id) *
FROM submissions
WHERE student_id = $1
ORDER BY task_id, attempt DESC;

-- name: MyApprovedTaskIDs :many
SELECT DISTINCT task_id FROM submissions WHERE student_id = $1 AND status = 'approved';

-- name: UploadInStudentThread :one
SELECT EXISTS (SELECT 1 FROM task_comments tc WHERE tc.upload_id = @upload_id AND tc.student_id = @student_id)::boolean;

-- name: UploadInStudentSubmission :one
SELECT EXISTS (SELECT 1 FROM submission_items si JOIN submissions s ON s.id = si.submission_id
                WHERE si.upload_id = @upload_id AND s.student_id = @student_id)::boolean;
