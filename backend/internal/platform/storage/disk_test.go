package storage

import (
	"bytes"
	"context"
	"encoding/base64"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/lms/backend/internal/config"
)

// A 1x1 PNG.
var tinyPNG, _ = base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")

func newDiskStore(t *testing.T) (*Store, string) {
	t.Helper()
	dir := filepath.Join(t.TempDir(), "uploads")
	s, err := New(context.Background(), &config.Config{Storage: "disk", StorageDir: dir, JWTSecret: []byte("test-secret-test-secret-test-secret!!")})
	if err != nil {
		t.Fatal(err)
	}
	return s, dir
}

func do(t *testing.T, h http.Handler, method, target string, body []byte) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, target, bytes.NewReader(body))
	req.Header.Set("Content-Type", "image/png")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestDiskUploadAndRead(t *testing.T) {
	s, dir := newDiskStore(t)
	ctx := context.Background()
	h := s.DiskHandler()
	if h == nil || !s.ImagesOnly() || s.MaxBytes() != 2<<20 {
		t.Fatalf("disk store: handler %v images-only %v max %d", h, s.ImagesOnly(), s.MaxBytes())
	}
	key := "avatar/2026/11/0b7c/me.png"

	put, err := s.PresignPut(ctx, key, 15*time.Minute)
	if err != nil || !strings.HasPrefix(put, DiskPathPrefix+"avatar/2026/11/0b7c/me.png?") {
		t.Fatalf("put link %q %v", put, err)
	}
	if rec := do(t, h, "PUT", put, tinyPNG); rec.Code != 200 {
		t.Fatalf("put = %d %s", rec.Code, rec.Body)
	}
	if _, err := os.Stat(filepath.Join(dir, "avatar/2026/11/0b7c/me.png")); err != nil {
		t.Fatal("file not on disk:", err)
	}
	size, ct, err := s.Size(ctx, key)
	if err != nil || size != int64(len(tinyPNG)) || ct != "image/png" {
		t.Fatalf("size = %d %q %v", size, ct, err)
	}

	get, _ := s.PresignGet(ctx, key, "me.png", false, time.Hour)
	rec := do(t, h, "GET", get, nil)
	if rec.Code != 200 || !bytes.Equal(rec.Body.Bytes(), tinyPNG) || rec.Header().Get("Content-Type") != "image/png" ||
		!strings.HasPrefix(rec.Header().Get("Content-Disposition"), "inline") {
		t.Fatalf("get = %d %q %q", rec.Code, rec.Header().Get("Content-Type"), rec.Header().Get("Content-Disposition"))
	}
	dl, _ := s.PresignGet(ctx, key, "me.png", true, time.Hour)
	if rec := do(t, h, "GET", dl, nil); rec.Header().Get("Content-Disposition") != `attachment; filename=me.png` {
		t.Fatalf("download disposition = %q", rec.Header().Get("Content-Disposition"))
	}
	if rec := do(t, h, "HEAD", get, nil); rec.Code != 200 {
		t.Fatalf("head = %d", rec.Code)
	}

	rc, err := s.Get(ctx, key)
	if err != nil {
		t.Fatal(err)
	}
	got, _ := io.ReadAll(rc)
	rc.Close()
	if !bytes.Equal(got, tinyPNG) {
		t.Fatal("Get returned other bytes")
	}
	if err := s.Ping(ctx); err != nil {
		t.Fatal("ping:", err)
	}
	if err := s.Remove(ctx, key); err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.Size(ctx, key); err == nil {
		t.Fatal("file still there after Remove")
	}
	if err := s.Remove(ctx, key); err != nil {
		t.Fatal("second remove:", err)
	}
}

func TestDiskRefusesBadUploads(t *testing.T) {
	s, dir := newDiskStore(t)
	ctx := context.Background()
	h := s.DiskHandler()
	key := "submission/2026/11/abcd/x.png"
	put, _ := s.PresignPut(ctx, key, 15*time.Minute)

	cases := []struct {
		name   string
		method string
		target string
		body   []byte
		want   int
	}{
		{"not an image", "PUT", put, []byte("<script>alert(1)</script>"), 415},
		{"empty", "PUT", put, nil, 415},
		{"too big", "PUT", put, append(append([]byte{}, tinyPNG...), make([]byte, 2<<20)...), 413},
		{"tampered signature", "PUT", strings.Replace(put, "sig=", "sig=0", 1), tinyPNG, 403},
		{"other key, same signature", "PUT", strings.Replace(put, "x.png", "y.png", 1), tinyPNG, 403},
		{"get with the put link", "GET", put, nil, 403},
		{"no signature", "PUT", DiskPathPrefix + key, tinyPNG, 403},
		{"dot-dot", "PUT", DiskPathPrefix + "../../etc/passwd", tinyPNG, 404},
		{"hidden temp file", "GET", DiskPathPrefix + "submission/.upload-1", nil, 404},
		{"delete", "DELETE", put, nil, 405},
	}
	for _, c := range cases {
		if rec := do(t, h, c.method, c.target, c.body); rec.Code != c.want {
			t.Errorf("%s: got %d want %d (%s)", c.name, rec.Code, c.want, strings.TrimSpace(rec.Body.String()))
		}
	}
	if _, err := os.Stat(filepath.Join(dir, filepath.FromSlash(key))); !os.IsNotExist(err) {
		t.Fatal("a refused upload left a file behind")
	}
	left, _ := filepath.Glob(filepath.Join(dir, "submission/2026/11/abcd/.upload-*"))
	if len(left) != 0 {
		t.Fatal("temp files left:", left)
	}

	// Expired links stop working.
	s.disk.now = func() time.Time { return time.Now().Add(16 * time.Minute) }
	if rec := do(t, h, "PUT", put, tinyPNG); rec.Code != 403 {
		t.Fatalf("expired put = %d", rec.Code)
	}

	// Bad keys never become paths or links.
	for _, k := range []string{"", "../x", "a//b", "a/./b", "a/../b", ".hidden", "a\\b"} {
		if _, err := s.disk.path(k); err == nil {
			t.Errorf("key %q accepted", k)
		}
		if _, err := s.PresignPut(ctx, k, time.Minute); err == nil {
			t.Errorf("presign for key %q accepted", k)
		}
	}
}

func TestS3StoreHasNoDiskHandler(t *testing.T) {
	var s *Store
	if s.ImagesOnly() || s.MaxBytes() != 0 || s.DiskHandler() != nil {
		t.Fatal("nil store must look like plain S3")
	}
	s3 := &Store{}
	if s3.ImagesOnly() || s3.DiskHandler() != nil {
		t.Fatal("S3 store must not serve disk links")
	}
}
