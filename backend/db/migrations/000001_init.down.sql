DROP FUNCTION IF EXISTS mentor_sees_student(uuid, uuid);
DROP FUNCTION IF EXISTS mentor_course_ids(uuid);
DROP TABLE IF EXISTS audit_logs, blog_posts, leads, cms_blocks, notifications, announcements,
    video_comments, certificates, quiz_attempts, quiz_options, quiz_questions, quizzes,
    class_attendance, class_sessions, live_attendance, live_targets, live_sessions CASCADE;
DROP VIEW IF EXISTS enrollment_progress;
DROP TABLE IF EXISTS task_comments, submission_items, submissions, uploads, tasks, videos,
    enrollments, batch_mentors, batches, batch_types, course_mentors, courses, google_tokens,
    settings, user_roles, role_permissions, roles, password_resets, refresh_tokens, users CASCADE;
DROP SEQUENCE IF EXISTS student_code_seq;
