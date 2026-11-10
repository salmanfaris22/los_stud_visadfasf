# API reference

The LMS API is gRPC only: **19 services, 183 RPCs**, served by one Go server on `:8080` that speaks gRPC, gRPC-Web and the Connect protocol (JSON or binary).
The contract is `proto/lms/v1/*.proto` (generated from `backend/internal/dto` and `backend/tools/rpcgen/spec.txt` with `make gen`).

| How to call | Detail |
|---|---|
| Path | `POST /lms.v1.<Service>/<Method>` (web apps: `/rpc/lms.v1.<Service>/<Method>` through Next.js). Read RPCs also accept Connect `GET`. |
| Body | Connect JSON (field names in camelCase or snake_case) or protobuf binary. |
| Auth | Web: httpOnly cookies from `AuthService.Login` plus header `X-LMS-App: admin\|student`. |
| Errors | Connect codes: `invalid_argument` 400, `unauthenticated` 401, `permission_denied` 403, `not_found` 404, `already_exists` 409, `resource_exhausted` 429. |
| Explore | `grpcurl -plaintext localhost:8080 list` (server reflection) |
| Plain HTTP | `/healthz`, `/api/v1/auth/google/{start,callback}`, `/api/v1/settings/google/{connect,callback}`, `/api/v1/files/{id}` |

Access: **public** = anyone · **signed in** = any user · **student** / **staff** = that kind of user · `module:action` = staff with that permission (super admins always pass).

## AdminService

Institute administration: analytics, the audit log and settings.

| RPC | Kind | Access | What it does |
|---|---|---|---|
| `GetAnalyticsOverview` | read | `analytics:view` | Dashboard numbers and charts |
| `ListAuditLog` | read | `audit:view` | Audit log |
| `GetSettings` | read | `settings:view` | Institute settings |
| `UpdateSettings` | write | `settings:edit` | Update settings |
| `DisconnectGoogle` | write | `settings:edit` | Disconnect the institute Google account |

## AnnouncementService

Announcements to students (posting one notifies them).

| RPC | Kind | Access | What it does |
|---|---|---|---|
| `ListAnnouncements` | read | `announcements:view` | List announcements |
| `CreateAnnouncement` | write | `announcements:create` | Post an announcement (notifies students) |
| `UpdateAnnouncement` | write | `announcements:edit` | Update an announcement |
| `DeleteAnnouncement` | write | `announcements:delete` | Delete an announcement |
| `ListMyAnnouncements` | read | student | Announcements for me |

## AuthService

AuthService signs users in and out and manages the signed-in user's own account. Web sessions live in httpOnly cookies set by Login/Register/Refresh; the portal is chosen by the X-LMS-App header (admin | student). Google sign-in stays a browser redirect (/api/v1/auth/google/start), outside gRPC.

| RPC | Kind | Access | What it does |
|---|---|---|---|
| `GetProviders` | read | public | Which sign-in options the portal shows. |
| `Login` | write | public · 20/1 min | Sign in with email and password; sets the session cookies. |
| `Register` | write | public · 10/60 min | Student self sign-up; sets the session cookies. |
| `Refresh` | write | public · 120/1 min | Rotates the refresh cookie and issues a new access cookie. |
| `Logout` | write | public | Signs out: revokes the refresh token and clears the cookies. |
| `GetMe` | read | signed in | The signed-in user. |
| `UpdateProfile` | write | signed in | Updates the signed-in user's own profile. |
| `ChangePassword` | write | signed in | Changes the signed-in user's password. |
| `ForgotPassword` | write | public · 5/15 min | Emails a password reset link (always answers the same, whether or not the email exists). |
| `ResetPassword` | write | public · 10/15 min | Sets a new password with a reset token. |

## BatchService

Batches, batch types and offline class attendance (incl. QR check-in).

| RPC | Kind | Access | What it does |
|---|---|---|---|
| `ListBatchTypes` | read | staff | List batch types |
| `CreateBatchType` | write | `batches:create` | Create a batch type (Online, Offline, Weekend…) |
| `UpdateBatchType` | write | `batches:edit` | Update a batch type |
| `DeleteBatchType` | write | `batches:delete` | Delete an unused batch type |
| `ListBatchOptions` | read | staff | Batches for pickers |
| `ListBatches` | read | `batches:view` | List batches |
| `CreateBatch` | write | `batches:create` | Create a batch |
| `GetBatch` | read | `batches:view` | Batch with mentors and students |
| `UpdateBatch` | write | `batches:edit` | Update a batch |
| `DeleteBatch` | write | `batches:delete` | Delete a batch |
| `AddBatchStudents` | write | `students:edit` | Enroll students into the batch |
| `ListClasses` | read | `attendance:view` | Offline class sessions of a batch |
| `CreateClass` | write | `attendance:create` | Schedule a class session |
| `UpdateClass` | write | `attendance:edit` | Update a class session |
| `DeleteClass` | write | `attendance:delete` | Delete a class session |
| `GetRoster` | read | `attendance:view` | Attendance roster |
| `MarkAttendance` | write | `attendance:edit` | Mark attendance |
| `StartClassQr` | write | `attendance:edit` | Start a 10-minute QR check-in |
| `CheckIn` | write | student · 30/1 min | Student QR check-in |
| `ListMyAttendance` | read | student | My offline class attendance |

## CertificateService

Course certificates: issue, revoke, download as PDF and verify publicly.

| RPC | Kind | Access | What it does |
|---|---|---|---|
| `ListCertificates` | read | `certificates:view` | List issued certificates |
| `IssueCertificate` | write | `certificates:create` | Issue a certificate manually |
| `RevokeCertificate` | write | `certificates:delete` | Revoke a certificate |
| `GetCertificatePdf` | read | `certificates:view` | Download a certificate PDF |
| `ListMyCertificates` | read | student | My certificates |
| `GetMyCertificatePdf` | read | student | Download my certificate |
| `VerifyCertificate` | read | public · 60/1 min | Verify a certificate code |

## CommentService

Video Q&A: questions and answers under lesson videos, and moderation.

| RPC | Kind | Access | What it does |
|---|---|---|---|
| `ListVideoComments` | read | signed in | Questions and answers under a video |
| `CreateVideoComment` | write | signed in | Ask a question or reply |
| `DeleteVideoComment` | write | signed in | Delete a comment |
| `PinVideoComment` | write | `comments:edit` | Pin or unpin a comment |
| `ListModerationComments` | read | `comments:view` | Recent comments across courses |

## CourseVersionService

CourseVersionService freezes a course curriculum into versions and moves students between them. A version holds which lessons, tasks and quizzes exist and their order. Each enrollment is on one version: new students get the latest, existing students stay until an admin moves them. Text edits to an existing lesson/task/quiz reach every version.

| RPC | Kind | Access | What it does |
|---|---|---|---|
| `GetVersionSummary` | read | `courses:view` | Versions (newest first), student counts, and what changed since the latest version. |
| `BuildVersion` | write | `courses:edit` | Freezes the current curriculum as the next version ("Build update"). |
| `ListVersionStudents` | read | `students:view` | Students enrolled in the course with the version each one is on. |
| `MoveStudents` | write | `students:edit` | Puts the chosen enrollments on a version. Their work is kept. |

## CourseService

Courses and their curriculum: videos and the tasks under them.

| RPC | Kind | Access | What it does |
|---|---|---|---|
| `ListCourseOptions` | read | staff | Courses for pickers |
| `ListCourses` | read | `courses:view` | List courses |
| `CreateCourse` | write | `courses:create` | Create a course |
| `GetCourse` | read | `courses:view` | Get a course |
| `UpdateCourse` | write | `courses:edit` | Update a course |
| `DeleteCourse` | write | `courses:delete` | Delete a course |
| `ParseVideoLink` | write | staff | Validate a video link and preview the embed |
| `GetCurriculum` | read | `courses:view` | Videos with their tasks |
| `CreateVideo` | write | `courses:create` | Add a video (YouTube / Vimeo / Bunny / Cloudflare) |
| `ReorderVideos` | write | `courses:edit` | Reorder videos |
| `UpdateVideo` | write | `courses:edit` | Update a video |
| `DeleteVideo` | write | `courses:delete` | Delete a video and its tasks |
| `CreateTask` | write | `courses:create` | Add a task under a video |
| `ReorderTasks` | write | `courses:edit` | Reorder tasks of a video |
| `UpdateTask` | write | `courses:edit` | Update a task |
| `DeleteTask` | write | `courses:delete` | Delete a task |

## LeadService

The sales CRM: leads, their pipeline stage, notes, calls, follow-ups and assignment.

| RPC | Kind | Access | What it does |
|---|---|---|---|
| `ListLeads` | read | `leads:view` | Leads in my sales scope, with counts per stage |
| `GetLead` | read | `leads:view` | Lead with activity and follow-ups |
| `ListLeadSources` | read | `leads:view` | Lead sources seen so far |
| `CreateLead` | write | `leads:create` | Add a lead by hand |
| `UpdateLead` | write | `leads:edit` | Update a lead's details |
| `DeleteLead` | write | `leads:delete` | Delete a lead |
| `SetLeadStage` | write | `leads:edit` | Move a lead to another stage |
| `AddLeadNote` | write | `leads:edit` | Add a note |
| `LogLeadCall` | write | `leads:edit` | Log a call |
| `AddFollowUp` | write | `leads:edit` | Schedule a follow-up |
| `CompleteFollowUp` | write | `leads:edit` | Mark a follow-up done |
| `DeleteFollowUp` | write | `leads:edit` | Delete a follow-up |
| `ListFollowUps` | read | `leads:view` | Open follow-ups (today, overdue or this week) |
| `AssignLead` | write | `leads:edit` | Assign a lead to a counsellor |
| `BulkAssignLeads` | write | `leads:edit` | Assign many leads at once |
| `TakeNextLead` | write | `leads:edit` | Take the next lead from the queue |
| `GetMySales` | read | `leads:view` | My counts, targets and availability |
| `SetAvailability` | write | `leads:view` | Turn new-lead assignment on or off for me |
| `ExportLeads` | read | `leads:view` | Download leads as CSV |
| `ImportLeads` | write | `leads:create` | Bulk add leads from CSV |

## LiveService

Live classes on Google Meet: schedule, attendance, recordings, calendar files.

| RPC | Kind | Access | What it does |
|---|---|---|---|
| `ListLive` | read | `live:view` | List live sessions |
| `CreateLive` | write | `live:create` | Schedule a Google Meet session |
| `GetLive` | read | `live:view` | Session with audience and attendance |
| `UpdateLive` | write | `live:edit` | Update a session |
| `DeleteLive` | write | `live:delete` | Delete a session |
| `MarkLiveAttendance` | write | `live:edit` | Mark attendance manually |
| `SetLiveRecording` | write | `live:edit` | Attach a recording link |
| `SyncLive` | write | `live:edit` | Sync with Google Calendar / Meet / Drive |
| `GetLiveIcs` | read | staff | Download .ics calendar file |
| `ListMyLive` | read | student | My upcoming or past live sessions |
| `JoinLive` | write | student | Join (records attendance) and get the Meet link |
| `GetMyLiveIcs` | read | student | Add a session to my calendar (.ics) |

## NotificationService

In-app notifications and the realtime event stream.

| RPC | Kind | Access | What it does |
|---|---|---|---|
| `ListNotifications` | read | signed in | My notifications and unread count |
| `MarkNotificationsRead` | write | signed in | Mark notifications as read (no ids = all) |
| `Subscribe` | stream | signed in | Realtime events for the signed-in user (server stream; the first event is "hello") |

## PipelineService

Sales setup: pipeline stages, lost reasons, teams, counsellors and assignment rules.

| RPC | Kind | Access | What it does |
|---|---|---|---|
| `ListStages` | read | `leads:view` | Pipeline stages in order |
| `CreateStage` | write | `sales_settings:edit` | Add a stage |
| `UpdateStage` | write | `sales_settings:edit` | Rename or recolour a stage |
| `DeleteStage` | write | `sales_settings:edit` | Delete an unused stage |
| `ReorderStages` | write | `sales_settings:edit` | Reorder stages |
| `ListLostReasons` | read | `leads:view` | Reasons a lead can be lost |
| `CreateLostReason` | write | `sales_settings:edit` | Add a lost reason |
| `DeleteLostReason` | write | `sales_settings:edit` | Delete a lost reason |
| `ListAssignmentRules` | read | `sales_settings:view` | Lead assignment rules |
| `SaveAssignmentRule` | write | `sales_settings:edit` | Add (no id) or update an assignment rule |
| `DeleteAssignmentRule` | write | `sales_settings:edit` | Delete an assignment rule |
| `ListTeams` | read | `leads:view` | Sales teams |
| `SaveTeam` | write | `sales_settings:edit` | Add (no id) or update a team |
| `DeleteTeam` | write | `sales_settings:edit` | Delete a team |
| `ListCounsellors` | read | `leads:view` | Counsellors (optionally of one team) |
| `UpdateCounsellor` | write | `sales_settings:edit` | Change a counsellor's team, capacity or targets |

## PortalService

The student portal: dashboard, my courses, the watch page and my tasks.

| RPC | Kind | Access | What it does |
|---|---|---|---|
| `GetDashboard` | read | student | Home: progress, next tasks, live classes, news |
| `ListMyCourses` | read | student | My enrolled courses with progress |
| `GetMyCourse` | read | student | Course overview and playlist |
| `GetWatchPage` | read | student | Watch page: player, playlist, tasks, quizzes |
| `ListMyTasks` | read | student | All my tasks with status |
| `GetMyTask` | read | student | Task page with attempts and conversation |
| `SubmitTask` | write | student | Submit a task |
| `CommentTask` | write | student | Message the mentor about a task |

## QuizService

Quizzes under videos: authoring, attempts, and the student quiz player.

| RPC | Kind | Access | What it does |
|---|---|---|---|
| `ListVideoQuizzes` | read | `quizzes:view` | Quizzes under a video |
| `CreateQuiz` | write | `quizzes:create` | Create a quiz with questions |
| `GetQuiz` | read | `quizzes:view` | Quiz with questions and answers |
| `UpdateQuiz` | write | `quizzes:edit` | Replace a quiz |
| `DeleteQuiz` | write | `quizzes:delete` | Delete a quiz |
| `ListQuizAttempts` | read | `quizzes:view` | Submitted attempts |
| `ListMyVideoQuizzes` | read | student | My quizzes for a video |
| `StartQuiz` | write | student | Start or resume an attempt |
| `SubmitQuiz` | write | student | Submit answers and get the result |

## SiteService

The public website (no sign-in) and its admin: landing page blocks and the blog.

| RPC | Kind | Access | What it does |
|---|---|---|---|
| `GetSite` | read | public | Branding and landing page content |
| `ListPublicCourses` | read | public | Course catalog |
| `ListCategories` | read | public | Catalog categories |
| `GetPublicCourse` | read | public | Course page: syllabus, mentors, batches |
| `ListPublicPosts` | read | public | Published blog posts |
| `GetPublicPost` | read | public | One blog post |
| `SendEnquiry` | write | public · 10/60 min | Enquiry / contact form |
| `ListCmsBlocks` | read | `cms:view` | Landing page blocks |
| `SaveCmsBlock` | write | `cms:edit` | Save a landing page block |
| `ListPosts` | read | `blog:view` | Blog posts |
| `CreatePost` | write | `blog:create` | Write a blog post |
| `GetPost` | read | `blog:view` | Get a blog post |
| `UpdatePost` | write | `blog:edit` | Update a blog post |
| `DeletePost` | write | `blog:delete` | Delete a blog post |

## StaffService

Staff users, roles and the permission matrix.

| RPC | Kind | Access | What it does |
|---|---|---|---|
| `GetPermissionCatalog` | read | staff | Modules and actions for the permission matrix |
| `ListRoles` | read | `roles:view` | List roles |
| `GetRole` | read | `roles:view` | Get a role |
| `CreateRole` | write | `roles:create` | Create a role |
| `UpdateRole` | write | `roles:edit` | Update a role and its permissions |
| `DeleteRole` | write | `roles:delete` | Delete a role |
| `ListStaffOptions` | read | staff | Active staff for pickers |
| `ListStaff` | read | `users:view` | List staff users |
| `GetStaff` | read | `users:view` | Get a staff user |
| `CreateStaff` | write | `users:create` | Create a staff user (admin / mentor) |
| `UpdateStaff` | write | `users:edit` | Update a staff user |
| `DeleteStaff` | write | `users:delete` | Delete a staff user |

## StudentService

Students and their course enrollments.

| RPC | Kind | Access | What it does |
|---|---|---|---|
| `ListStudents` | read | `students:view` | List students |
| `ExportStudents` | read | `students:view` | Download students as CSV |
| `ImportStudents` | write | `students:create` | Bulk create students from CSV |
| `GetStudent` | read | `students:view` | Student profile with enrollments |
| `CreateStudent` | write | `students:create` | Create a student and assign courses |
| `UpdateStudent` | write | `students:edit` | Update a student |
| `DeleteStudent` | write | `students:delete` | Delete a student |
| `EnrollStudent` | write | `students:edit` | Assign a course to a student |
| `UpdateEnrollment` | write | `students:edit` | Change batch or status of an enrollment |
| `DeleteEnrollment` | write | `students:edit` | Remove a course from a student |

## SubmissionService

Task reviews: the review queue, reviews and the task conversation with a student.

| RPC | Kind | Access | What it does |
|---|---|---|---|
| `ListSubmissions` | read | `submissions:view` | Review queue |
| `GetSubmission` | read | `submissions:view` | Submission with history and thread |
| `ReviewSubmission` | write | `submissions:edit` | Approve, reject or ask to resubmit |
| `GetThread` | read | `submissions:view` | Task conversation with a student |
| `ReplyThread` | write | `submissions:edit` | Reply in a task conversation |

## UploadService

Direct uploads to object storage: presign, PUT the bytes, then confirm.

| RPC | Kind | Access | What it does |
|---|---|---|---|
| `PresignUpload` | write | signed in · 60/1 min | Get a URL to upload a file straight to storage |
| `CompleteUpload` | write | signed in | Confirm an upload finished |
