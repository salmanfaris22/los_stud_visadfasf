package server_test

// End-to-end API tests: the real router, services and Postgres (TEST_DATABASE_URL, default lms_test).
// Redis (db 15) and MinIO are used when reachable; tests that need them skip otherwise.

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	dbfiles "github.com/lms/backend/db"
	"github.com/lms/backend/internal/auth"
	"github.com/lms/backend/internal/config"
	"github.com/lms/backend/internal/platform/google"
	"github.com/lms/backend/internal/platform/mailer"
	"github.com/lms/backend/internal/platform/realtime"
	"github.com/lms/backend/internal/platform/secure"
	"github.com/lms/backend/internal/platform/storage"
	"github.com/lms/backend/internal/repository"
	"github.com/lms/backend/internal/server"
	"github.com/lms/backend/internal/service"
)

type M = map[string]any

type client struct {
	t    *testing.T
	base string
	app  string
	hc   *http.Client
}

func newClient(t *testing.T, base, app string) *client {
	jar, _ := cookiejar.New(nil)
	return &client{t: t, base: base, app: app, hc: &http.Client{Jar: jar, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
}

func (c *client) raw(method, path string, body any, header bool) (int, []byte, http.Header) {
	c.t.Helper()
	var r io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		r = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, c.base+path, r)
	req.Header.Set("Content-Type", "application/json")
	if header {
		req.Header.Set("X-LMS-App", c.app)
	}
	res, err := c.hc.Do(req)
	if err != nil {
		c.t.Fatalf("%s %s: %v", method, path, err)
	}
	defer res.Body.Close()
	out, _ := io.ReadAll(res.Body)
	return res.StatusCode, out, res.Header
}

// call asserts the status and decodes the JSON body into out (if given).
func (c *client) call(method, path string, body any, want int, out any) []byte {
	c.t.Helper()
	code, b, _ := c.raw(method, path, body, true)
	if code != want {
		c.t.Fatalf("%s %s = %d, want %d: %s", method, path, code, want, b)
	}
	if out != nil && len(b) > 0 {
		if err := json.Unmarshal(b, out); err != nil {
			c.t.Fatalf("decode %s: %v (%s)", path, err, b)
		}
	}
	return b
}

func testDeps(t *testing.T) (*service.Deps, func()) {
	t.Helper()
	dbURL := os.Getenv("TEST_DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://lms:lms@localhost:5432/lms_test?sslmode=disable"
	}
	if err := dbfiles.Down(dbURL, 0); err != nil {
		t.Skipf("test database not reachable (%v) — set TEST_DATABASE_URL", err)
	}
	if err := dbfiles.Up(dbURL); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatal(err)
	}
	cfg := &config.Config{
		Env: "test", JWTSecret: []byte("test-secret-test-secret-test-secret!!"), EncryptionKey: bytes.Repeat([]byte{3}, 32),
		AccessTTL: 15 * time.Minute, RefreshTTL: 24 * time.Hour,
		AdminAppURL: "http://localhost:3001", StudentAppURL: "http://localhost:3000", APIPublicURL: "http://localhost:8080",
		S3Endpoint: "localhost:9000", S3Region: "us-east-1", S3Bucket: "lms-test", S3AccessKey: "minioadmin", S3SecretKey: "minioadmin", S3CreateBucket: true,
		SMTPHost: "localhost", SMTPPort: 1025, SMTPFrom: "LMS <test@lms.local>",
	}
	var rdb *redis.Client
	if r := redis.NewClient(&redis.Options{Addr: "localhost:6379", DB: 15}); r.Ping(ctx).Err() == nil {
		r.FlushDB(ctx)
		rdb = r
	}
	store, err := storage.New(ctx, cfg)
	if err != nil {
		store = nil
	}
	q := repository.New(pool)
	hash, _ := secure.HashPassword("Admin@12345")
	if _, err := q.CreateUser(ctx, repository.CreateUserParams{Kind: auth.KindStaff, Email: "admin@test.local", PasswordHash: &hash, Name: "Test Admin", IsSuperAdmin: true, Status: "active"}); err != nil {
		t.Fatal(err)
	}
	d := &service.Deps{Cfg: cfg, Pool: pool, Q: q, Redis: rdb, Store: store, Mail: mailer.New(cfg), Hub: realtime.NewHub(rdb), Google: google.New(cfg),
		Tokens: auth.NewTokens(cfg.JWTSecret, cfg.AccessTTL), Cookies: auth.CookieFactory{}}
	return d, func() { pool.Close() }
}

func TestAPI(t *testing.T) {
	d, done := testDeps(t)
	defer done()
	srv := httptest.NewServer(server.New(d).Router)
	defer srv.Close()

	admin := newClient(t, srv.URL, "admin")
	student := newClient(t, srv.URL, "student")
	var courseID, videoID, taskID, batchID, studentID, submissionID, quizID string

	t.Run("health", func(t *testing.T) {
		code, b, _ := admin.raw("GET", "/healthz", nil, false)
		if code != 200 || !strings.Contains(string(b), `"db":"ok"`) {
			t.Fatalf("health %d %s", code, b)
		}
	})

	t.Run("admin login and me", func(t *testing.T) {
		var me M
		admin.call("POST", "/api/v1/auth/login", M{"email": "ADMIN@test.local", "password": "Admin@12345"}, 200, &me)
		if me["is_super_admin"] != true || me["kind"] != "staff" {
			t.Fatalf("unexpected me %v", me)
		}
		admin.call("GET", "/api/v1/auth/me", nil, 200, nil)
		admin.call("POST", "/api/v1/auth/login", M{"email": "admin@test.local", "password": "nope"}, 401, nil)
	})

	t.Run("course, video (vimeo) and task", func(t *testing.T) {
		var c M
		admin.call("POST", "/api/v1/courses", M{"title": "Integration Course", "status": "published", "is_public": true, "what_you_learn": []string{"testing"}}, 200, &c)
		courseID = c["id"].(string)
		if c["slug"] != "integration-course" {
			t.Errorf("slug = %v", c["slug"])
		}
		var dup M
		admin.call("POST", "/api/v1/courses", M{"title": "Integration Course"}, 200, &dup)
		if dup["slug"] != "integration-course-2" {
			t.Errorf("duplicate slug = %v", dup["slug"])
		}
		admin.call("POST", "/api/v1/courses/"+courseID+"/videos", M{"title": "Bad", "provider": "vimeo", "url": "https://youtube.com/watch?v=x"}, 422, nil)
		var v M
		admin.call("POST", "/api/v1/courses/"+courseID+"/videos", M{"title": "Lesson 1", "provider": "vimeo", "url": "https://vimeo.com/1084537", "duration_seconds": 597, "is_preview": true}, 200, &v)
		videoID = v["id"].(string)
		if !strings.HasPrefix(v["embed_url"].(string), "https://player.vimeo.com/video/1084537") {
			t.Errorf("embed = %v", v["embed_url"])
		}
		admin.call("POST", "/api/v1/videos/"+videoID+"/tasks", M{"title": "T", "allowed_types": []string{"text"}, "max_marks": 5, "pass_marks": 9}, 422, nil)
		var tk M
		admin.call("POST", "/api/v1/videos/"+videoID+"/tasks", M{"title": "Write a summary", "allowed_types": []string{"text", "link", "drive"}, "max_marks": 10, "pass_marks": 5}, 200, &tk)
		taskID = tk["id"].(string)
		var cur []M
		admin.call("GET", "/api/v1/courses/"+courseID+"/curriculum", nil, 200, &cur)
		if len(cur) != 1 || len(cur[0]["tasks"].([]any)) != 1 {
			t.Fatalf("curriculum = %v", cur)
		}
	})

	t.Run("batch types and batch", func(t *testing.T) {
		var bt M
		admin.call("POST", "/api/v1/batch-types", M{"name": "Offline", "is_offline": true}, 200, &bt)
		admin.call("POST", "/api/v1/batch-types", M{"name": "Offline"}, 409, nil)
		var b M
		admin.call("POST", "/api/v1/batches", M{"course_id": courseID, "batch_type_id": bt["id"], "name": "Kochi Batch", "start_date": "2027-01-10", "end_date": "2027-01-01"}, 422, nil)
		admin.call("POST", "/api/v1/batches", M{"course_id": courseID, "batch_type_id": bt["id"], "name": "Kochi Batch", "start_date": "2027-01-10", "end_date": "2027-03-10"}, 200, &b)
		batchID = b["batch"].(map[string]any)["id"].(string)
	})

	t.Run("create student with enrollment", func(t *testing.T) {
		var s M
		admin.call("POST", "/api/v1/students", M{"name": "Ann Student", "email": "ann@test.local", "password": "Student@123", "enrollments": []M{{"course_id": courseID, "batch_id": batchID}}}, 200, &s)
		st := s["student"].(map[string]any)
		studentID = st["id"].(string)
		if !strings.HasPrefix(st["student_code"].(string), "STU") || len(s["enrollments"].([]any)) != 1 {
			t.Fatalf("student = %v", s)
		}
		admin.call("POST", "/api/v1/students", M{"name": "Dup", "email": "ann@test.local", "password": "Student@123"}, 409, nil)
		var list M
		admin.call("GET", "/api/v1/students?q=ann", nil, 200, &list)
		if list["total"].(float64) != 1 {
			t.Fatalf("list = %v", list)
		}
	})

	t.Run("portal rules", func(t *testing.T) {
		student.call("POST", "/api/v1/auth/login", M{"email": "admin@test.local", "password": "Admin@12345"}, 403, nil)
		student.call("POST", "/api/v1/auth/login", M{"email": "ann@test.local", "password": "Student@123"}, 200, nil)
		student.call("GET", "/api/v1/students", nil, 403, nil)
		var dash M
		student.call("GET", "/api/v1/me/dashboard", nil, 200, &dash)
		if stats := dash["stats"].(map[string]any); stats["courses"].(float64) != 1 || stats["to_do"].(float64) != 1 {
			t.Fatalf("dashboard stats = %v", stats)
		}
		var watch M
		student.call("GET", "/api/v1/me/videos/"+videoID, nil, 200, &watch)
		if watch["video"].(map[string]any)["source_url"] != "" {
			t.Error("students must not receive the raw source URL")
		}
	})

	t.Run("submit, validate and review", func(t *testing.T) {
		student.call("POST", "/api/v1/me/tasks/"+taskID+"/submissions", M{"items": []M{{"kind": "code", "content": "x"}}}, 422, nil)
		student.call("POST", "/api/v1/me/tasks/"+taskID+"/submissions", M{"items": []M{{"kind": "drive", "content": "https://evil.example.com/x"}}}, 422, nil)
		student.call("POST", "/api/v1/me/tasks/"+taskID+"/submissions", M{"items": []M{{"kind": "link", "content": "javascript:alert(1)"}}}, 422, nil)
		var page M
		student.call("POST", "/api/v1/me/tasks/"+taskID+"/submissions", M{"items": []M{{"kind": "text", "content": "My summary"}, {"kind": "drive", "content": "https://drive.google.com/file/d/abc/view"}}}, 200, &page)
		if page["status"] != "pending" || page["can_submit"] != false {
			t.Fatalf("task page = %v", page)
		}
		student.call("POST", "/api/v1/me/tasks/"+taskID+"/submissions", M{"items": []M{{"kind": "text", "content": "again"}}}, 409, nil)
		student.call("POST", "/api/v1/me/tasks/"+taskID+"/comments", M{"body": "Is this enough?"}, 200, nil)

		var q M
		admin.call("GET", "/api/v1/submissions?status=pending", nil, 200, &q)
		items := q["items"].([]any)
		if len(items) != 1 {
			t.Fatalf("queue = %v", q)
		}
		submissionID = items[0].(map[string]any)["id"].(string)
		admin.call("POST", "/api/v1/submissions/"+submissionID+"/review", M{"status": "approved", "marks": 11}, 422, nil)
		admin.call("POST", "/api/v1/submissions/"+submissionID+"/review", M{"status": "approved", "marks": 3}, 422, nil)
		var det M
		admin.call("POST", "/api/v1/submissions/"+submissionID+"/review", M{"status": "approved", "marks": 9, "feedback": "Great"}, 200, &det)
		if det["current"].(map[string]any)["status"] != "approved" || len(det["comments"].([]any)) != 1 {
			t.Fatalf("detail = %v", det)
		}
	})

	t.Run("certificate auto-issued and verifiable", func(t *testing.T) {
		var certs []M
		student.call("GET", "/api/v1/me/certificates", nil, 200, &certs)
		if len(certs) != 1 {
			t.Fatalf("certificates = %v", certs)
		}
		code := certs[0]["code"].(string)
		var v M
		newClient(t, srv.URL, "student").call("GET", "/api/v1/public/certificates/"+code, nil, 200, &v)
		if v["valid"] != true || v["student_name"] != "Ann Student" {
			t.Fatalf("verify = %v", v)
		}
		codeStatus, pdf, hdr := student.raw("GET", "/api/v1/me/certificates/"+certs[0]["id"].(string)+"/pdf", nil, true)
		if codeStatus != 200 || !bytes.HasPrefix(pdf, []byte("%PDF")) || hdr.Get("Content-Type") != "application/pdf" {
			t.Fatalf("pdf %d %s", codeStatus, hdr.Get("Content-Type"))
		}
		var dash M
		student.call("GET", "/api/v1/me/courses", nil, 200, &[]M{})
		student.call("GET", "/api/v1/me/dashboard", nil, 200, &dash)
		if dash["courses"].([]any)[0].(map[string]any)["progress_pct"].(float64) != 100 {
			t.Errorf("progress not 100%%: %v", dash["courses"])
		}
		var notes M
		student.call("GET", "/api/v1/notifications", nil, 200, &notes)
		if notes["unread"].(float64) < 2 {
			t.Errorf("expected review + certificate notifications, got %v", notes["unread"])
		}
	})

	t.Run("scoped mentor role", func(t *testing.T) {
		var role M
		admin.call("POST", "/api/v1/roles", M{"name": "Tutor", "scoped": true, "permissions": M{"courses": []string{"view"}, "students": []string{"view"}}}, 200, &role)
		admin.call("POST", "/api/v1/roles", M{"name": "Bad", "permissions": M{"nope": []string{"view"}}}, 422, nil)
		var staff M
		admin.call("POST", "/api/v1/staff", M{"name": "Tim Tutor", "email": "tim@test.local", "password": "Tutor@1234", "role_ids": []any{role["id"]}}, 200, &staff)
		mentor := newClient(t, srv.URL, "admin")
		mentor.call("POST", "/api/v1/auth/login", M{"email": "tim@test.local", "password": "Tutor@1234"}, 200, nil)
		var l M
		mentor.call("GET", "/api/v1/courses", nil, 200, &l)
		if l["total"].(float64) != 0 {
			t.Fatalf("unassigned tutor sees %v courses", l["total"])
		}
		mentor.call("GET", "/api/v1/courses/"+courseID, nil, 403, nil)
		mentor.call("GET", "/api/v1/staff", nil, 403, nil)
		mentor.call("DELETE", "/api/v1/students/"+studentID, nil, 403, nil)
		admin.call("PUT", "/api/v1/courses/"+courseID, M{"title": "Integration Course", "status": "published", "is_public": true, "mentor_ids": []any{staff["id"]}}, 200, nil)
		time.Sleep(10 * time.Millisecond)
		mentor.call("GET", "/api/v1/courses", nil, 200, &l)
		if l["total"].(float64) != 1 {
			t.Fatalf("assigned tutor sees %v courses", l["total"])
		}
		var st M
		mentor.call("GET", "/api/v1/students", nil, 200, &st)
		if st["total"].(float64) != 1 {
			t.Fatalf("tutor sees %v students", st["total"])
		}
	})

	t.Run("csrf header required for cookie writes", func(t *testing.T) {
		code, _, _ := student.raw("POST", "/api/v1/auth/change-password", M{"new_password": "whatever123"}, false)
		if code != 403 && code != 401 {
			t.Fatalf("write without X-LMS-App returned %d", code)
		}
	})

	t.Run("refresh rotation and reuse detection", func(t *testing.T) {
		c := newClient(t, srv.URL, "student")
		c.call("POST", "/api/v1/auth/login", M{"email": "ann@test.local", "password": "Student@123"}, 200, nil)
		u, _ := http.NewRequest("GET", srv.URL+"/api/v1/auth/refresh", nil)
		old := c.hc.Jar.Cookies(u.URL)
		c.call("POST", "/api/v1/auth/refresh", nil, 200, nil)
		thief := newClient(t, srv.URL, "student")
		thief.hc.Jar.SetCookies(u.URL, old)
		thief.call("POST", "/api/v1/auth/refresh", nil, 401, nil)
		c.call("POST", "/api/v1/auth/refresh", nil, 401, nil) // reuse revoked every session of the user
	})

	t.Run("live session, audience and ics", func(t *testing.T) {
		start := time.Now().Add(2 * time.Hour).UTC().Truncate(time.Minute)
		admin.call("POST", "/api/v1/live", M{"title": "Live 1", "meet_url": "http://meet.google.com/x", "starts_at": start, "ends_at": start.Add(time.Hour), "targets": []M{{"type": "batch", "id": batchID}}}, 422, nil)
		var l M
		admin.call("POST", "/api/v1/live", M{"title": "Live Q&A", "meet_url": "https://meet.google.com/abc-defg-hij", "starts_at": start, "ends_at": start.Add(time.Hour), "targets": []M{{"type": "batch", "id": batchID}}}, 200, &l)
		sid := l["session"].(map[string]any)["id"].(string)
		if len(l["roster"].([]any)) != 1 {
			t.Fatalf("roster = %v", l["roster"])
		}
		s2 := newClient(t, srv.URL, "student")
		s2.call("POST", "/api/v1/auth/login", M{"email": "ann@test.local", "password": "Student@123"}, 200, nil)
		var mine []M
		s2.call("GET", "/api/v1/me/live?scope=upcoming", nil, 200, &mine)
		if len(mine) != 1 {
			t.Fatalf("student sees %d sessions", len(mine))
		}
		s2.call("POST", "/api/v1/me/live/"+sid+"/join", nil, 422, nil) // too early
		code, ics, hdr := s2.raw("GET", "/api/v1/me/live/"+sid+"/ics", nil, true)
		if code != 200 || !strings.HasPrefix(hdr.Get("Content-Type"), "text/calendar") || !bytes.Contains(ics, []byte("SUMMARY:Live Q&A")) {
			t.Fatalf("ics %d %s", code, ics)
		}
		var sync M
		admin.call("POST", "/api/v1/live/"+sid+"/sync", M{"calendar": true, "attendance": true, "recording": true}, 200, &sync)
		if sync["calendar"].(map[string]any)["ok"] != false {
			t.Errorf("calendar sync without Google should not be ok: %v", sync)
		}
		admin.call("PUT", "/api/v1/live/"+sid+"/attendance", M{"records": []M{{"student_id": studentID, "present": true}}}, 200, nil)
		n, err := d.Q.DueLiveReminders(context.Background())
		if err != nil || len(n) != 1 {
			t.Errorf("due reminders = %d, %v", len(n), err)
		}
	})

	t.Run("quiz scoring and attempt limit", func(t *testing.T) {
		var qz M
		admin.call("POST", "/api/v1/videos/"+videoID+"/quizzes", M{"title": "Check", "pass_pct": 50, "max_attempts": 1, "questions": []M{
			{"body": "2+2?", "options": []M{{"body": "4", "is_correct": true}, {"body": "5"}}},
			{"body": "Pick evens", "multi": true, "points": 2, "options": []M{{"body": "2", "is_correct": true}, {"body": "3"}, {"body": "4", "is_correct": true}}},
		}}, 200, &qz)
		quizID = qz["id"].(string)
		qs := qz["questions"].([]any)
		q1 := qs[0].(map[string]any)
		q2 := qs[1].(map[string]any)
		opts := func(q map[string]any, idx ...int) []any {
			o := q["options"].([]any)
			out := []any{}
			for _, i := range idx {
				out = append(out, o[i].(map[string]any)["id"])
			}
			return out
		}
		var play M
		student.call("POST", "/api/v1/auth/login", M{"email": "ann@test.local", "password": "Student@123"}, 200, nil)
		student.call("POST", "/api/v1/me/quizzes/"+quizID+"/start", nil, 200, &play)
		for _, pq := range play["questions"].([]any) {
			for _, o := range pq.(map[string]any)["options"].([]any) {
				if _, leak := o.(map[string]any)["is_correct"]; leak {
					t.Fatal("correct answers leaked to the student")
				}
			}
		}
		var res M
		student.call("POST", "/api/v1/me/quiz-attempts/"+play["attempt_id"].(string)+"/submit", M{"answers": []M{
			{"question_id": q1["id"], "option_ids": opts(q1, 0)}, {"question_id": q2["id"], "option_ids": opts(q2, 0)},
		}}, 200, &res)
		if res["score"].(float64) != 1 || res["max_score"].(float64) != 3 || res["passed"] != false {
			t.Fatalf("result = %v", res)
		}
		student.call("POST", "/api/v1/me/quizzes/"+quizID+"/start", nil, 409, nil)
	})

	t.Run("announcements, comments and leads", func(t *testing.T) {
		admin.call("POST", "/api/v1/announcements", M{"title": "Holiday", "body": "No class Monday", "target_type": "course", "target_id": courseID}, 200, nil)
		var news []M
		student.call("GET", "/api/v1/me/announcements", nil, 200, &news)
		if len(news) != 1 {
			t.Fatalf("announcements = %v", news)
		}
		var thread []M
		student.call("POST", "/api/v1/videos/"+videoID+"/comments", M{"body": "Question?"}, 200, &thread)
		admin.call("POST", "/api/v1/videos/"+videoID+"/comments", M{"body": "Answer!", "parent_id": thread[0]["id"]}, 200, &thread)
		if len(thread[0]["replies"].([]any)) != 1 {
			t.Fatalf("thread = %v", thread)
		}
		anon := newClient(t, srv.URL, "student")
		anon.call("POST", "/api/v1/public/leads", M{"name": "Lee", "email": "lee@example.com", "course_id": courseID}, 200, nil)
		var leads M
		admin.call("GET", "/api/v1/leads", nil, 200, &leads)
		if leads["total"].(float64) != 1 {
			t.Fatalf("leads = %v", leads)
		}
		var site M
		anon.call("GET", "/api/v1/public/courses/integration-course", nil, 200, &site)
		if len(site["lessons"].([]any)) != 1 || site["lessons"].([]any)[0].(map[string]any)["embed_url"] == "" {
			t.Fatalf("public course = %v", site)
		}
	})

	t.Run("csv import and export", func(t *testing.T) {
		var r M
		admin.call("POST", "/api/v1/students/import", M{"csv": "name,email,phone,password\nBo,bo@test.local,,Secret@123\nCy,cy@test.local,=HYPERLINK(1),\nAnn,ann@test.local,,\nbad,not-an-email,,", "course_id": courseID}, 200, &r)
		if r["created"].(float64) != 2 || r["skipped"].(float64) != 1 || len(r["errors"].([]any)) != 1 {
			t.Fatalf("import = %v", r)
		}
		code, csv, _ := admin.raw("GET", "/api/v1/students/export", nil, true)
		if code != 200 || !bytes.Contains(csv, []byte("'=HYPERLINK(1)")) {
			t.Fatalf("export %d: formula not neutralised: %s", code, csv)
		}
	})

	t.Run("uploads: size limit and direct put", func(t *testing.T) {
		if d.Store == nil {
			t.Skip("object storage not reachable")
		}
		student.call("POST", "/api/v1/uploads/presign", M{"purpose": "submission", "file_name": "big.png", "mime": "image/png", "size": 3 << 20}, 422, nil)
		student.call("POST", "/api/v1/uploads/presign", M{"purpose": "thumbnail", "file_name": "x.png", "mime": "image/png", "size": 10}, 403, nil)
		student.call("POST", "/api/v1/uploads/presign", M{"purpose": "submission", "file_name": "x.exe", "mime": "application/x-msdownload", "size": 10}, 422, nil)
		var pre M
		student.call("POST", "/api/v1/uploads/presign", M{"purpose": "submission", "file_name": "notes.txt", "mime": "text/plain", "size": 5}, 200, &pre)
		req, _ := http.NewRequest("PUT", pre["put_url"].(string), strings.NewReader("hello"))
		req.Header.Set("Content-Type", "text/plain")
		res, err := http.DefaultClient.Do(req)
		if err != nil || res.StatusCode != 200 {
			t.Fatalf("put: %v %v", err, res)
		}
		up := pre["upload"].(map[string]any)
		var ready M
		student.call("POST", "/api/v1/uploads/"+up["id"].(string)+"/complete", nil, 200, &ready)
		if ready["status"] != "ready" || ready["size_bytes"].(float64) != 5 {
			t.Fatalf("upload = %v", ready)
		}
		code, _, hdr := student.raw("GET", "/api/v1/files/"+up["id"].(string), nil, true)
		if code != 302 || !strings.Contains(hdr.Get("Location"), "X-Amz-Signature") {
			t.Fatalf("owner download %d %s", code, hdr.Get("Location"))
		}
		code, _, _ = newClient(t, srv.URL, "student").raw("GET", "/api/v1/files/"+up["id"].(string), nil, true)
		if code != 403 {
			t.Fatalf("anonymous download = %d", code)
		}
	})

	t.Run("delete with confirmation of cascade", func(t *testing.T) {
		admin.call("DELETE", "/api/v1/tasks/"+taskID, nil, 204, nil)
		admin.call("GET", "/api/v1/submissions/"+submissionID, nil, 404, nil)
		admin.call("DELETE", "/api/v1/staff/00000000-0000-0000-0000-000000000000", nil, 404, nil)
		var audit M
		admin.call("GET", "/api/v1/audit?entity=task", nil, 200, &audit)
		if audit["total"].(float64) < 2 {
			t.Errorf("audit log has %v task entries", audit["total"])
		}
	})

	t.Run("login rate limit", func(t *testing.T) {
		if d.Redis == nil {
			t.Skip("redis not reachable")
		}
		c := newClient(t, srv.URL, "student")
		got429 := false
		for i := 0; i < 25; i++ {
			code, _, _ := c.raw("POST", "/api/v1/auth/login", M{"email": "x@y.z", "password": "bad"}, true)
			if code == 429 {
				got429 = true
				break
			}
		}
		if !got429 {
			t.Fatal("no 429 after 25 failed logins")
		}
	})

}
