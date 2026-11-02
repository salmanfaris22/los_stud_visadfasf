-- name: CreateLiveSession :one
INSERT INTO live_sessions (title, description, meet_url, starts_at, ends_at, host_id, created_by)
VALUES (@title, @description, @meet_url, @starts_at, @ends_at, sqlc.narg('host_id'), sqlc.narg('created_by'))
RETURNING *;

-- name: UpdateLiveSession :one
UPDATE live_sessions
SET title = @title, description = @description, meet_url = @meet_url,
    reminded_day = CASE WHEN starts_at <> @starts_at::timestamptz THEN false ELSE reminded_day END,
    reminded_soon = CASE WHEN starts_at <> @starts_at::timestamptz THEN false ELSE reminded_soon END,
    starts_at = @starts_at::timestamptz, ends_at = @ends_at, host_id = sqlc.narg('host_id'), status = @status, updated_at = now()
WHERE id = @id
RETURNING *;

-- name: GetLiveSession :one
SELECT ls.*, h.name AS host_name, h.email AS host_email
FROM live_sessions ls LEFT JOIN users h ON h.id = ls.host_id
WHERE ls.id = $1;

-- name: DeleteLiveSession :exec
DELETE FROM live_sessions WHERE id = $1;

-- name: ListLiveSessions :many
SELECT ls.*, h.name AS host_name,
       (SELECT count(*) FROM live_attendance la WHERE la.session_id = ls.id AND la.present)::int AS present_count,
       count(*) OVER () AS total_count
FROM live_sessions ls LEFT JOIN users h ON h.id = ls.host_id
WHERE (sqlc.narg('from_time')::timestamptz IS NULL OR ls.starts_at >= sqlc.narg('from_time'))
  AND (sqlc.narg('to_time')::timestamptz IS NULL OR ls.starts_at < sqlc.narg('to_time'))
  AND (sqlc.narg('course_id')::uuid IS NULL OR EXISTS (
        SELECT 1 FROM live_targets lt
         WHERE lt.session_id = ls.id
           AND ((lt.target_type = 'course' AND lt.target_id = sqlc.narg('course_id'))
             OR (lt.target_type = 'batch' AND lt.target_id IN (SELECT id FROM batches WHERE course_id = sqlc.narg('course_id'))))))
  AND (sqlc.narg('mentor_id')::uuid IS NULL
       OR ls.host_id = sqlc.narg('mentor_id') OR ls.created_by = sqlc.narg('mentor_id')
       OR EXISTS (SELECT 1 FROM live_targets lt
                   WHERE lt.session_id = ls.id
                     AND ((lt.target_type = 'course' AND lt.target_id IN (SELECT mentor_course_ids(sqlc.narg('mentor_id'))))
                       OR (lt.target_type = 'batch' AND lt.target_id IN (SELECT batch_id FROM batch_mentors WHERE user_id = sqlc.narg('mentor_id'))))))
ORDER BY ls.starts_at DESC
LIMIT @lim::int OFFSET @off::int;

-- name: ListLiveTargets :many
SELECT lt.target_type, lt.target_id,
       COALESCE(CASE lt.target_type
                    WHEN 'batch' THEN (SELECT name FROM batches WHERE id = lt.target_id)
                    WHEN 'course' THEN (SELECT title FROM courses WHERE id = lt.target_id)
                    ELSE (SELECT name FROM users WHERE id = lt.target_id) END, '')::text AS label
FROM live_targets lt
WHERE lt.session_id = $1
ORDER BY lt.target_type;

-- name: ClearLiveTargets :exec
DELETE FROM live_targets WHERE session_id = $1;

-- name: AddLiveTarget :exec
INSERT INTO live_targets (session_id, target_type, target_id) VALUES (@session_id, @target_type, @target_id) ON CONFLICT DO NOTHING;

-- name: LiveAudienceStudents :many
SELECT u.id, u.name, u.email, u.student_code
FROM users u
WHERE u.kind = 'student' AND u.status = 'active'
  AND (u.id IN (SELECT lt.target_id FROM live_targets lt WHERE lt.session_id = @session_id::uuid AND lt.target_type = 'student')
       OR u.id IN (SELECT e.student_id FROM enrollments e
                    WHERE e.status <> 'suspended'
                      AND (e.course_id IN (SELECT lt.target_id FROM live_targets lt WHERE lt.session_id = @session_id::uuid AND lt.target_type = 'course')
                           OR e.batch_id IN (SELECT lt.target_id FROM live_targets lt WHERE lt.session_id = @session_id::uuid AND lt.target_type = 'batch'))))
ORDER BY u.name;

-- name: LiveAudienceStaff :many
SELECT u.id, u.email FROM users u
WHERE u.status = 'active' AND u.kind = 'staff'
  AND (u.id = (SELECT s.host_id FROM live_sessions s WHERE s.id = @session_id::uuid)
       OR u.id IN (SELECT bm.user_id FROM batch_mentors bm
                    WHERE bm.batch_id IN (SELECT lt.target_id FROM live_targets lt WHERE lt.session_id = @session_id::uuid AND lt.target_type = 'batch')));

-- name: ListLiveAttendance :many
SELECT * FROM live_attendance WHERE session_id = $1;

-- name: UpsertLiveAttendance :exec
INSERT INTO live_attendance (session_id, student_id, present, source, joined_at, duration_seconds)
VALUES (@session_id, @student_id, @present, @source, sqlc.narg('joined_at'), @duration_seconds)
ON CONFLICT (session_id, student_id) DO UPDATE
SET present = EXCLUDED.present, source = EXCLUDED.source,
    joined_at = COALESCE(live_attendance.joined_at, EXCLUDED.joined_at),
    duration_seconds = GREATEST(live_attendance.duration_seconds, EXCLUDED.duration_seconds),
    updated_at = now();

-- name: SetLiveRecording :exec
UPDATE live_sessions SET recording_url = @recording_url, updated_at = now() WHERE id = @id;

-- name: SetLiveSynced :exec
UPDATE live_sessions SET gcal_event_id = @gcal_event_id, last_synced_at = now() WHERE id = @id;

-- name: MyLiveSessions :many
SELECT ls.*, h.name AS host_name, COALESCE(la.present, false)::boolean AS attended
FROM live_sessions ls
LEFT JOIN users h ON h.id = ls.host_id
LEFT JOIN live_attendance la ON la.session_id = ls.id AND la.student_id = @student_id
WHERE ls.status = 'scheduled'
  AND (sqlc.narg('from_time')::timestamptz IS NULL OR ls.ends_at >= sqlc.narg('from_time'))
  AND (sqlc.narg('to_time')::timestamptz IS NULL OR ls.starts_at < sqlc.narg('to_time'))
  AND EXISTS (SELECT 1 FROM live_targets lt
               WHERE lt.session_id = ls.id
                 AND ((lt.target_type = 'student' AND lt.target_id = @student_id)
                   OR (lt.target_type = 'course' AND lt.target_id IN (SELECT course_id FROM enrollments WHERE student_id = @student_id AND status <> 'suspended'))
                   OR (lt.target_type = 'batch' AND lt.target_id IN (SELECT batch_id FROM enrollments WHERE student_id = @student_id AND status <> 'suspended' AND batch_id IS NOT NULL))))
ORDER BY ls.starts_at
LIMIT @lim::int;

-- name: StudentCanSeeLive :one
SELECT EXISTS (SELECT 1 FROM live_targets lt
                WHERE lt.session_id = @session_id
                  AND ((lt.target_type = 'student' AND lt.target_id = @student_id)
                    OR (lt.target_type = 'course' AND lt.target_id IN (SELECT course_id FROM enrollments WHERE student_id = @student_id AND status <> 'suspended'))
                    OR (lt.target_type = 'batch' AND lt.target_id IN (SELECT batch_id FROM enrollments WHERE student_id = @student_id AND status <> 'suspended' AND batch_id IS NOT NULL))))::boolean;

-- name: DueLiveReminders :many
SELECT * FROM live_sessions
WHERE status = 'scheduled' AND starts_at > now()
  AND ((NOT reminded_day AND starts_at <= now() + interval '24 hours')
    OR (NOT reminded_soon AND starts_at <= now() + interval '15 minutes'));

-- name: MarkLiveReminded :exec
UPDATE live_sessions SET reminded_day = reminded_day OR @day::boolean, reminded_soon = reminded_soon OR @soon::boolean WHERE id = @id;
