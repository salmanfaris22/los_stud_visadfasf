CREATE OR REPLACE VIEW enrollment_progress AS
SELECT e.id          AS enrollment_id,
       e.student_id,
       e.course_id,
       (SELECT count(*)
          FROM tasks t JOIN videos v ON v.id = t.video_id
         WHERE v.course_id = e.course_id)::int AS total_tasks,
       (SELECT count(DISTINCT s.task_id)
          FROM submissions s
          JOIN tasks t ON t.id = s.task_id
          JOIN videos v ON v.id = t.video_id
         WHERE v.course_id = e.course_id
           AND s.student_id = e.student_id
           AND s.status = 'approved')::int AS approved_tasks
  FROM enrollments e;

DROP TRIGGER IF EXISTS enrollments_set_version ON enrollments;
DROP FUNCTION IF EXISTS enrollments_set_version();
DROP FUNCTION IF EXISTS build_course_version(uuid, text, uuid);
DROP FUNCTION IF EXISTS course_working_items(uuid);
ALTER TABLE enrollments DROP COLUMN IF EXISTS version_id;
DROP TABLE IF EXISTS course_version_items, course_versions;
-- Archived items come back as live rows (the old schema has no archive).
ALTER TABLE quizzes DROP COLUMN IF EXISTS archived_at;
ALTER TABLE tasks   DROP COLUMN IF EXISTS archived_at;
ALTER TABLE videos  DROP COLUMN IF EXISTS archived_at;
