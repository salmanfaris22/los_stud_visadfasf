# API reference

Generated from `backend/internal/handler/*.go` by `scripts/gen-api-docs.py` — **147 JSON endpoints** in 19 groups.
Interactive docs: run the API and open **http://localhost:8080/docs** (OpenAPI 3.1 at `/openapi.json`).

Every request sends `X-LMS-App: admin|student`. Auth uses httpOnly cookies (`lms_<app>_at` 15 min, `lms_<app>_rt` 7 days).
Access column: `module:action` = staff permission from roles (super admins pass everything) · *student* = student account · *signed in* = any user.

| Group | Endpoints |
|---|---|
| [Auth](#auth) | 10 |
| [Staff & roles](#staff--roles) | 12 |
| [Students](#students) | 10 |
| [Courses](#courses) | 6 |
| [Curriculum](#curriculum) | 10 |
| [Batches](#batches) | 11 |
| [Attendance](#attendance) | 9 |
| [Task reviews](#task-reviews) | 5 |
| [Uploads](#uploads) | 2 |
| [Quizzes](#quizzes) | 9 |
| [Certificates](#certificates) | 6 |
| [Live sessions](#live-sessions) | 12 |
| [Announcements](#announcements) | 5 |
| [Video Q&A](#video-qa) | 5 |
| [Notifications](#notifications) | 3 |
| [Student portal](#student-portal) | 8 |
| [Public website](#public-website) | 8 |
| [Website admin](#website-admin) | 11 |
| [Admin](#admin) | 5 |

## Auth

| Method | Path | Access | What it does |
|---|---|---|---|
| `POST` | `/api/v1/auth/change-password` | signed in | Change own password |
| `POST` | `/api/v1/auth/forgot` | rate 5/15×Minute | Email a password reset link |
| `POST` | `/api/v1/auth/login` | rate 20/Minute | Sign in with email and password |
| `POST` | `/api/v1/auth/logout` | public | Sign out |
| `GET` | `/api/v1/auth/me` | signed in | Current user |
| `PUT` | `/api/v1/auth/me` | signed in | Update own profile |
| `GET` | `/api/v1/auth/providers` | public | Available sign-in options |
| `POST` | `/api/v1/auth/refresh` | rate 120/Minute | Rotate the refresh token |
| `POST` | `/api/v1/auth/register` | rate 10/Hour | Student self sign-up |
| `POST` | `/api/v1/auth/reset` | rate 10/15×Minute | Set a new password with a reset token |

## Staff & roles

| Method | Path | Access | What it does |
|---|---|---|---|
| `GET` | `/api/v1/permissions/modules` | staff | Modules and actions for the permission matrix |
| `GET` | `/api/v1/roles` | `roles:view` | List roles |
| `POST` | `/api/v1/roles` | `roles:create` | Create a role |
| `DELETE` | `/api/v1/roles/{id}` | `roles:delete` | Delete a role |
| `GET` | `/api/v1/roles/{id}` | `roles:view` | Get a role |
| `PUT` | `/api/v1/roles/{id}` | `roles:edit` | Update a role and its permissions |
| `GET` | `/api/v1/staff` | `users:view` | List staff users |
| `POST` | `/api/v1/staff` | `users:create` | Create a staff user (admin / mentor) |
| `GET` | `/api/v1/staff/options` | staff | Active staff for pickers |
| `DELETE` | `/api/v1/staff/{id}` | `users:delete` | Delete a staff user |
| `GET` | `/api/v1/staff/{id}` | `users:view` | Get a staff user |
| `PUT` | `/api/v1/staff/{id}` | `users:edit` | Update a staff user |

## Students

| Method | Path | Access | What it does |
|---|---|---|---|
| `DELETE` | `/api/v1/enrollments/{id}` | `students:edit` | Remove a course from a student |
| `PUT` | `/api/v1/enrollments/{id}` | `students:edit` | Change batch or status of an enrollment |
| `GET` | `/api/v1/students` | `students:view` | List students |
| `POST` | `/api/v1/students` | `students:create` | Create a student and assign courses |
| `GET` | `/api/v1/students/export` | `students:view` | Download students as CSV |
| `POST` | `/api/v1/students/import` | `students:create` | Bulk create students from CSV |
| `DELETE` | `/api/v1/students/{id}` | `students:delete` | Delete a student |
| `GET` | `/api/v1/students/{id}` | `students:view` | Student profile with enrollments |
| `PUT` | `/api/v1/students/{id}` | `students:edit` | Update a student |
| `POST` | `/api/v1/students/{id}/enrollments` | `students:edit` | Assign a course to a student |

## Courses

| Method | Path | Access | What it does |
|---|---|---|---|
| `GET` | `/api/v1/courses` | `courses:view` | List courses |
| `POST` | `/api/v1/courses` | `courses:create` | Create a course |
| `GET` | `/api/v1/courses/options` | staff | Courses for pickers |
| `DELETE` | `/api/v1/courses/{id}` | `courses:delete` | Delete a course |
| `GET` | `/api/v1/courses/{id}` | `courses:view` | Get a course |
| `PUT` | `/api/v1/courses/{id}` | `courses:edit` | Update a course |

## Curriculum

| Method | Path | Access | What it does |
|---|---|---|---|
| `GET` | `/api/v1/courses/{id}/curriculum` | `courses:view` | Videos with their tasks |
| `POST` | `/api/v1/courses/{id}/videos` | `courses:create` | Add a video (YouTube / Vimeo / Bunny / Cloudflare) |
| `PUT` | `/api/v1/courses/{id}/videos/order` | `courses:edit` | Reorder videos |
| `DELETE` | `/api/v1/tasks/{id}` | `courses:delete` | Delete a task |
| `PUT` | `/api/v1/tasks/{id}` | `courses:edit` | Update a task |
| `POST` | `/api/v1/videos/parse` | staff | Validate a video link and preview the embed |
| `DELETE` | `/api/v1/videos/{id}` | `courses:delete` | Delete a video and its tasks |
| `PUT` | `/api/v1/videos/{id}` | `courses:edit` | Update a video |
| `POST` | `/api/v1/videos/{id}/tasks` | `courses:create` | Add a task under a video |
| `PUT` | `/api/v1/videos/{id}/tasks/order` | `courses:edit` | Reorder tasks of a video |

## Batches

| Method | Path | Access | What it does |
|---|---|---|---|
| `GET` | `/api/v1/batch-types` | staff | List batch types |
| `POST` | `/api/v1/batch-types` | `batches:create` | Create a batch type (Online, Offline, Weekend…) |
| `DELETE` | `/api/v1/batch-types/{id}` | `batches:delete` | Delete an unused batch type |
| `PUT` | `/api/v1/batch-types/{id}` | `batches:edit` | Update a batch type |
| `GET` | `/api/v1/batches` | `batches:view` | List batches |
| `POST` | `/api/v1/batches` | `batches:create` | Create a batch |
| `GET` | `/api/v1/batches/options` | staff | Batches for pickers |
| `DELETE` | `/api/v1/batches/{id}` | `batches:delete` | Delete a batch |
| `GET` | `/api/v1/batches/{id}` | `batches:view` | Batch with mentors and students |
| `PUT` | `/api/v1/batches/{id}` | `batches:edit` | Update a batch |
| `POST` | `/api/v1/batches/{id}/students` | `students:edit` | Enroll students into the batch |

## Attendance

| Method | Path | Access | What it does |
|---|---|---|---|
| `GET` | `/api/v1/batches/{id}/classes` | `attendance:view` | Offline class sessions of a batch |
| `POST` | `/api/v1/batches/{id}/classes` | `attendance:create` | Schedule a class session |
| `DELETE` | `/api/v1/classes/{id}` | `attendance:delete` | Delete a class session |
| `PUT` | `/api/v1/classes/{id}` | `attendance:edit` | Update a class session |
| `GET` | `/api/v1/classes/{id}/attendance` | `attendance:view` | Attendance roster |
| `PUT` | `/api/v1/classes/{id}/attendance` | `attendance:edit` | Mark attendance |
| `POST` | `/api/v1/classes/{id}/qr` | `attendance:edit` | Start a 10-minute QR check-in |
| `GET` | `/api/v1/me/attendance` | student | My offline class attendance |
| `POST` | `/api/v1/me/attendance/checkin` | student · rate 30/Minute | Student QR check-in |

## Task reviews

| Method | Path | Access | What it does |
|---|---|---|---|
| `GET` | `/api/v1/submissions` | `submissions:view` | Review queue |
| `GET` | `/api/v1/submissions/{id}` | `submissions:view` | Submission with history and thread |
| `POST` | `/api/v1/submissions/{id}/review` | `submissions:edit` | Approve, reject or ask to resubmit |
| `GET` | `/api/v1/tasks/{task_id}/threads/{student_id}` | `submissions:view` | Task conversation with a student |
| `POST` | `/api/v1/tasks/{task_id}/threads/{student_id}` | `submissions:edit` | Reply in a task conversation |

## Uploads

| Method | Path | Access | What it does |
|---|---|---|---|
| `POST` | `/api/v1/uploads/presign` | signed in · rate 60/Minute | Get a URL to upload a file straight to storage |
| `POST` | `/api/v1/uploads/{id}/complete` | signed in | Confirm an upload finished |

## Quizzes

| Method | Path | Access | What it does |
|---|---|---|---|
| `POST` | `/api/v1/me/quiz-attempts/{id}/submit` | student | Submit answers and get the result |
| `POST` | `/api/v1/me/quizzes/{id}/start` | student | Start or resume an attempt |
| `GET` | `/api/v1/me/videos/{id}/quizzes` | student | My quizzes for a video |
| `DELETE` | `/api/v1/quizzes/{id}` | `quizzes:delete` | Delete a quiz |
| `GET` | `/api/v1/quizzes/{id}` | `quizzes:view` | Quiz with questions and answers |
| `PUT` | `/api/v1/quizzes/{id}` | `quizzes:edit` | Replace a quiz |
| `GET` | `/api/v1/quizzes/{id}/attempts` | `quizzes:view` | Submitted attempts |
| `GET` | `/api/v1/videos/{id}/quizzes` | `quizzes:view` | Quizzes under a video |
| `POST` | `/api/v1/videos/{id}/quizzes` | `quizzes:create` | Create a quiz with questions |

## Certificates

| Method | Path | Access | What it does |
|---|---|---|---|
| `GET` | `/api/v1/certificates` | `certificates:view` | List issued certificates |
| `POST` | `/api/v1/certificates` | `certificates:create` | Issue a certificate manually |
| `DELETE` | `/api/v1/certificates/{id}` | `certificates:delete` | Revoke a certificate |
| `GET` | `/api/v1/certificates/{id}/pdf` | `certificates:view` | Download a certificate PDF |
| `GET` | `/api/v1/me/certificates` | student | My certificates |
| `GET` | `/api/v1/me/certificates/{id}/pdf` | student | Download my certificate |

## Live sessions

| Method | Path | Access | What it does |
|---|---|---|---|
| `GET` | `/api/v1/live` | `live:view` | List live sessions |
| `POST` | `/api/v1/live` | `live:create` | Schedule a Google Meet session |
| `DELETE` | `/api/v1/live/{id}` | `live:delete` | Delete a session |
| `GET` | `/api/v1/live/{id}` | `live:view` | Session with audience and attendance |
| `PUT` | `/api/v1/live/{id}` | `live:edit` | Update a session |
| `PUT` | `/api/v1/live/{id}/attendance` | `live:edit` | Mark attendance manually |
| `GET` | `/api/v1/live/{id}/ics` | staff | Download .ics calendar file |
| `PUT` | `/api/v1/live/{id}/recording` | `live:edit` | Attach a recording link |
| `POST` | `/api/v1/live/{id}/sync` | `live:edit` | Sync with Google Calendar / Meet / Drive |
| `GET` | `/api/v1/me/live` | student | My upcoming or past live sessions |
| `GET` | `/api/v1/me/live/{id}/ics` | student | Add a session to my calendar (.ics) |
| `POST` | `/api/v1/me/live/{id}/join` | student | Join (records attendance) and get the Meet link |

## Announcements

| Method | Path | Access | What it does |
|---|---|---|---|
| `GET` | `/api/v1/announcements` | `announcements:view` | List announcements |
| `POST` | `/api/v1/announcements` | `announcements:create` | Post an announcement (notifies students) |
| `DELETE` | `/api/v1/announcements/{id}` | `announcements:delete` | Delete an announcement |
| `PUT` | `/api/v1/announcements/{id}` | `announcements:edit` | Update an announcement |
| `GET` | `/api/v1/me/announcements` | student | Announcements for me |

## Video Q&A

| Method | Path | Access | What it does |
|---|---|---|---|
| `GET` | `/api/v1/comments` | `comments:view` | Recent comments across courses |
| `DELETE` | `/api/v1/comments/{id}` | signed in | Delete a comment |
| `PUT` | `/api/v1/comments/{id}/pin` | `comments:edit` | Pin or unpin a comment |
| `GET` | `/api/v1/videos/{id}/comments` | signed in | Questions and answers under a video |
| `POST` | `/api/v1/videos/{id}/comments` | signed in | Ask a question or reply |

## Notifications

| Method | Path | Access | What it does |
|---|---|---|---|
| `GET` | `/api/v1/notifications` | signed in | My notifications and unread count |
| `POST` | `/api/v1/notifications/read` | signed in | Mark notifications as read |
| `POST` | `/api/v1/ws/ticket` | signed in | One-time ticket to open the realtime WebSocket |

## Student portal

| Method | Path | Access | What it does |
|---|---|---|---|
| `GET` | `/api/v1/me/courses` | student | My enrolled courses with progress |
| `GET` | `/api/v1/me/courses/{id}` | student | Course overview and playlist |
| `GET` | `/api/v1/me/dashboard` | student | Home: progress, next tasks, live classes, news |
| `GET` | `/api/v1/me/tasks` | student | All my tasks with status |
| `GET` | `/api/v1/me/tasks/{id}` | student | Task page with attempts and conversation |
| `POST` | `/api/v1/me/tasks/{id}/comments` | student | Message the mentor about a task |
| `POST` | `/api/v1/me/tasks/{id}/submissions` | student | Submit a task |
| `GET` | `/api/v1/me/videos/{id}` | student | Watch page: player, playlist, tasks, quizzes |

## Public website

| Method | Path | Access | What it does |
|---|---|---|---|
| `GET` | `/api/v1/public/blog` | public | Published blog posts |
| `GET` | `/api/v1/public/blog/{slug}` | public | One blog post |
| `GET` | `/api/v1/public/categories` | public | Catalog categories |
| `GET` | `/api/v1/public/certificates/{code}` | rate 60/Minute | Verify a certificate code |
| `GET` | `/api/v1/public/courses` | public | Course catalog |
| `GET` | `/api/v1/public/courses/{slug}` | public | Course page: syllabus, mentors, batches |
| `POST` | `/api/v1/public/leads` | rate 10/Hour | Enquiry / contact form |
| `GET` | `/api/v1/public/site` | public | Branding and landing page content |

## Website admin

| Method | Path | Access | What it does |
|---|---|---|---|
| `GET` | `/api/v1/blog` | `blog:view` | Blog posts |
| `POST` | `/api/v1/blog` | `blog:create` | Write a blog post |
| `DELETE` | `/api/v1/blog/{id}` | `blog:delete` | Delete a blog post |
| `GET` | `/api/v1/blog/{id}` | `blog:view` | Get a blog post |
| `PUT` | `/api/v1/blog/{id}` | `blog:edit` | Update a blog post |
| `GET` | `/api/v1/cms` | `cms:view` | Landing page blocks |
| `PUT` | `/api/v1/cms/{key}` | `cms:edit` | Save a landing page block |
| `GET` | `/api/v1/leads` | `leads:view` | Enquiries |
| `GET` | `/api/v1/leads/export` | `leads:view` | Download enquiries as CSV |
| `DELETE` | `/api/v1/leads/{id}` | `leads:delete` | Delete a lead |
| `PUT` | `/api/v1/leads/{id}` | `leads:edit` | Update lead status / notes |

## Admin

| Method | Path | Access | What it does |
|---|---|---|---|
| `GET` | `/api/v1/analytics/overview` | `analytics:view` | Dashboard numbers and charts |
| `GET` | `/api/v1/audit` | `audit:view` | Audit log |
| `GET` | `/api/v1/settings` | `settings:view` | Institute settings |
| `PUT` | `/api/v1/settings` | `settings:edit` | Update settings |
| `DELETE` | `/api/v1/settings/google` | `settings:edit` | Disconnect the institute Google account |

## Non-JSON routes

| Method | Path | What it does |
|---|---|---|
| `GET` | `/healthz` | DB / Redis / storage health |
| `GET` | `/ws?ticket=…` | Realtime WebSocket (ticket from `POST /api/v1/ws/ticket`) |
| `GET` | `/api/v1/files/{id}` | Access-checked redirect to a signed download URL |
| `GET` | `/api/v1/auth/google/start?app=` | Google sign-in redirect |
| `GET` | `/api/v1/auth/google/callback` | Google sign-in callback |
| `GET` | `/api/v1/settings/google/connect` | Connect institute Google account (Calendar/Meet/Drive) |
| `GET` | `/api/v1/settings/google/callback` | Google connect callback |
| `GET` | `/docs` · `/openapi.json` | Interactive API docs and spec |
