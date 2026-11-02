-- name: ListVideoQuizzes :many
SELECT q.*, (SELECT count(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id)::int AS question_count,
       (SELECT count(*) FROM quiz_attempts qa WHERE qa.quiz_id = q.id AND qa.submitted_at IS NOT NULL)::int AS attempt_count
FROM quizzes q WHERE q.video_id = $1 ORDER BY q.created_at;

-- name: GetQuiz :one
SELECT q.*, v.course_id, v.title AS video_title FROM quizzes q JOIN videos v ON v.id = q.video_id WHERE q.id = $1;

-- name: CreateQuiz :one
INSERT INTO quizzes (video_id, title, description, pass_pct, time_limit_minutes, max_attempts)
VALUES (@video_id, @title, @description, @pass_pct, @time_limit_minutes, @max_attempts)
RETURNING *;

-- name: UpdateQuiz :one
UPDATE quizzes SET title = @title, description = @description, pass_pct = @pass_pct, time_limit_minutes = @time_limit_minutes,
    max_attempts = @max_attempts, updated_at = now()
WHERE id = @id RETURNING *;

-- name: DeleteQuiz :exec
DELETE FROM quizzes WHERE id = $1;

-- name: ClearQuizQuestions :exec
DELETE FROM quiz_questions WHERE quiz_id = $1;

-- name: CreateQuizQuestion :one
INSERT INTO quiz_questions (quiz_id, position, body, multi, points, explanation)
VALUES (@quiz_id, @position, @body, @multi, @points, @explanation)
RETURNING *;

-- name: CreateQuizOption :one
INSERT INTO quiz_options (question_id, position, body, is_correct) VALUES (@question_id, @position, @body, @is_correct) RETURNING *;

-- name: ListQuizQuestions :many
SELECT * FROM quiz_questions WHERE quiz_id = $1 ORDER BY position;

-- name: ListQuizOptions :many
SELECT o.* FROM quiz_options o JOIN quiz_questions q ON q.id = o.question_id WHERE q.quiz_id = $1 ORDER BY q.position, o.position;

-- name: CreateQuizAttempt :one
INSERT INTO quiz_attempts (quiz_id, student_id) VALUES (@quiz_id, @student_id) RETURNING *;

-- name: GetQuizAttempt :one
SELECT * FROM quiz_attempts WHERE id = $1;

-- name: OpenQuizAttempt :one
SELECT * FROM quiz_attempts WHERE quiz_id = @quiz_id AND student_id = @student_id AND submitted_at IS NULL
ORDER BY started_at DESC LIMIT 1;

-- name: SubmitQuizAttempt :one
UPDATE quiz_attempts SET submitted_at = now(), score = @score, max_score = @max_score, passed = @passed, answers = @answers
WHERE id = @id AND submitted_at IS NULL
RETURNING *;

-- name: CountQuizAttempts :one
SELECT count(*)::int FROM quiz_attempts WHERE quiz_id = @quiz_id AND student_id = @student_id AND submitted_at IS NOT NULL;

-- name: ListMyQuizAttempts :many
SELECT * FROM quiz_attempts WHERE quiz_id = @quiz_id AND student_id = @student_id AND submitted_at IS NOT NULL ORDER BY started_at DESC;

-- name: ListQuizAttemptsAdmin :many
SELECT qa.*, u.name AS student_name, u.email AS student_email
FROM quiz_attempts qa JOIN users u ON u.id = qa.student_id
WHERE qa.quiz_id = $1 AND qa.submitted_at IS NOT NULL
ORDER BY qa.submitted_at DESC;

-- name: MyVideoQuizzes :many
SELECT q.*,
       (SELECT count(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id)::int AS question_count,
       COALESCE((SELECT max(a.score) FROM quiz_attempts a WHERE a.quiz_id = q.id AND a.student_id = @student_id AND a.submitted_at IS NOT NULL), 0)::int AS best_score,
       COALESCE((SELECT max(a.max_score) FROM quiz_attempts a WHERE a.quiz_id = q.id AND a.student_id = @student_id AND a.submitted_at IS NOT NULL), 0)::int AS best_max,
       COALESCE((SELECT bool_or(a.passed) FROM quiz_attempts a WHERE a.quiz_id = q.id AND a.student_id = @student_id), false)::boolean AS passed,
       (SELECT count(*) FROM quiz_attempts a WHERE a.quiz_id = q.id AND a.student_id = @student_id AND a.submitted_at IS NOT NULL)::int AS attempts_used
FROM quizzes q
WHERE q.video_id = @video_id
ORDER BY q.created_at;

-- name: IssueCertificate :one
INSERT INTO certificates (code, student_id, course_id, issued_by)
VALUES (@code, @student_id, @course_id, sqlc.narg('issued_by'))
ON CONFLICT (student_id, course_id) DO UPDATE SET revoked_at = NULL
RETURNING *;

-- name: GetCertificate :one
SELECT ce.*, u.name AS student_name, u.email AS student_email, c.title AS course_title
FROM certificates ce JOIN users u ON u.id = ce.student_id JOIN courses c ON c.id = ce.course_id
WHERE ce.id = $1;

-- name: GetCertificateByCode :one
SELECT ce.*, u.name AS student_name, c.title AS course_title
FROM certificates ce JOIN users u ON u.id = ce.student_id JOIN courses c ON c.id = ce.course_id
WHERE ce.code = $1;

-- name: ListCertificates :many
SELECT ce.*, u.name AS student_name, u.email AS student_email, c.title AS course_title, count(*) OVER () AS total_count
FROM certificates ce JOIN users u ON u.id = ce.student_id JOIN courses c ON c.id = ce.course_id
WHERE (sqlc.narg('course_id')::uuid IS NULL OR ce.course_id = sqlc.narg('course_id'))
  AND (sqlc.narg('q')::text IS NULL OR u.name ILIKE '%' || sqlc.narg('q') || '%' OR ce.code ILIKE '%' || sqlc.narg('q') || '%')
ORDER BY ce.issued_at DESC
LIMIT @lim::int OFFSET @off::int;

-- name: MyCertificates :many
SELECT ce.*, c.title AS course_title, c.thumbnail_url AS course_thumbnail
FROM certificates ce JOIN courses c ON c.id = ce.course_id
WHERE ce.student_id = $1 AND ce.revoked_at IS NULL
ORDER BY ce.issued_at DESC;

-- name: RevokeCertificate :exec
UPDATE certificates SET revoked_at = now() WHERE id = $1;

-- name: ListVideoComments :many
SELECT vc.*, u.name AS author_name, u.avatar_url AS author_avatar, u.kind AS author_kind
FROM video_comments vc JOIN users u ON u.id = vc.user_id
WHERE vc.video_id = $1
ORDER BY vc.pinned DESC, vc.created_at DESC
LIMIT 500;

-- name: GetVideoComment :one
SELECT * FROM video_comments WHERE id = $1;

-- name: CreateVideoComment :one
INSERT INTO video_comments (video_id, user_id, parent_id, body) VALUES (@video_id, @user_id, sqlc.narg('parent_id'), @body) RETURNING *;

-- name: DeleteVideoComment :exec
DELETE FROM video_comments WHERE id = $1;

-- name: PinVideoComment :exec
UPDATE video_comments SET pinned = @pinned, updated_at = now() WHERE id = @id;

-- name: ListRecentComments :many
SELECT vc.*, u.name AS author_name, u.kind AS author_kind, v.title AS video_title, c.id AS course_id, c.title AS course_title,
       count(*) OVER () AS total_count
FROM video_comments vc
JOIN users u ON u.id = vc.user_id
JOIN videos v ON v.id = vc.video_id
JOIN courses c ON c.id = v.course_id
WHERE (sqlc.narg('mentor_id')::uuid IS NULL OR c.id IN (SELECT mentor_course_ids(sqlc.narg('mentor_id'))))
  AND (NOT @unanswered::boolean OR (vc.parent_id IS NULL AND u.kind = 'student' AND NOT EXISTS (
        SELECT 1 FROM video_comments r JOIN users ru ON ru.id = r.user_id WHERE r.parent_id = vc.id AND ru.kind = 'staff')))
ORDER BY vc.created_at DESC
LIMIT @lim::int OFFSET @off::int;

-- name: ListAnnouncements :many
SELECT a.*, u.name AS author_name,
       COALESCE(CASE a.target_type
                    WHEN 'course' THEN (SELECT title FROM courses WHERE id = a.target_id)
                    WHEN 'batch' THEN (SELECT name FROM batches WHERE id = a.target_id)
                    ELSE 'Everyone' END, '')::text AS target_label,
       count(*) OVER () AS total_count
FROM announcements a LEFT JOIN users u ON u.id = a.author_id
ORDER BY a.pinned DESC, a.created_at DESC
LIMIT @lim::int OFFSET @off::int;

-- name: GetAnnouncement :one
SELECT * FROM announcements WHERE id = $1;

-- name: CreateAnnouncement :one
INSERT INTO announcements (title, body, target_type, target_id, pinned, author_id)
VALUES (@title, @body, @target_type, sqlc.narg('target_id'), @pinned, sqlc.narg('author_id'))
RETURNING *;

-- name: UpdateAnnouncement :one
UPDATE announcements SET title = @title, body = @body, target_type = @target_type, target_id = sqlc.narg('target_id'),
    pinned = @pinned, updated_at = now()
WHERE id = @id RETURNING *;

-- name: DeleteAnnouncement :exec
DELETE FROM announcements WHERE id = $1;

-- name: MyAnnouncements :many
SELECT a.*, u.name AS author_name
FROM announcements a LEFT JOIN users u ON u.id = a.author_id
WHERE a.target_type = 'all'
   OR (a.target_type = 'course' AND a.target_id IN (SELECT en.course_id FROM enrollments en WHERE en.student_id = @student_id::uuid))
   OR (a.target_type = 'batch' AND a.target_id IN (SELECT en.batch_id FROM enrollments en WHERE en.student_id = @student_id::uuid AND en.batch_id IS NOT NULL))
ORDER BY a.pinned DESC, a.created_at DESC
LIMIT @lim::int;

-- name: AnnouncementAudience :many
SELECT u.id FROM users u
WHERE u.kind = 'student' AND u.status = 'active'
  AND (@target_type::text = 'all'
    OR (@target_type::text = 'course' AND u.id IN (SELECT en.student_id FROM enrollments en WHERE en.course_id = sqlc.narg('target_id')::uuid))
    OR (@target_type::text = 'batch' AND u.id IN (SELECT en.student_id FROM enrollments en WHERE en.batch_id = sqlc.narg('target_id')::uuid)));
