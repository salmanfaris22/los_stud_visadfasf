-- Course versions: each enrollment is pinned to a frozen list of lessons, tasks and quizzes.
-- Admins edit a working copy (the live rows that are not archived) and "build" it into a new
-- version; existing students stay on their version until an admin moves them.

ALTER TABLE videos  ADD COLUMN archived_at timestamptz;
ALTER TABLE tasks   ADD COLUMN archived_at timestamptz;
ALTER TABLE quizzes ADD COLUMN archived_at timestamptz;

CREATE TABLE course_versions (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id  uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    number     int NOT NULL CHECK (number > 0),
    note       text NOT NULL DEFAULT '',
    created_by uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (course_id, number)
);

CREATE TABLE course_version_items (
    version_id uuid NOT NULL REFERENCES course_versions (id) ON DELETE CASCADE,
    kind       text NOT NULL CHECK (kind IN ('video', 'task', 'quiz')),
    item_id    uuid NOT NULL,
    position   int NOT NULL DEFAULT 0,
    PRIMARY KEY (version_id, kind, item_id)
);
CREATE INDEX course_version_items_item_idx ON course_version_items (kind, item_id);

ALTER TABLE enrollments ADD COLUMN version_id uuid REFERENCES course_versions (id) ON DELETE RESTRICT;
CREATE INDEX enrollments_version_idx ON enrollments (version_id);

-- The working copy of a course: every item that is not archived, with its position.
-- Quizzes have no position column, so they are numbered by creation time per lesson.
CREATE FUNCTION course_working_items(p_course uuid)
RETURNS TABLE (kind text, item_id uuid, pos int)
LANGUAGE sql STABLE AS $$
    SELECT 'video', v.id, v.position FROM videos v
     WHERE v.course_id = p_course AND v.archived_at IS NULL
    UNION ALL
    SELECT 'task', t.id, t.position FROM tasks t JOIN videos v ON v.id = t.video_id
     WHERE v.course_id = p_course AND v.archived_at IS NULL AND t.archived_at IS NULL
    UNION ALL
    SELECT 'quiz', q.id, (row_number() OVER (PARTITION BY q.video_id ORDER BY q.created_at))::int
      FROM quizzes q JOIN videos v ON v.id = q.video_id
     WHERE v.course_id = p_course AND v.archived_at IS NULL AND q.archived_at IS NULL
$$;

-- Freezes the working copy as the next version number and returns its id.
CREATE FUNCTION build_course_version(p_course uuid, p_note text, p_by uuid)
RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
    v_id uuid;
BEGIN
    -- One build at a time per course, so version numbers never collide.
    PERFORM 1 FROM courses WHERE id = p_course FOR UPDATE;
    INSERT INTO course_versions (course_id, number, note, created_by)
    VALUES (p_course,
            COALESCE((SELECT max(number) FROM course_versions WHERE course_id = p_course), 0) + 1,
            COALESCE(p_note, ''), p_by)
    RETURNING id INTO v_id;
    INSERT INTO course_version_items (version_id, kind, item_id, position)
    SELECT v_id, w.kind, w.item_id, w.pos FROM course_working_items(p_course) w;
    RETURN v_id;
END $$;

-- New enrollments get the latest version; a course's first enrollment builds v1.
CREATE FUNCTION enrollments_set_version()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.version_id IS NULL THEN
        SELECT id INTO NEW.version_id FROM course_versions
         WHERE course_id = NEW.course_id ORDER BY number DESC LIMIT 1;
        IF NEW.version_id IS NULL THEN
            NEW.version_id := build_course_version(NEW.course_id, 'First version', NEW.assigned_by);
        END IF;
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER enrollments_set_version BEFORE INSERT ON enrollments
FOR EACH ROW EXECUTE FUNCTION enrollments_set_version();

-- Backfill: every course with students gets v1 from today's curriculum; students move onto it.
DO $$
DECLARE
    c record;
    v uuid;
BEGIN
    FOR c IN SELECT DISTINCT course_id FROM enrollments LOOP
        v := build_course_version(c.course_id, 'First version', NULL);
        UPDATE enrollments SET version_id = v WHERE course_id = c.course_id;
    END LOOP;
END $$;

-- Progress = approved tasks / tasks in the enrollment's version.
CREATE OR REPLACE VIEW enrollment_progress AS
SELECT e.id          AS enrollment_id,
       e.student_id,
       e.course_id,
       (SELECT count(*) FROM course_version_items i
         WHERE i.version_id = e.version_id AND i.kind = 'task')::int AS total_tasks,
       (SELECT count(DISTINCT s.task_id)
          FROM submissions s
          JOIN course_version_items i ON i.version_id = e.version_id AND i.kind = 'task' AND i.item_id = s.task_id
         WHERE s.student_id = e.student_id
           AND s.status = 'approved')::int AS approved_tasks
  FROM enrollments e;
