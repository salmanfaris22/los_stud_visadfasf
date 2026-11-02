// Command seed creates the built-in roles, the super admin, batch types and default website
// content. With -demo it also adds a mentor, students, two courses with videos, tasks, a quiz,
// batches, a live session, an announcement, a blog post and a lead. Safe to run repeatedly.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	dbfiles "github.com/lms/backend/db"
	"github.com/lms/backend/internal/auth"
	"github.com/lms/backend/internal/config"
	"github.com/lms/backend/internal/platform/secure"
	"github.com/lms/backend/internal/repository"
	"github.com/lms/backend/internal/service"
)

var (
	ctx = context.Background()
	q   *repository.Queries
)

func main() {
	demo := flag.Bool("demo", false, "also create demo courses, students and activity")
	flag.Parse()
	cfg, err := config.Load()
	must(err)
	must(dbfiles.Up(cfg.DatabaseURL))
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	must(err)
	defer pool.Close()
	q = repository.New(pool)

	all := map[string][]string{}
	for _, m := range auth.Modules {
		all[m.Key] = auth.Actions
	}
	adminRole := role("Admin", "Full access to everything", false, all)
	mentorRole := role("Mentor", "Teaches assigned courses and batches: content, reviews, live classes, attendance", true, auth.MentorDefaults)
	role("Content Manager", "Builds courses, quizzes and the website", false, map[string][]string{
		"courses": auth.Actions, "quizzes": auth.Actions, "cms": auth.Actions, "blog": auth.Actions, "comments": {"view", "edit"}, "batches": {"view"},
	})
	role("Counsellor", "Handles enquiries and enrolls students", false, map[string][]string{
		"leads": auth.Actions, "students": {"view", "create", "edit"}, "courses": {"view"}, "batches": {"view"},
	})
	admin := user(auth.KindStaff, cfg.SeedAdminEmail, cfg.SeedAdminPassword, "Super Admin", true)
	_ = q.AddUserRole(ctx, repository.AddUserRoleParams{UserID: admin.ID, RoleID: adminRole.ID})

	online := batchType("Online", false, "#6366f1")
	offline := batchType("Offline", true, "#f59e0b")
	cms()
	fmt.Println("✔ roles, super admin, batch types and website content ready")
	fmt.Printf("  admin login: %s / %s\n", cfg.SeedAdminEmail, cfg.SeedAdminPassword)

	if *demo {
		seedDemo(admin, mentorRole, online, offline)
	}
}

func must(err error) {
	if err != nil {
		log.Fatal(err)
	}
}

func role(name, desc string, scoped bool, perms map[string][]string) repository.Role {
	r, err := q.GetRoleByName(ctx, name)
	if errors.Is(err, pgx.ErrNoRows) {
		r, err = q.CreateRole(ctx, repository.CreateRoleParams{Name: name, Description: desc, Scoped: scoped, IsSystem: name == "Admin" || name == "Mentor"})
		must(err)
		must(service.SaveRolePermissions(ctx, q, r.ID, perms))
	}
	must(err)
	return r
}

func user(kind, email, password, name string, super bool) repository.User {
	u, err := q.GetUserByEmail(ctx, email)
	if errors.Is(err, pgx.ErrNoRows) {
		hash, herr := secure.HashPassword(password)
		must(herr)
		u, err = q.CreateUser(ctx, repository.CreateUserParams{Kind: kind, Email: email, PasswordHash: &hash, Name: name, IsSuperAdmin: super, Status: "active"})
	}
	must(err)
	return u
}

func batchType(name string, offline bool, color string) repository.BatchType {
	t, err := q.GetBatchTypeByName(ctx, name)
	if errors.Is(err, pgx.ErrNoRows) {
		t, err = q.CreateBatchType(ctx, repository.CreateBatchTypeParams{Name: name, IsOffline: offline, Color: color})
	}
	must(err)
	return t
}

func block(key string, v any) {
	raw, err := json.Marshal(v)
	must(err)
	must(q.InsertCMSBlockIfMissing(ctx, repository.InsertCMSBlockIfMissingParams{Key: key, Data: raw}))
}

func cms() {
	block("hero", map[string]any{
		"badge":     "New batches every month",
		"title":     "Learn skills that get you hired",
		"highlight": "hired",
		"subtitle":  "Video lessons, hands-on tasks reviewed by real mentors, live classes and certificates — all in one place.",
		"cta_text":  "Explore courses", "cta_link": "/courses",
		"secondary_text": "Talk to us", "secondary_link": "/contact",
	})
	block("stats", map[string]any{"items": []map[string]string{
		{"value": "12k+", "label": "Learners"}, {"value": "95%", "label": "Task completion"}, {"value": "60+", "label": "Live classes / month"}, {"value": "4.8★", "label": "Average rating"},
	}})
	block("features", map[string]any{"title": "Everything you need to learn by doing", "items": []map[string]string{
		{"icon": "play", "title": "YouTube-style lessons", "body": "Short focused videos with a playlist, notes and Q&A under every lesson."},
		{"icon": "check", "title": "Tasks reviewed by mentors", "body": "Submit files, links, code or images. Get marks, feedback and approval."},
		{"icon": "video", "title": "Live Google Meet classes", "body": "Join live sessions from your calendar, catch up with recordings."},
		{"icon": "chart", "title": "Track your progress", "body": "See exactly which tasks are done and what is next."},
		{"icon": "award", "title": "Verified certificates", "body": "Every certificate has a QR code employers can verify."},
		{"icon": "users", "title": "Online & offline batches", "body": "Learn from home or join classroom batches near you."},
	}})
	block("how", map[string]any{"title": "How it works", "steps": []map[string]string{
		{"title": "Enroll", "body": "Pick a course and join a batch."}, {"title": "Watch & practice", "body": "Watch lessons and complete the tasks under each video."},
		{"title": "Get reviewed", "body": "Mentors approve your work or help you improve it."}, {"title": "Get certified", "body": "Finish every task to unlock your certificate."},
	}})
	block("testimonials", map[string]any{"items": []map[string]string{
		{"name": "Aisha K.", "role": "Backend developer", "quote": "The task reviews were the game changer. Real feedback on real code."},
		{"name": "Rahul M.", "role": "Frontend engineer", "quote": "Live classes plus recordings meant I never fell behind."},
		{"name": "Neha S.", "role": "Career switcher", "quote": "Went from zero to my first job offer in six months."},
	}})
	block("faqs", map[string]any{"items": []map[string]string{
		{"q": "Do I need any experience?", "a": "No. Every course starts from the basics and builds up with tasks."},
		{"q": "How are tasks reviewed?", "a": "Mentors check every submission, give marks and feedback, and approve or ask you to resubmit."},
		{"q": "Are classes online or offline?", "a": "Both. Choose an online batch or a classroom batch when you enroll."},
		{"q": "Will I get a certificate?", "a": "Yes — complete all tasks in a course and the certificate is issued automatically."},
	}})
	block("cta", map[string]any{"title": "Start learning today", "subtitle": "Join the next batch and build real projects with mentor support.", "button_text": "Get started", "button_link": "/register"})
	block("footer", map[string]any{"about": "A modern learning platform with video lessons, mentor-reviewed tasks and live classes.",
		"email": "hello@lms.local", "phone": "+91 90000 00000", "address": "Kochi, Kerala, India"})
}

func seedDemo(admin repository.User, mentorRole repository.Role, online, offline repository.BatchType) {
	mentor := user(auth.KindStaff, "mentor@lms.local", "Mentor@12345", "Maya Mentor", false)
	_ = q.AddUserRole(ctx, repository.AddUserRoleParams{UserID: mentor.ID, RoleID: mentorRole.ID})
	students := []repository.User{
		user(auth.KindStudent, "student@lms.local", "Student@12345", "Arjun Student", false),
		user(auth.KindStudent, "priya@lms.local", "Student@12345", "Priya Nair", false),
		user(auth.KindStudent, "rahul@lms.local", "Student@12345", "Rahul Menon", false),
	}

	goCourse := course("go-backend-mastery", "Go Backend Mastery", "Build fast, clean REST APIs with Go and PostgreSQL", "Backend", admin.ID,
		[]string{"Go syntax and tooling", "REST APIs with net/http and chi", "PostgreSQL with sqlc", "Testing and deployment"})
	nextCourse := course("nextjs-frontend-bootcamp", "Next.js Frontend Bootcamp", "Modern React apps with the Next.js App Router", "Frontend", admin.ID,
		[]string{"React fundamentals", "App Router and server components", "Data fetching and forms", "Shipping to production"})
	_ = q.AddCourseMentors(ctx, repository.AddCourseMentorsParams{CourseID: goCourse.ID, UserIds: []uuid.UUID{mentor.ID}})

	v1 := video(goCourse.ID, "Go in 100 seconds", "youtube", "https://www.youtube.com/watch?v=446E-r0rXHI", 140, true)
	v2 := video(goCourse.ID, "Go programming full course", "youtube", "https://youtu.be/un6ZyFkqFKo", 25200, false)
	v3 := video(goCourse.ID, "Project kickoff (Vimeo)", "vimeo", "https://vimeo.com/1084537", 597, false)
	n1 := video(nextCourse.ID, "Next.js in 100 seconds", "youtube", "https://www.youtube.com/watch?v=Sklc_fQBmcs", 750, true)
	video(nextCourse.ID, "React in 100 seconds", "youtube", "https://www.youtube.com/watch?v=Tn6-PIqc4UM", 140, false)

	due := time.Now().AddDate(0, 0, 7)
	t1 := task(v1.ID, "Install Go and print hello", "Install Go, run `go version` and share a screenshot plus your hello.go code.", []string{"image", "code"}, nil)
	t2 := task(v2.ID, "Build a CLI todo app", "Write a small CLI todo app. Push it to GitHub and share the link.", []string{"link", "file", "text"}, &due)
	task(v3.ID, "Plan your project", "Write a one-page plan for your capstone API. Upload a PDF or share a Google Drive link.", []string{"file", "drive", "text"}, &due)
	task(n1.ID, "Create a Next.js app", "Create an app with create-next-app and share the repo link.", []string{"link"}, nil)

	goBatch := batch(goCourse.ID, online.ID, "Go — Online Jan 2027", "Mon, Wed, Fri · 7–9 PM IST", "")
	kochi := batch(goCourse.ID, offline.ID, "Go — Kochi Classroom", "Sat & Sun · 10 AM–1 PM", "Infopark, Kochi")
	_ = q.AddBatchMentors(ctx, repository.AddBatchMentorsParams{BatchID: goBatch.ID, UserIds: []uuid.UUID{mentor.ID}})
	enroll(students[0].ID, goCourse.ID, &goBatch.ID, admin.ID)
	enroll(students[1].ID, goCourse.ID, &kochi.ID, admin.ID)
	enroll(students[2].ID, goCourse.ID, &goBatch.ID, admin.ID)
	enroll(students[0].ID, nextCourse.ID, nil, admin.ID)

	// Arjun: task 1 approved, task 2 waiting for review.
	if _, err := q.LatestSubmission(ctx, repository.LatestSubmissionParams{TaskID: t1.ID, StudentID: students[0].ID}); errors.Is(err, pgx.ErrNoRows) {
		s1, err := q.CreateSubmission(ctx, repository.CreateSubmissionParams{TaskID: t1.ID, StudentID: students[0].ID})
		must(err)
		_, err = q.AddSubmissionItem(ctx, repository.AddSubmissionItemParams{SubmissionID: s1.ID, Kind: "code", Content: "package main\n\nimport \"fmt\"\n\nfunc main() {\n\tfmt.Println(\"hello, LMS\")\n}", Language: "go"})
		must(err)
		marks := int32(9)
		_, err = q.ReviewSubmission(ctx, repository.ReviewSubmissionParams{ID: s1.ID, Status: "approved", Marks: &marks, Feedback: "Clean and correct. Nice start!", ReviewedBy: &mentor.ID})
		must(err)
		s2, err := q.CreateSubmission(ctx, repository.CreateSubmissionParams{TaskID: t2.ID, StudentID: students[0].ID})
		must(err)
		_, err = q.AddSubmissionItem(ctx, repository.AddSubmissionItemParams{SubmissionID: s2.ID, Kind: "link", Content: "https://github.com/example/go-todo"})
		must(err)
		_, err = q.CreateTaskComment(ctx, repository.CreateTaskCommentParams{TaskID: t2.ID, StudentID: students[0].ID, AuthorID: students[0].ID, Body: "Should I add tests too?"})
		must(err)
	}

	// Quiz under the first Go video.
	if qs, _ := q.ListVideoQuizzes(ctx, v1.ID); len(qs) == 0 {
		quiz, err := q.CreateQuiz(ctx, repository.CreateQuizParams{VideoID: v1.ID, Title: "Go basics check", Description: "Five quick questions", PassPct: 60, TimeLimitMinutes: 10, MaxAttempts: 3})
		must(err)
		questions := []struct {
			body    string
			options []string
			correct int
		}{
			{"Which keyword declares a function in Go?", []string{"func", "function", "def", "fn"}, 0},
			{"What does `go run` do?", []string{"Formats code", "Compiles and runs", "Downloads modules", "Runs tests"}, 1},
			{"Which type is used for text?", []string{"char", "text", "string", "str"}, 2},
			{"How do you start a goroutine?", []string{"async f()", "go f()", "spawn f()", "thread f()"}, 1},
			{"Which tool formats Go code?", []string{"gofmt", "prettier", "black", "eslint"}, 0},
		}
		for i, qq := range questions {
			row, err := q.CreateQuizQuestion(ctx, repository.CreateQuizQuestionParams{QuizID: quiz.ID, Position: int32(i), Body: qq.body, Points: 1})
			must(err)
			for j, o := range qq.options {
				_, err := q.CreateQuizOption(ctx, repository.CreateQuizOptionParams{QuestionID: row.ID, Position: int32(j), Body: o, IsCorrect: j == qq.correct})
				must(err)
			}
		}
	}

	// Live class tomorrow for the online batch.
	if list, _ := q.ListLiveSessions(ctx, repository.ListLiveSessionsParams{Lim: 1}); len(list) == 0 {
		start := time.Now().Add(24 * time.Hour).Truncate(time.Hour)
		ls, err := q.CreateLiveSession(ctx, repository.CreateLiveSessionParams{Title: "Live: Building your first API", Description: "Walk-through of routing, handlers and JSON.",
			MeetUrl: "https://meet.google.com/abc-defg-hij", StartsAt: start, EndsAt: start.Add(90 * time.Minute), HostID: &mentor.ID, CreatedBy: &admin.ID})
		must(err)
		must(q.AddLiveTarget(ctx, repository.AddLiveTargetParams{SessionID: ls.ID, TargetType: "batch", TargetID: goBatch.ID}))
		_, err = q.CreateAnnouncement(ctx, repository.CreateAnnouncementParams{Title: "Welcome to the Go batch!", Body: "Watch the first lesson and finish the hello task before Friday's live class.",
			TargetType: "course", TargetID: &goCourse.ID, Pinned: true, AuthorID: &admin.ID})
		must(err)
		_, err = q.CreateBlogPost(ctx, repository.CreateBlogPostParams{Slug: "why-learn-go-in-2027", Title: "Why learn Go in 2027?", Excerpt: "Fast, simple and loved by backend teams.",
			Content: "## Go is simple\n\nGo has a tiny syntax and great tooling.\n\n## Go is fast\n\nCompiled binaries, easy concurrency with goroutines.\n\n## Go gets you hired\n\nCloud, DevOps and backend teams use Go everywhere.",
			Tags: []string{"go", "careers"}, Status: "published", AuthorID: &admin.ID})
		must(err)
		_, err = q.CreateLead(ctx, repository.CreateLeadParams{Name: "Fathima", Email: "fathima@example.com", Phone: "+91 98765 43210", CourseID: &goCourse.ID, Message: "Is there a weekend batch?", Source: "website"})
		must(err)
	}
	fmt.Println("✔ demo data ready")
	fmt.Println("  mentor:  mentor@lms.local / Mentor@12345")
	fmt.Println("  student: student@lms.local / Student@12345 (also priya@ and rahul@)")
}

func course(slug, title, subtitle, category string, by uuid.UUID, learn []string) repository.Course {
	c, err := q.GetCourseBySlug(ctx, slug)
	if errors.Is(err, pgx.ErrNoRows) {
		c, err = q.CreateCourse(ctx, repository.CreateCourseParams{Slug: slug, Title: title, Subtitle: subtitle, Category: category, Level: "beginner", Language: "English",
			Description: subtitle + ". Learn by watching short lessons and completing hands-on tasks that mentors review.",
			Status: "published", IsPublic: true, PriceLabel: "₹4,999", WhatYouLearn: learn, CreatedBy: &by})
	}
	must(err)
	return c
}

func video(courseID uuid.UUID, title, provider, link string, secs int32, preview bool) repository.Video {
	vs, err := q.ListCourseVideos(ctx, courseID)
	must(err)
	for _, v := range vs {
		if v.Title == title {
			return v
		}
	}
	ref, err := service.ParseVideoRef(provider, link)
	must(err)
	v, err := q.CreateVideo(ctx, repository.CreateVideoParams{CourseID: courseID, Title: title, Description: "Lesson: " + title, Provider: provider, ProviderRef: ref,
		SourceUrl: link, DurationSeconds: secs, IsPreview: preview})
	must(err)
	return v
}

func task(videoID uuid.UUID, title, instructions string, types []string, due *time.Time) repository.Task {
	v, err := q.GetVideo(ctx, videoID)
	must(err)
	ts, err := q.ListTasksByCourse(ctx, v.CourseID)
	must(err)
	for _, t := range ts {
		if t.Title == title {
			return t
		}
	}
	t, err := q.CreateTask(ctx, repository.CreateTaskParams{VideoID: videoID, Title: title, Instructions: instructions, AllowedTypes: types, MaxMarks: 10, PassMarks: 5,
		DueAt: due, AllowLate: true, MaxFiles: 5, MaxFileMb: 10})
	must(err)
	return t
}

func batch(courseID, typeID uuid.UUID, name, schedule, location string) repository.Batch {
	bs, err := q.ListBatches(ctx, repository.ListBatchesParams{CourseID: &courseID, Lim: 100})
	must(err)
	for _, b := range bs {
		if b.Name == name {
			return repository.Batch{ID: b.ID, CourseID: b.CourseID, Name: b.Name}
		}
	}
	start := time.Now().AddDate(0, 0, -7)
	end := start.AddDate(0, 3, 0)
	b, err := q.CreateBatch(ctx, repository.CreateBatchParams{CourseID: courseID, BatchTypeID: typeID, Name: name, StartDate: &start, EndDate: &end, Capacity: 40,
		Location: location, ScheduleNote: schedule, Status: "running"})
	must(err)
	return b
}

func enroll(studentID, courseID uuid.UUID, batchID *uuid.UUID, by uuid.UUID) {
	_, err := q.UpsertEnrollment(ctx, repository.UpsertEnrollmentParams{StudentID: studentID, CourseID: courseID, BatchID: batchID, AssignedBy: &by})
	must(err)
}
