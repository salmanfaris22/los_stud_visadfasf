package server_test

// End-to-end API tests: the real router, services and Postgres (TEST_DATABASE_URL, default lms_test).
// Calls go through /rpc/<procedure> with Connect JSON, like the web apps. MinIO is used when
// reachable; tests that need it skip otherwise.

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/google/uuid"

	dbfiles "github.com/lms/backend/db"
	lmsv1 "github.com/lms/backend/gen/lms/v1"
	"github.com/lms/backend/gen/lms/v1/lmsv1connect"
	"github.com/lms/backend/internal/auth"
	"github.com/lms/backend/internal/config"
	"github.com/lms/backend/internal/platform/google"
	"github.com/lms/backend/internal/platform/mailer"
	"github.com/lms/backend/internal/platform/realtime"
	"github.com/lms/backend/internal/platform/secure"
	"github.com/lms/backend/internal/platform/storage"
	"github.com/lms/backend/internal/repository"
	"github.com/lms/backend/internal/rpc"
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

// rpc calls a procedure ("CourseService/CreateCourse") with Connect JSON, asserts the HTTP
// status (Connect maps codes: InvalidArgument 400, Unauthenticated 401, PermissionDenied 403,
// NotFound 404, AlreadyExists 409, ResourceExhausted 429) and decodes the reply into out.
func (c *client) rpc(proc string, body any, want int, out any) M {
	c.t.Helper()
	if body == nil {
		body = M{}
	}
	code, b, _ := c.raw("POST", "/rpc/lms.v1."+proc, body, true)
	if code != want {
		c.t.Fatalf("%s = %d, want %d: %s", proc, code, want, b)
	}
	var m M
	if len(b) > 0 && b[0] == '{' {
		if err := json.Unmarshal(b, &m); err != nil {
			c.t.Fatalf("decode %s: %v (%s)", proc, err, b)
		}
		if out != nil {
			_ = json.Unmarshal(b, out)
		}
	}
	return m
}

// Proto JSON leaves out zero values; these readers treat a missing field as zero.
func obj(v any, key string) M {
	m, _ := v.(M)
	o, _ := m[key].(M)
	if o == nil {
		o = M{}
	}
	return o
}

func arr(v any, key string) []any {
	m, _ := v.(M)
	a, _ := m[key].([]any)
	return a
}

func num(v any, key string) float64 {
	m, _ := v.(M)
	n, _ := m[key].(float64)
	return n
}

func str(v any, key string) string {
	m, _ := v.(M)
	s, _ := m[key].(string)
	return s
}

func flag(v any, key string) bool {
	m, _ := v.(M)
	b, _ := m[key].(bool)
	return b
}

// authClient is a typed AuthService client sharing this client's cookie jar. It calls /rpc/<procedure>
// like the web apps do, so the refresh cookie (scoped to that path) is sent. withApp adds X-LMS-App.
func (c *client) authClient(withApp bool) lmsv1connect.AuthServiceClient {
	var opts []connect.ClientOption
	if withApp {
		opts = append(opts, connect.WithInterceptors(appHeader(c.app)))
	}
	return lmsv1connect.NewAuthServiceClient(c.hc, c.base+"/rpc", opts...)
}

// versionClient is a typed CourseVersionService client sharing this client's cookies.
func (c *client) versionClient() lmsv1connect.CourseVersionServiceClient {
	return lmsv1connect.NewCourseVersionServiceClient(c.hc, c.base+"/rpc", connect.WithInterceptors(appHeader(c.app)))
}

// buildAndMoveAll builds the course's working copy as a new version and moves every student onto it.
func buildAndMoveAll(t *testing.T, admin *client, courseID string) *lmsv1.CourseVersion {
	t.Helper()
	ctx := context.Background()
	vc := admin.versionClient()
	b, err := vc.BuildVersion(ctx, connect.NewRequest(&lmsv1.BuildVersionRequest{CourseId: courseID, Note: "test"}))
	if err != nil {
		t.Fatalf("BuildVersion: %v", err)
	}
	st, err := vc.ListVersionStudents(ctx, connect.NewRequest(&lmsv1.ListVersionStudentsRequest{CourseId: courseID}))
	if err != nil {
		t.Fatalf("ListVersionStudents: %v", err)
	}
	ids := []string{}
	for _, s := range st.Msg.GetStudents() {
		ids = append(ids, s.GetEnrollmentId())
	}
	if _, err := vc.MoveStudents(ctx, connect.NewRequest(&lmsv1.MoveStudentsRequest{CourseId: courseID, VersionId: b.Msg.GetVersion().GetId(), EnrollmentIds: ids})); err != nil {
		t.Fatalf("MoveStudents: %v", err)
	}
	return b.Msg.GetVersion()
}

// appHeader adds X-LMS-App to unary and streaming calls (like the web transport does).
func appHeader(app string) connect.Interceptor { return appInterceptor(app) }

type appInterceptor string

func (a appInterceptor) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		req.Header().Set("X-LMS-App", string(a))
		return next(ctx, req)
	}
}

func (a appInterceptor) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return func(ctx context.Context, spec connect.Spec) connect.StreamingClientConn {
		conn := next(ctx, spec)
		conn.RequestHeader().Set("X-LMS-App", string(a))
		return conn
	}
}

func (a appInterceptor) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return next
}

// login signs in over gRPC (AuthService.Login) and returns the session user.
func (c *client) login(email, password string) (*lmsv1.Me, error) {
	res, err := c.authClient(true).Login(context.Background(), connect.NewRequest(&lmsv1.LoginRequest{Email: email, Password: password}))
	if err != nil {
		return nil, err
	}
	return res.Msg.GetMe(), nil
}

// mustLogin fails the test unless the sign-in succeeds.
func (c *client) mustLogin(email, password string) *lmsv1.Me {
	c.t.Helper()
	me, err := c.login(email, password)
	if err != nil {
		c.t.Fatalf("login %s: %v", email, err)
	}
	return me
}

// wantCode fails the test unless err is a Connect error with the given code.
func wantCode(t *testing.T, err error, want connect.Code) {
	t.Helper()
	if err == nil {
		t.Fatalf("got no error, want code %v", want)
	}
	if got := connect.CodeOf(err); got != want {
		t.Fatalf("error %v has code %v, want %v", err, got, want)
	}
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
	store, err := storage.New(ctx, cfg)
	if err != nil {
		store = nil
	}
	q := repository.New(pool)
	hash, _ := secure.HashPassword("Admin@12345")
	if _, err := q.CreateUser(ctx, repository.CreateUserParams{Kind: auth.KindStaff, Email: "admin@test.local", PasswordHash: &hash, Name: "Test Admin", IsSuperAdmin: true, Status: "active"}); err != nil {
		t.Fatal(err)
	}
	d := &service.Deps{Cfg: cfg, Pool: pool, Q: q, Store: store, Mail: mailer.New(cfg), Hub: realtime.NewHub(), Google: google.New(cfg),
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
		me := admin.mustLogin("ADMIN@test.local", "Admin@12345")
		if !me.GetIsSuperAdmin() || me.GetKind() != "staff" {
			t.Fatalf("unexpected me %v", me)
		}
		got, err := admin.authClient(true).GetMe(context.Background(), connect.NewRequest(&lmsv1.GetMeRequest{}))
		if err != nil || got.Msg.GetMe().GetEmail() != "admin@test.local" {
			t.Fatalf("GetMe = %v, %v", got, err)
		}
		_, err = admin.login("admin@test.local", "nope")
		wantCode(t, err, connect.CodeUnauthenticated)
		// The REST API is gone: only the plain-HTTP routes (Google, files, health) remain.
		code, _, _ := admin.raw("POST", "/api/v1/auth/login", M{"email": "admin@test.local", "password": "Admin@12345"}, true)
		if code != 404 && code != 405 {
			t.Fatalf("REST login = %d, want 404", code)
		}
		code, _, _ = admin.raw("GET", "/api/v1/courses", nil, true)
		if code != 404 {
			t.Fatalf("REST courses = %d, want 404", code)
		}
	})

	t.Run("every RPC has an access rule", func(t *testing.T) {
		rules, err := rpc.AccessRules(rpc.ServiceNames())
		if err != nil {
			t.Fatal(err)
		}
		if len(rules) < 150 {
			t.Fatalf("only %d procedures have access rules", len(rules))
		}
		// Unknown procedures are not served.
		admin.rpc("CourseService/NoSuchMethod", nil, 404, nil)
	})

	t.Run("course, video (vimeo) and task", func(t *testing.T) {
		c := obj(admin.rpc("CourseService/CreateCourse", M{"input": M{"title": "Integration Course", "status": "published", "is_public": true, "what_you_learn": []string{"testing"}}}, 200, nil), "course")
		courseID = str(c, "id")
		if str(c, "slug") != "integration-course" {
			t.Errorf("slug = %v", c["slug"])
		}
		dup := obj(admin.rpc("CourseService/CreateCourse", M{"input": M{"title": "Integration Course"}}, 200, nil), "course")
		if str(dup, "slug") != "integration-course-2" {
			t.Errorf("duplicate slug = %v", dup["slug"])
		}
		// Validation: protovalidate (title too short) and service rules (link does not match the provider).
		admin.rpc("CourseService/CreateCourse", M{"input": M{"title": "ab"}}, 400, nil)
		admin.rpc("CourseService/CreateVideo", M{"course_id": courseID, "input": M{"title": "Bad", "provider": "vimeo", "url": "https://youtube.com/watch?v=x"}}, 400, nil)
		v := obj(admin.rpc("CourseService/CreateVideo", M{"course_id": courseID, "input": M{"title": "Lesson 1", "provider": "vimeo", "url": "https://vimeo.com/1084537", "duration_seconds": 597, "is_preview": true}}, 200, nil), "video")
		videoID = str(v, "id")
		if !strings.HasPrefix(str(v, "embedUrl"), "https://player.vimeo.com/video/1084537") {
			t.Errorf("embed = %v", v["embedUrl"])
		}
		admin.rpc("CourseService/CreateTask", M{"video_id": videoID, "input": M{"title": "T", "allowed_types": []string{"text"}, "max_marks": 5, "pass_marks": 9}}, 400, nil)
		tk := obj(admin.rpc("CourseService/CreateTask", M{"video_id": videoID, "input": M{"title": "Write a summary", "allowed_types": []string{"text", "link", "drive"}, "max_marks": 10, "pass_marks": 5}}, 200, nil), "task")
		taskID = str(tk, "id")
		cur := arr(admin.rpc("CourseService/GetCurriculum", M{"course_id": courseID}, 200, nil), "items")
		if len(cur) != 1 || len(arr(cur[0], "tasks")) != 1 {
			t.Fatalf("curriculum = %v", cur)
		}
	})

	t.Run("batch types and batch", func(t *testing.T) {
		bt := obj(admin.rpc("BatchService/CreateBatchType", M{"input": M{"name": "Offline", "is_offline": true}}, 200, nil), "batchType")
		admin.rpc("BatchService/CreateBatchType", M{"input": M{"name": "Offline"}}, 409, nil)
		admin.rpc("BatchService/CreateBatch", M{"input": M{"course_id": courseID, "batch_type_id": bt["id"], "name": "Kochi Batch", "start_date": "2027-01-10", "end_date": "2027-01-01"}}, 400, nil)
		b := obj(admin.rpc("BatchService/CreateBatch", M{"input": M{"course_id": courseID, "batch_type_id": bt["id"], "name": "Kochi Batch", "start_date": "2027-01-10", "end_date": "2027-03-10"}}, 200, nil), "batch")
		batchID = str(obj(b, "batch"), "id")
	})

	t.Run("create student with enrollment", func(t *testing.T) {
		s := obj(admin.rpc("StudentService/CreateStudent", M{"input": M{"name": "Ann Student", "email": "ann@test.local", "password": "Student@123", "enrollments": []M{{"course_id": courseID, "batch_id": batchID}}}}, 200, nil), "student")
		st := obj(s, "student")
		studentID = str(st, "id")
		if !strings.HasPrefix(str(st, "studentCode"), "STU") || len(arr(s, "enrollments")) != 1 {
			t.Fatalf("student = %v", s)
		}
		admin.rpc("StudentService/CreateStudent", M{"input": M{"name": "Dup", "email": "ann@test.local", "password": "Student@123"}}, 409, nil)
		admin.rpc("StudentService/CreateStudent", M{"input": M{"name": "Bad", "email": "not-an-email", "password": "Student@123"}}, 400, nil)
		list := admin.rpc("StudentService/ListStudents", M{"q": "ann"}, 200, nil)
		if num(list, "total") != 1 {
			t.Fatalf("list = %v", list)
		}
	})

	t.Run("portal rules", func(t *testing.T) {
		_, err := student.login("admin@test.local", "Admin@12345")
		wantCode(t, err, connect.CodePermissionDenied)
		student.mustLogin("ann@test.local", "Student@123")
		student.rpc("StudentService/ListStudents", nil, 403, nil)
		admin.rpc("PortalService/GetDashboard", nil, 403, nil) // staff are not students
		newClient(t, srv.URL, "student").rpc("PortalService/GetDashboard", nil, 401, nil)
		dash := obj(student.rpc("PortalService/GetDashboard", nil, 200, nil), "dashboard")
		if stats := obj(dash, "stats"); num(stats, "courses") != 1 || num(stats, "toDo") != 1 {
			t.Fatalf("dashboard stats = %v", stats)
		}
		watch := obj(student.rpc("PortalService/GetWatchPage", M{"video_id": videoID}, 200, nil), "page")
		if str(obj(watch, "video"), "sourceUrl") != "" {
			t.Error("students must not receive the raw source URL")
		}
	})

	t.Run("submit, validate and review", func(t *testing.T) {
		submit := func(items []M, want int) M {
			return student.rpc("PortalService/SubmitTask", M{"task_id": taskID, "input": M{"items": items}}, want, nil)
		}
		submit([]M{{"kind": "code", "content": "x"}}, 400)
		submit([]M{{"kind": "drive", "content": "https://evil.example.com/x"}}, 400)
		submit([]M{{"kind": "link", "content": "javascript:alert(1)"}}, 400)
		page := obj(submit([]M{{"kind": "text", "content": "My summary"}, {"kind": "drive", "content": "https://drive.google.com/file/d/abc/view"}}, 200), "page")
		if str(page, "status") != "pending" || flag(page, "canSubmit") {
			t.Fatalf("task page = %v", page)
		}
		submit([]M{{"kind": "text", "content": "again"}}, 409)
		student.rpc("PortalService/CommentTask", M{"task_id": taskID, "input": M{"body": "Is this enough?"}}, 200, nil)

		q := admin.rpc("SubmissionService/ListSubmissions", M{"status": "pending"}, 200, nil)
		items := arr(q, "items")
		if len(items) != 1 {
			t.Fatalf("queue = %v", q)
		}
		submissionID = str(items[0], "id")
		review := func(in M, want int) M {
			return admin.rpc("SubmissionService/ReviewSubmission", M{"id": submissionID, "input": in}, want, nil)
		}
		review(M{"status": "approved", "marks": 11}, 400)
		review(M{"status": "approved", "marks": 3}, 400)
		det := obj(review(M{"status": "approved", "marks": 9, "feedback": "Great"}, 200), "submission")
		if str(obj(det, "current"), "status") != "approved" || len(arr(det, "comments")) != 1 {
			t.Fatalf("detail = %v", det)
		}
	})

	t.Run("certificate auto-issued and verifiable", func(t *testing.T) {
		certs := arr(student.rpc("CertificateService/ListMyCertificates", nil, 200, nil), "items")
		if len(certs) != 1 {
			t.Fatalf("certificates = %v", certs)
		}
		code := str(certs[0], "code")
		v := obj(newClient(t, srv.URL, "student").rpc("CertificateService/VerifyCertificate", M{"code": code}, 200, nil), "verification")
		if !flag(v, "valid") || str(v, "studentName") != "Ann Student" {
			t.Fatalf("verify = %v", v)
		}
		var pdf struct {
			File struct {
				ContentType string `json:"contentType"`
				Data        []byte `json:"data"`
			} `json:"file"`
		}
		student.rpc("CertificateService/GetMyCertificatePdf", M{"id": str(certs[0], "id")}, 200, &pdf)
		if !bytes.HasPrefix(pdf.File.Data, []byte("%PDF")) || pdf.File.ContentType != "application/pdf" {
			t.Fatalf("pdf %q %d bytes", pdf.File.ContentType, len(pdf.File.Data))
		}
		student.rpc("PortalService/ListMyCourses", nil, 200, nil)
		dash := obj(student.rpc("PortalService/GetDashboard", nil, 200, nil), "dashboard")
		if num(arr(dash, "courses")[0], "progressPct") != 100 {
			t.Errorf("progress not 100%%: %v", dash["courses"])
		}
		notes := obj(student.rpc("NotificationService/ListNotifications", nil, 200, nil), "feed")
		if num(notes, "unread") < 2 {
			t.Errorf("expected review + certificate notifications, got %v", notes["unread"])
		}
	})

	t.Run("scoped mentor role", func(t *testing.T) {
		role := obj(admin.rpc("StaffService/CreateRole", M{"input": M{"name": "Tutor", "scoped": true, "permissions": M{"courses": M{"values": []string{"view"}}, "students": M{"values": []string{"view"}}}}}, 200, nil), "role")
		admin.rpc("StaffService/CreateRole", M{"input": M{"name": "Bad", "permissions": M{"nope": M{"values": []string{"view"}}}}}, 400, nil)
		staff := obj(admin.rpc("StaffService/CreateStaff", M{"input": M{"name": "Tim Tutor", "email": "tim@test.local", "password": "Tutor@1234", "role_ids": []any{role["id"]}}}, 200, nil), "staff")
		mentor := newClient(t, srv.URL, "admin")
		mentor.mustLogin("tim@test.local", "Tutor@1234")
		if l := mentor.rpc("CourseService/ListCourses", nil, 200, nil); num(l, "total") != 0 {
			t.Fatalf("unassigned tutor sees %v courses", l["total"])
		}
		mentor.rpc("CourseService/GetCourse", M{"id": courseID}, 403, nil)
		mentor.rpc("StaffService/ListStaff", nil, 403, nil)
		mentor.rpc("StudentService/DeleteStudent", M{"id": studentID}, 403, nil)
		admin.rpc("CourseService/UpdateCourse", M{"id": courseID, "input": M{"title": "Integration Course", "status": "published", "is_public": true, "mentor_ids": []any{staff["id"]}}}, 200, nil)
		time.Sleep(10 * time.Millisecond)
		if l := mentor.rpc("CourseService/ListCourses", nil, 200, nil); num(l, "total") != 1 {
			t.Fatalf("assigned tutor sees %v courses", l["total"])
		}
		if st := mentor.rpc("StudentService/ListStudents", nil, 200, nil); num(st, "total") != 1 {
			t.Fatalf("tutor sees %v students", st["total"])
		}
	})

	t.Run("csrf header required for cookie writes", func(t *testing.T) {
		_, err := student.authClient(false).ChangePassword(context.Background(), connect.NewRequest(&lmsv1.ChangePasswordRequest{NewPassword: "whatever123"}))
		if code := connect.CodeOf(err); err == nil || (code != connect.CodePermissionDenied && code != connect.CodeUnauthenticated) {
			t.Fatalf("write without X-LMS-App: %v", err)
		}
	})

	t.Run("refresh rotation and reuse detection", func(t *testing.T) {
		c := newClient(t, srv.URL, "student")
		c.mustLogin("ann@test.local", "Student@123")
		u, _ := url.Parse(srv.URL + "/rpc/lms.v1.AuthService/Refresh")
		old := c.hc.Jar.Cookies(u)
		sent := false
		for _, k := range old {
			sent = sent || k.Name == auth.RefreshCookieName("student")
		}
		if !sent {
			t.Fatalf("refresh cookie is not sent to %s: %v", u.Path, old)
		}
		refresh := func(cl *client) error {
			_, err := cl.authClient(true).Refresh(context.Background(), connect.NewRequest(&lmsv1.RefreshRequest{}))
			return err
		}
		if err := refresh(c); err != nil {
			t.Fatal(err)
		}
		thief := newClient(t, srv.URL, "student")
		thief.hc.Jar.SetCookies(u, old)
		wantCode(t, refresh(thief), connect.CodeUnauthenticated)
		wantCode(t, refresh(c), connect.CodeUnauthenticated) // reuse revoked every session of the user
	})

	t.Run("live session, audience and ics", func(t *testing.T) {
		start := time.Now().Add(2 * time.Hour).UTC().Truncate(time.Minute)
		ts := func(t time.Time) string { return t.Format(time.RFC3339) }
		admin.rpc("LiveService/CreateLive", M{"input": M{"title": "Live 1", "meet_url": "http://meet.google.com/x", "starts_at": ts(start), "ends_at": ts(start.Add(time.Hour)), "targets": []M{{"type": "batch", "id": batchID}}}}, 400, nil)
		l := obj(admin.rpc("LiveService/CreateLive", M{"input": M{"title": "Live Q&A", "meet_url": "https://meet.google.com/abc-defg-hij", "starts_at": ts(start), "ends_at": ts(start.Add(time.Hour)), "targets": []M{{"type": "batch", "id": batchID}}}}, 200, nil), "session")
		sid := str(obj(l, "session"), "id")
		if len(arr(l, "roster")) != 1 {
			t.Fatalf("roster = %v", l["roster"])
		}
		s2 := newClient(t, srv.URL, "student")
		s2.mustLogin("ann@test.local", "Student@123")
		if mine := arr(s2.rpc("LiveService/ListMyLive", M{"scope": "upcoming"}, 200, nil), "items"); len(mine) != 1 {
			t.Fatalf("student sees %d sessions", len(mine))
		}
		s2.rpc("LiveService/JoinLive", M{"id": sid}, 400, nil) // too early
		var ics struct {
			File struct {
				ContentType string `json:"contentType"`
				Data        []byte `json:"data"`
			} `json:"file"`
		}
		s2.rpc("LiveService/GetMyLiveIcs", M{"id": sid}, 200, &ics)
		if !strings.HasPrefix(ics.File.ContentType, "text/calendar") || !bytes.Contains(ics.File.Data, []byte("SUMMARY:Live Q&A")) {
			t.Fatalf("ics %s %s", ics.File.ContentType, ics.File.Data)
		}
		sync := obj(admin.rpc("LiveService/SyncLive", M{"id": sid, "input": M{"calendar": true, "attendance": true, "recording": true}}, 200, nil), "result")
		if flag(obj(sync, "calendar"), "ok") {
			t.Errorf("calendar sync without Google should not be ok: %v", sync)
		}
		admin.rpc("LiveService/MarkLiveAttendance", M{"id": sid, "input": M{"records": []M{{"student_id": studentID, "present": true}}}}, 200, nil)
		n, err := d.Q.DueLiveReminders(context.Background())
		if err != nil || len(n) != 1 {
			t.Errorf("due reminders = %d, %v", len(n), err)
		}
	})

	t.Run("quiz scoring and attempt limit", func(t *testing.T) {
		qz := obj(admin.rpc("QuizService/CreateQuiz", M{"video_id": videoID, "input": M{"title": "Check", "pass_pct": 50, "max_attempts": 1, "questions": []M{
			{"body": "2+2?", "options": []M{{"body": "4", "is_correct": true}, {"body": "5"}}},
			{"body": "Pick evens", "multi": true, "points": 2, "options": []M{{"body": "2", "is_correct": true}, {"body": "3"}, {"body": "4", "is_correct": true}}},
		}}}, 200, nil), "quiz")
		quizID = str(qz, "id")
		qs := arr(qz, "questions")
		q1, q2 := qs[0], qs[1]
		opts := func(q any, idx ...int) []any {
			o := arr(q, "options")
			out := []any{}
			for _, i := range idx {
				out = append(out, str(o[i], "id"))
			}
			return out
		}
		student.mustLogin("ann@test.local", "Student@123")
		// The quiz is new since Ann enrolled: hidden until she is moved to a version that has it.
		student.rpc("QuizService/StartQuiz", M{"id": quizID}, 404, nil)
		buildAndMoveAll(t, admin, courseID)
		play := obj(student.rpc("QuizService/StartQuiz", M{"id": quizID}, 200, nil), "play")
		for _, pq := range arr(play, "questions") {
			for _, o := range arr(pq, "options") {
				if _, leak := o.(M)["isCorrect"]; leak {
					t.Fatal("correct answers leaked to the student")
				}
			}
		}
		res := obj(student.rpc("QuizService/SubmitQuiz", M{"attempt_id": str(play, "attemptId"), "input": M{"answers": []M{
			{"question_id": str(q1, "id"), "option_ids": opts(q1, 0)}, {"question_id": str(q2, "id"), "option_ids": opts(q2, 0)},
		}}}, 200, nil), "result")
		if num(res, "score") != 1 || num(res, "maxScore") != 3 || flag(res, "passed") {
			t.Fatalf("result = %v", res)
		}
		student.rpc("QuizService/StartQuiz", M{"id": quizID}, 409, nil)
	})

	t.Run("announcements, comments and leads", func(t *testing.T) {
		admin.rpc("AnnouncementService/CreateAnnouncement", M{"input": M{"title": "Holiday", "body": "No class Monday", "target_type": "course", "target_id": courseID}}, 200, nil)
		if news := arr(student.rpc("AnnouncementService/ListMyAnnouncements", nil, 200, nil), "items"); len(news) != 1 {
			t.Fatalf("announcements = %v", news)
		}
		thread := arr(student.rpc("CommentService/CreateVideoComment", M{"video_id": videoID, "input": M{"body": "Question?"}}, 200, nil), "items")
		thread = arr(admin.rpc("CommentService/CreateVideoComment", M{"video_id": videoID, "input": M{"body": "Answer!", "parent_id": str(thread[0], "id")}}, 200, nil), "items")
		if len(arr(thread[0], "replies")) != 1 {
			t.Fatalf("thread = %v", thread)
		}
		anon := newClient(t, srv.URL, "student")
		anon.rpc("SiteService/SendEnquiry", M{"input": M{"name": "Lee", "email": "lee@example.com", "course_id": courseID}}, 200, nil)
		leads := obj(admin.rpc("LeadService/ListLeads", nil, 200, nil), "list")
		if num(leads, "total") != 1 {
			t.Fatalf("leads = %v", leads)
		}
		site := obj(anon.rpc("SiteService/GetPublicCourse", M{"slug": "integration-course"}, 200, nil), "course")
		if lessons := arr(site, "lessons"); len(lessons) != 1 || str(lessons[0], "embedUrl") == "" {
			t.Fatalf("public course = %v", site)
		}
	})

	t.Run("leads: stage, note, follow-up", func(t *testing.T) {
		stages := arr(admin.rpc("PipelineService/ListStages", nil, 200, nil), "items")
		if len(stages) == 0 {
			t.Fatal("no pipeline stages")
		}
		created := obj(admin.rpc("LeadService/CreateLead", M{"input": M{"name": "Mia Lead", "phone": "+919876543210", "source": "walk_in"}}, 200, nil), "result")
		leadID := str(obj(created, "lead"), "id")
		if leadID == "" {
			t.Fatalf("create lead = %v", created)
		}
		var won string
		for _, s := range stages {
			if str(s, "kind") == "open" && won == "" && str(s, "id") != str(obj(created, "lead"), "stageId") {
				won = str(s, "id")
			}
		}
		if won != "" {
			admin.rpc("LeadService/SetLeadStage", M{"id": leadID, "input": M{"stage_id": won}}, 200, nil)
		}
		admin.rpc("LeadService/AddLeadNote", M{"id": leadID, "input": M{"body": "Called, interested"}}, 200, nil)
		det := obj(admin.rpc("LeadService/GetLead", M{"id": leadID}, 200, nil), "lead")
		if len(arr(det, "activities")) == 0 {
			t.Fatalf("lead detail = %v", det)
		}
		student.rpc("LeadService/ListLeads", nil, 403, nil)
	})

	t.Run("csv import and export", func(t *testing.T) {
		r := obj(admin.rpc("StudentService/ImportStudents", M{"input": M{"csv": "name,email,phone,password\nBo,bo@test.local,,Secret@123\nCy,cy@test.local,=HYPERLINK(1),\nAnn,ann@test.local,,\nbad,not-an-email,,", "course_id": courseID}}, 200, nil), "result")
		if num(r, "created") != 2 || num(r, "skipped") != 1 || len(arr(r, "errors")) != 1 {
			t.Fatalf("import = %v", r)
		}
		var csv struct {
			File struct {
				Data []byte `json:"data"`
			} `json:"file"`
		}
		admin.rpc("StudentService/ExportStudents", nil, 200, &csv)
		if !bytes.Contains(csv.File.Data, []byte("'=HYPERLINK(1)")) {
			t.Fatalf("export: formula not neutralised: %s", csv.File.Data)
		}
	})

	t.Run("uploads: size limit and direct put", func(t *testing.T) {
		if d.Store == nil {
			t.Skip("object storage not reachable")
		}
		presign := func(in M, want int) M {
			return student.rpc("UploadService/PresignUpload", M{"input": in}, want, nil)
		}
		presign(M{"purpose": "submission", "file_name": "big.png", "mime": "image/png", "size": 3 << 20}, 400)
		presign(M{"purpose": "thumbnail", "file_name": "x.png", "mime": "image/png", "size": 10}, 403)
		presign(M{"purpose": "submission", "file_name": "x.exe", "mime": "application/x-msdownload", "size": 10}, 400)
		pre := obj(presign(M{"purpose": "submission", "file_name": "notes.txt", "mime": "text/plain", "size": 5}, 200), "presigned")
		req, _ := http.NewRequest("PUT", str(pre, "putUrl"), strings.NewReader("hello"))
		req.Header.Set("Content-Type", "text/plain")
		res, err := http.DefaultClient.Do(req)
		if err != nil || res.StatusCode != 200 {
			t.Fatalf("put: %v %v", err, res)
		}
		up := obj(pre, "upload")
		ready := obj(student.rpc("UploadService/CompleteUpload", M{"id": str(up, "id")}, 200, nil), "upload")
		if str(ready, "status") != "ready" || num(ready, "sizeBytes") != 5 {
			t.Fatalf("upload = %v", ready)
		}
		code, _, hdr := student.raw("GET", "/api/v1/files/"+str(up, "id"), nil, true)
		if code != 302 || !strings.Contains(hdr.Get("Location"), "X-Amz-Signature") {
			t.Fatalf("owner download %d %s", code, hdr.Get("Location"))
		}
		code, _, _ = newClient(t, srv.URL, "student").raw("GET", "/api/v1/files/"+str(up, "id"), nil, true)
		if code != 403 {
			t.Fatalf("anonymous download = %d", code)
		}
	})

	t.Run("course versions: students keep their version until moved", func(t *testing.T) {
		ctx := context.Background()
		vc := admin.versionClient()
		myCourse := func(c *client) any {
			for _, m := range arr(c.rpc("PortalService/ListMyCourses", nil, 200, nil), "items") {
				if str(m, "courseId") == courseID {
					return m
				}
			}
			t.Fatalf("course not in my courses")
			return nil
		}
		annBefore := myCourse(student)

		// Admin adds lesson 2 with a task: Ann (old version) must not see it.
		v2 := obj(admin.rpc("CourseService/CreateVideo", M{"course_id": courseID, "input": M{"title": "Lesson 2", "provider": "youtube", "url": "https://youtu.be/446E-r0rXHI"}}, 200, nil), "video")
		admin.rpc("CourseService/CreateTask", M{"video_id": str(v2, "id"), "input": M{"title": "Lesson 2 task", "allowed_types": []string{"text"}, "max_marks": 10, "pass_marks": 5}}, 200, nil)
		student.rpc("PortalService/GetWatchPage", M{"video_id": str(v2, "id")}, 404, nil)
		if got := num(myCourse(student), "videoCount"); got != num(annBefore, "videoCount") {
			t.Fatalf("Ann sees %v videos before the update, want %v", got, num(annBefore, "videoCount"))
		}

		sum, err := vc.GetVersionSummary(ctx, connect.NewRequest(&lmsv1.GetVersionSummaryRequest{CourseId: courseID}))
		if err != nil || !sum.Msg.GetHasChanges() || sum.Msg.GetChanges().GetAddedVideos() != 1 || sum.Msg.GetChanges().GetAddedTasks() != 1 {
			t.Fatalf("summary = %v, %v", sum, err)
		}
		built, err := vc.BuildVersion(ctx, connect.NewRequest(&lmsv1.BuildVersionRequest{CourseId: courseID, Note: "Lesson 2"}))
		if err != nil {
			t.Fatalf("BuildVersion: %v", err)
		}
		newV := built.Msg.GetVersion()
		if newV.GetVideoCount() != 2 || newV.GetStudentCount() != 0 {
			t.Fatalf("built version = %v", newV)
		}
		_, err = vc.BuildVersion(ctx, connect.NewRequest(&lmsv1.BuildVersionRequest{CourseId: courseID}))
		wantCode(t, err, connect.CodeAlreadyExists) // nothing changed since

		// A new student gets the latest version straight away.
		admin.rpc("StudentService/CreateStudent", M{"input": M{"name": "Bob New", "email": "bob@test.local", "password": "Student@123", "enrollments": []M{{"course_id": courseID}}}}, 200, nil)
		bob := newClient(t, srv.URL, "student")
		bob.mustLogin("bob@test.local", "Student@123")
		if got := num(myCourse(bob), "videoCount"); got != 2 {
			t.Fatalf("Bob sees %v videos, want 2", got)
		}
		bob.rpc("PortalService/GetWatchPage", M{"video_id": str(v2, "id")}, 200, nil)

		st, err := vc.ListVersionStudents(ctx, connect.NewRequest(&lmsv1.ListVersionStudentsRequest{CourseId: courseID}))
		if err != nil {
			t.Fatalf("ListVersionStudents: %v", err)
		}
		var annEnrollment string
		for _, s := range st.Msg.GetStudents() {
			switch s.GetEmail() {
			case "ann@test.local":
				annEnrollment = s.GetEnrollmentId()
				if s.GetVersionNumber() >= newV.GetNumber() {
					t.Fatalf("Ann is on v%d before the move", s.GetVersionNumber())
				}
			case "bob@test.local":
				if s.GetVersionNumber() != newV.GetNumber() {
					t.Fatalf("Bob is on v%d, want v%d", s.GetVersionNumber(), newV.GetNumber())
				}
			}
		}

		// A mentor who can only view students cannot move them.
		tim := newClient(t, srv.URL, "admin")
		tim.mustLogin("tim@test.local", "Tutor@1234")
		_, err = tim.versionClient().MoveStudents(ctx, connect.NewRequest(&lmsv1.MoveStudentsRequest{CourseId: courseID, VersionId: newV.GetId(), EnrollmentIds: []string{annEnrollment}}))
		wantCode(t, err, connect.CodePermissionDenied)

		// Admin moves Ann: she now sees lesson 2, and her approved work still counts.
		moved, err := vc.MoveStudents(ctx, connect.NewRequest(&lmsv1.MoveStudentsRequest{CourseId: courseID, VersionId: newV.GetId(), EnrollmentIds: []string{annEnrollment}}))
		if err != nil || moved.Msg.GetMoved() != 1 {
			t.Fatalf("MoveStudents = %v, %v", moved, err)
		}
		student.rpc("PortalService/GetWatchPage", M{"video_id": str(v2, "id")}, 200, nil)
		annAfter := myCourse(student)
		if num(annAfter, "videoCount") != 2 || num(annAfter, "approvedTasks") != num(annBefore, "approvedTasks") {
			t.Fatalf("Ann after move = %v (before %v)", annAfter, annBefore)
		}
	})

	t.Run("delete with confirmation of cascade", func(t *testing.T) {
		admin.rpc("CourseService/DeleteTask", M{"id": taskID}, 200, nil)
		// The task is in a built version, so it is archived: gone from the curriculum, work kept.
		for _, v := range arr(admin.rpc("CourseService/GetCurriculum", M{"course_id": courseID}, 200, nil), "items") {
			for _, tk := range arr(v, "tasks") {
				if str(tk, "id") == taskID {
					t.Fatal("archived task still in the curriculum")
				}
			}
		}
		admin.rpc("SubmissionService/GetSubmission", M{"id": submissionID}, 200, nil)
		// A task that was never built into a version is really deleted.
		draft := obj(admin.rpc("CourseService/CreateTask", M{"video_id": videoID, "input": M{"title": "Draft task", "allowed_types": []string{"text"}, "max_marks": 10, "pass_marks": 5}}, 200, nil), "task")
		admin.rpc("CourseService/DeleteTask", M{"id": str(draft, "id")}, 200, nil)
		admin.rpc("CourseService/UpdateTask", M{"id": str(draft, "id"), "input": M{"title": "Gone", "allowed_types": []string{"text"}, "max_marks": 10, "pass_marks": 5}}, 404, nil)
		admin.rpc("StaffService/DeleteStaff", M{"id": "00000000-0000-0000-0000-000000000000"}, 404, nil)
		admin.rpc("StaffService/DeleteStaff", M{"id": "not-a-uuid"}, 400, nil)
		if audit := admin.rpc("AdminService/ListAuditLog", M{"entity": "task"}, 200, nil); num(audit, "total") < 2 {
			t.Errorf("audit log has %v task entries", audit["total"])
		}
	})

	t.Run("realtime stream delivers hub events", func(t *testing.T) {
		c := newClient(t, srv.URL, "student")
		c.mustLogin("ann@test.local", "Student@123")
		nc := lmsv1connect.NewNotificationServiceClient(c.hc, srv.URL+"/rpc", connect.WithInterceptors(appHeader("student")))
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		stream, err := nc.Subscribe(ctx, connect.NewRequest(&lmsv1.SubscribeRequest{}))
		if err != nil {
			t.Fatal(err)
		}
		defer stream.Close()
		if !stream.Receive() || stream.Msg().GetType() != "hello" {
			t.Fatalf("first event = %v, %v", stream.Msg(), stream.Err())
		}
		d.Hub.Publish(ctx, uuid.MustParse(studentID), realtime.Event{Type: "notification", Data: M{"title": "Hi"}})
		if !stream.Receive() || stream.Msg().GetType() != "notification" || stream.Msg().GetData().AsMap()["title"] != "Hi" {
			t.Fatalf("event = %v, %v", stream.Msg(), stream.Err())
		}
		// Signed-out callers cannot subscribe.
		anon := lmsv1connect.NewNotificationServiceClient(http.DefaultClient, srv.URL+"/rpc", connect.WithInterceptors(appHeader("student")))
		s2, err := anon.Subscribe(ctx, connect.NewRequest(&lmsv1.SubscribeRequest{}))
		if err == nil {
			s2.Receive()
			err = s2.Err()
		}
		wantCode(t, err, connect.CodeUnauthenticated)
	})

	t.Run("login rate limit", func(t *testing.T) {
		c := newClient(t, srv.URL, "student")
		limited := false
		for i := 0; i < 25; i++ {
			if _, err := c.login("x@y.z", "bad"); connect.CodeOf(err) == connect.CodeResourceExhausted {
				limited = true
				break
			}
		}
		if !limited {
			t.Fatal("no ResourceExhausted after 25 failed logins")
		}
	})
}
