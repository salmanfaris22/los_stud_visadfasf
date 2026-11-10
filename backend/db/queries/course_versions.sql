-- name: StudentHasCourseItem :one
-- True when the item (video, task or quiz) is in the version the student is enrolled on.
SELECT EXISTS (
    SELECT 1 FROM enrollments e
    JOIN courses c ON c.id = e.course_id
    JOIN course_version_items i ON i.version_id = e.version_id
    WHERE e.student_id = @student_id AND e.status <> 'suspended' AND c.status <> 'draft'
      AND i.kind = @kind AND i.item_id = @item_id
)::boolean;

-- name: ItemInAnyVersion :one
SELECT EXISTS (SELECT 1 FROM course_version_items WHERE kind = @kind AND item_id = @item_id)::boolean;

-- name: BuildCourseVersion :one
SELECT build_course_version(@course_id, @note, sqlc.narg('created_by'))::uuid AS id;

-- name: ListCourseVersions :many
SELECT v.id, v.number, v.note, v.created_at, u.name AS created_by_name,
       (SELECT count(*) FROM enrollments e WHERE e.version_id = v.id)::int AS student_count,
       (SELECT count(*) FROM course_version_items i WHERE i.version_id = v.id AND i.kind = 'video')::int AS video_count,
       (SELECT count(*) FROM course_version_items i WHERE i.version_id = v.id AND i.kind = 'task')::int AS task_count,
       (SELECT count(*) FROM course_version_items i WHERE i.version_id = v.id AND i.kind = 'quiz')::int AS quiz_count
FROM course_versions v
LEFT JOIN users u ON u.id = v.created_by
WHERE v.course_id = $1
ORDER BY v.number DESC;

-- name: WorkingCourseItems :many
SELECT kind::text AS kind, item_id::uuid AS item_id, pos::int AS position FROM course_working_items($1);

-- name: VersionItems :many
SELECT kind, item_id, position FROM course_version_items WHERE version_id = $1;

-- name: ListVersionStudents :many
SELECT e.id AS enrollment_id, u.id AS student_id, u.name, u.email, u.student_code,
       e.batch_id, b.name AS batch_name, e.version_id, v.number AS version_number, p.total_tasks, p.approved_tasks
FROM enrollments e
JOIN users u ON u.id = e.student_id
LEFT JOIN batches b ON b.id = e.batch_id
LEFT JOIN course_versions v ON v.id = e.version_id
JOIN enrollment_progress p ON p.enrollment_id = e.id
WHERE e.course_id = $1
ORDER BY u.name;

-- name: MoveEnrollmentsToVersion :many
UPDATE enrollments e SET version_id = @version_id
WHERE e.course_id = @course_id AND e.id = ANY (@enrollment_ids::uuid[])
  AND EXISTS (SELECT 1 FROM course_versions v WHERE v.id = @version_id AND v.course_id = @course_id)
RETURNING e.id;
