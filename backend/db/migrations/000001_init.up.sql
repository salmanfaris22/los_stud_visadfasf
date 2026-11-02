-- LMS core schema
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ───────────── Users, auth, RBAC ─────────────
CREATE SEQUENCE student_code_seq START 1001;

CREATE TABLE users (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind           text NOT NULL CHECK (kind IN ('staff', 'student')),
    email          text NOT NULL UNIQUE,
    password_hash  text,
    name           text NOT NULL,
    phone          text,
    avatar_url     text,
    bio            text,
    google_id      text UNIQUE,
    status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    is_super_admin boolean NOT NULL DEFAULT false,
    student_code   text UNIQUE,
    last_login_at  timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX users_kind_created_idx ON users (kind, created_at DESC);
CREATE INDEX users_name_trgm_idx ON users USING gin (name gin_trgm_ops);
CREATE INDEX users_email_trgm_idx ON users USING gin (email gin_trgm_ops);

CREATE TABLE refresh_tokens (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    app        text NOT NULL,
    user_agent text NOT NULL DEFAULT '',
    ip         text NOT NULL DEFAULT '',
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);

CREATE TABLE password_resets (
    token_hash text PRIMARY KEY,
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    used_at    timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE roles (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL UNIQUE,
    description text NOT NULL DEFAULT '',
    scoped      boolean NOT NULL DEFAULT false, -- true = only assigned courses / batches
    is_system   boolean NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE role_permissions (
    role_id uuid NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
    module  text NOT NULL,
    action  text NOT NULL CHECK (action IN ('view', 'create', 'edit', 'delete')),
    PRIMARY KEY (role_id, module, action)
);

CREATE TABLE user_roles (
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role_id uuid NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);
CREATE INDEX user_roles_role_idx ON user_roles (role_id);

CREATE TABLE settings (
    key        text PRIMARY KEY,
    value      jsonb NOT NULL DEFAULT '{}',
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Organisation Google account (Calendar / Meet / Drive sync). Token is AES-GCM encrypted.
CREATE TABLE google_tokens (
    owner      text PRIMARY KEY,
    email      text NOT NULL DEFAULT '',
    token_enc  bytea NOT NULL,
    scopes     text NOT NULL DEFAULT '',
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- ───────────── Courses, batches, enrollments ─────────────
CREATE TABLE courses (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug           text NOT NULL UNIQUE,
    title          text NOT NULL,
    subtitle       text NOT NULL DEFAULT '',
    description    text NOT NULL DEFAULT '',
    thumbnail_url  text NOT NULL DEFAULT '',
    level          text NOT NULL DEFAULT 'beginner' CHECK (level IN ('beginner', 'intermediate', 'advanced', 'all')),
    language       text NOT NULL DEFAULT 'English',
    category       text NOT NULL DEFAULT '',
    status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    is_public      boolean NOT NULL DEFAULT true,
    price_label    text NOT NULL DEFAULT '',
    what_you_learn text[] NOT NULL DEFAULT '{}',
    created_by     uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX courses_status_idx ON courses (status, created_at DESC);
CREATE INDEX courses_title_trgm_idx ON courses USING gin (title gin_trgm_ops);

CREATE TABLE course_mentors (
    course_id uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    user_id   uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    PRIMARY KEY (course_id, user_id)
);
CREATE INDEX course_mentors_user_idx ON course_mentors (user_id);

CREATE TABLE batch_types (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text NOT NULL UNIQUE,
    is_offline boolean NOT NULL DEFAULT false,
    color      text NOT NULL DEFAULT '#6366f1',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE batches (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id     uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    batch_type_id uuid NOT NULL REFERENCES batch_types (id) ON DELETE RESTRICT,
    name          text NOT NULL,
    start_date    date,
    end_date      date,
    capacity      int NOT NULL DEFAULT 0,
    location      text NOT NULL DEFAULT '',
    schedule_note text NOT NULL DEFAULT '',
    status        text NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'running', 'completed', 'cancelled')),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX batches_course_idx ON batches (course_id);

CREATE TABLE batch_mentors (
    batch_id uuid NOT NULL REFERENCES batches (id) ON DELETE CASCADE,
    user_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    PRIMARY KEY (batch_id, user_id)
);
CREATE INDEX batch_mentors_user_idx ON batch_mentors (user_id);

CREATE TABLE enrollments (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id   uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    course_id    uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    batch_id     uuid REFERENCES batches (id) ON DELETE SET NULL,
    status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'suspended')),
    assigned_by  uuid REFERENCES users (id) ON DELETE SET NULL,
    enrolled_at  timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    UNIQUE (student_id, course_id)
);
CREATE INDEX enrollments_course_idx ON enrollments (course_id);
CREATE INDEX enrollments_batch_idx ON enrollments (batch_id);

-- ───────────── Content: videos → tasks ─────────────
CREATE TABLE videos (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id        uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    position         int NOT NULL DEFAULT 0,
    title            text NOT NULL,
    description      text NOT NULL DEFAULT '',
    provider         text NOT NULL CHECK (provider IN ('youtube', 'vimeo', 'bunny', 'cloudflare')),
    provider_ref     text NOT NULL,
    source_url       text NOT NULL,
    duration_seconds int NOT NULL DEFAULT 0,
    is_preview       boolean NOT NULL DEFAULT false,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX videos_course_pos_idx ON videos (course_id, position);

CREATE TABLE tasks (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id      uuid NOT NULL REFERENCES videos (id) ON DELETE CASCADE,
    position      int NOT NULL DEFAULT 0,
    title         text NOT NULL,
    instructions  text NOT NULL DEFAULT '',
    allowed_types text[] NOT NULL DEFAULT '{file,text,link}',
    max_marks     int NOT NULL DEFAULT 10,
    pass_marks    int NOT NULL DEFAULT 0,
    due_at        timestamptz,
    allow_late    boolean NOT NULL DEFAULT true,
    max_files     int NOT NULL DEFAULT 5,
    max_file_mb   int NOT NULL DEFAULT 10,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tasks_video_pos_idx ON tasks (video_id, position);

-- ───────────── Uploads & submissions ─────────────
CREATE TABLE uploads (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id   uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    purpose    text NOT NULL,
    object_key text NOT NULL UNIQUE,
    file_name  text NOT NULL,
    mime       text NOT NULL,
    size_bytes bigint NOT NULL DEFAULT 0,
    is_public  boolean NOT NULL DEFAULT false,
    status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready')),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX uploads_owner_idx ON uploads (owner_id);

CREATE TABLE submissions (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id     uuid NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    student_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    attempt     int NOT NULL DEFAULT 1,
    status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'resubmit')),
    marks       int,
    feedback    text NOT NULL DEFAULT '',
    is_late     boolean NOT NULL DEFAULT false,
    reviewed_by uuid REFERENCES users (id) ON DELETE SET NULL,
    reviewed_at timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (task_id, student_id, attempt)
);
CREATE INDEX submissions_student_status_idx ON submissions (student_id, status);
CREATE INDEX submissions_status_created_idx ON submissions (status, created_at DESC);
CREATE INDEX submissions_task_idx ON submissions (task_id);

CREATE TABLE submission_items (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id uuid NOT NULL REFERENCES submissions (id) ON DELETE CASCADE,
    position      int NOT NULL DEFAULT 0,
    kind          text NOT NULL CHECK (kind IN ('file', 'image', 'text', 'link', 'code', 'drive')),
    content       text NOT NULL DEFAULT '',
    language      text NOT NULL DEFAULT '',
    upload_id     uuid REFERENCES uploads (id) ON DELETE SET NULL,
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX submission_items_sub_idx ON submission_items (submission_id);

-- One conversation per (task, student), kept across resubmissions.
CREATE TABLE task_comments (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id    uuid NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    student_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    author_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    body       text NOT NULL,
    upload_id  uuid REFERENCES uploads (id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_comments_thread_idx ON task_comments (task_id, student_id, created_at);

-- Progress = approved tasks / total tasks of the course.
CREATE VIEW enrollment_progress AS
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

-- ───────────── Live sessions (Google Meet) ─────────────
CREATE TABLE live_sessions (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title          text NOT NULL,
    description    text NOT NULL DEFAULT '',
    meet_url       text NOT NULL,
    starts_at      timestamptz NOT NULL,
    ends_at        timestamptz NOT NULL,
    host_id        uuid REFERENCES users (id) ON DELETE SET NULL,
    recording_url  text NOT NULL DEFAULT '',
    gcal_event_id  text NOT NULL DEFAULT '',
    status         text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled')),
    reminded_day   boolean NOT NULL DEFAULT false,
    reminded_soon  boolean NOT NULL DEFAULT false,
    last_synced_at timestamptz,
    created_by     uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    CHECK (ends_at > starts_at)
);
CREATE INDEX live_sessions_starts_idx ON live_sessions (starts_at);

CREATE TABLE live_targets (
    session_id  uuid NOT NULL REFERENCES live_sessions (id) ON DELETE CASCADE,
    target_type text NOT NULL CHECK (target_type IN ('batch', 'course', 'student')),
    target_id   uuid NOT NULL,
    PRIMARY KEY (session_id, target_type, target_id)
);
CREATE INDEX live_targets_target_idx ON live_targets (target_type, target_id);

CREATE TABLE live_attendance (
    session_id       uuid NOT NULL REFERENCES live_sessions (id) ON DELETE CASCADE,
    student_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    present          boolean NOT NULL DEFAULT true,
    source           text NOT NULL CHECK (source IN ('join', 'manual', 'meet')),
    joined_at        timestamptz,
    duration_seconds int NOT NULL DEFAULT 0,
    updated_at       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (session_id, student_id)
);

-- ───────────── Offline classes & attendance ─────────────
CREATE TABLE class_sessions (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id      uuid NOT NULL REFERENCES batches (id) ON DELETE CASCADE,
    title         text NOT NULL,
    starts_at     timestamptz NOT NULL,
    ends_at       timestamptz NOT NULL,
    qr_token      text UNIQUE,
    qr_expires_at timestamptz,
    created_by    uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    CHECK (ends_at > starts_at)
);
CREATE INDEX class_sessions_batch_idx ON class_sessions (batch_id, starts_at);

CREATE TABLE class_attendance (
    class_id   uuid NOT NULL REFERENCES class_sessions (id) ON DELETE CASCADE,
    student_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    status     text NOT NULL CHECK (status IN ('present', 'absent', 'late', 'excused')),
    source     text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'qr')),
    marked_by  uuid REFERENCES users (id) ON DELETE SET NULL,
    marked_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (class_id, student_id)
);

-- ───────────── Quizzes ─────────────
CREATE TABLE quizzes (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id           uuid NOT NULL REFERENCES videos (id) ON DELETE CASCADE,
    title              text NOT NULL,
    description        text NOT NULL DEFAULT '',
    pass_pct           int NOT NULL DEFAULT 60 CHECK (pass_pct BETWEEN 0 AND 100),
    time_limit_minutes int NOT NULL DEFAULT 0,
    max_attempts       int NOT NULL DEFAULT 0,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quizzes_video_idx ON quizzes (video_id);

CREATE TABLE quiz_questions (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id     uuid NOT NULL REFERENCES quizzes (id) ON DELETE CASCADE,
    position    int NOT NULL DEFAULT 0,
    body        text NOT NULL,
    multi       boolean NOT NULL DEFAULT false,
    points      int NOT NULL DEFAULT 1,
    explanation text NOT NULL DEFAULT ''
);
CREATE INDEX quiz_questions_quiz_idx ON quiz_questions (quiz_id, position);

CREATE TABLE quiz_options (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id uuid NOT NULL REFERENCES quiz_questions (id) ON DELETE CASCADE,
    position    int NOT NULL DEFAULT 0,
    body        text NOT NULL,
    is_correct  boolean NOT NULL DEFAULT false
);
CREATE INDEX quiz_options_question_idx ON quiz_options (question_id, position);

CREATE TABLE quiz_attempts (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id      uuid NOT NULL REFERENCES quizzes (id) ON DELETE CASCADE,
    student_id   uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    started_at   timestamptz NOT NULL DEFAULT now(),
    submitted_at timestamptz,
    score        int NOT NULL DEFAULT 0,
    max_score    int NOT NULL DEFAULT 0,
    passed       boolean NOT NULL DEFAULT false,
    answers      jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX quiz_attempts_quiz_student_idx ON quiz_attempts (quiz_id, student_id);

-- ───────────── Certificates, Q&A, announcements, notifications ─────────────
CREATE TABLE certificates (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code       text NOT NULL UNIQUE,
    student_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    course_id  uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    issued_at  timestamptz NOT NULL DEFAULT now(),
    issued_by  uuid REFERENCES users (id) ON DELETE SET NULL,
    revoked_at timestamptz,
    UNIQUE (student_id, course_id)
);

CREATE TABLE video_comments (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id   uuid NOT NULL REFERENCES videos (id) ON DELETE CASCADE,
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    parent_id  uuid REFERENCES video_comments (id) ON DELETE CASCADE,
    body       text NOT NULL,
    pinned     boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX video_comments_video_idx ON video_comments (video_id, created_at DESC);
CREATE INDEX video_comments_parent_idx ON video_comments (parent_id);

CREATE TABLE announcements (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title       text NOT NULL,
    body        text NOT NULL,
    target_type text NOT NULL DEFAULT 'all' CHECK (target_type IN ('all', 'course', 'batch')),
    target_id   uuid,
    pinned      boolean NOT NULL DEFAULT false,
    author_id   uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX announcements_created_idx ON announcements (created_at DESC);

CREATE TABLE notifications (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind       text NOT NULL,
    title      text NOT NULL,
    body       text NOT NULL DEFAULT '',
    link       text NOT NULL DEFAULT '',
    read_at    timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;

-- ───────────── Website: CMS, leads, blog ─────────────
CREATE TABLE cms_blocks (
    key        text PRIMARY KEY,
    data       jsonb NOT NULL DEFAULT '{}',
    updated_by uuid REFERENCES users (id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE leads (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text NOT NULL,
    email      text NOT NULL,
    phone      text NOT NULL DEFAULT '',
    course_id  uuid REFERENCES courses (id) ON DELETE SET NULL,
    message    text NOT NULL DEFAULT '',
    source     text NOT NULL DEFAULT 'website',
    status     text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'converted', 'lost')),
    notes      text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX leads_status_idx ON leads (status, created_at DESC);

CREATE TABLE blog_posts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            text NOT NULL UNIQUE,
    title           text NOT NULL,
    excerpt         text NOT NULL DEFAULT '',
    content         text NOT NULL DEFAULT '',
    cover_url       text NOT NULL DEFAULT '',
    tags            text[] NOT NULL DEFAULT '{}',
    status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    published_at    timestamptz,
    seo_title       text NOT NULL DEFAULT '',
    seo_description text NOT NULL DEFAULT '',
    author_id       uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX blog_posts_status_idx ON blog_posts (status, published_at DESC);

-- ───────────── Audit log ─────────────
CREATE TABLE audit_logs (
    id         bigserial PRIMARY KEY,
    actor_id   uuid REFERENCES users (id) ON DELETE SET NULL,
    action     text NOT NULL,
    entity     text NOT NULL,
    entity_id  text NOT NULL DEFAULT '',
    data       jsonb NOT NULL DEFAULT '{}',
    ip         text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity, entity_id);

-- ───────────── Mentor scope helpers ─────────────
-- Courses a scoped mentor may see: directly assigned, or through an assigned batch.
CREATE FUNCTION mentor_course_ids(m uuid) RETURNS SETOF uuid
    LANGUAGE sql STABLE AS
$$
SELECT course_id FROM course_mentors WHERE user_id = m
UNION
SELECT b.course_id FROM batch_mentors bm JOIN batches b ON b.id = bm.batch_id WHERE bm.user_id = m
$$;

-- A scoped mentor sees a student enrolled in one of their courses or batches.
CREATE FUNCTION mentor_sees_student(m uuid, s uuid) RETURNS boolean
    LANGUAGE sql STABLE AS
$$
SELECT EXISTS (SELECT 1
                 FROM enrollments e
                WHERE e.student_id = s
                  AND (e.course_id IN (SELECT course_id FROM course_mentors WHERE user_id = m)
                       OR e.batch_id IN (SELECT batch_id FROM batch_mentors WHERE user_id = m)))
$$;
