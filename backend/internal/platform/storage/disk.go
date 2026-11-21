package storage

// Disk storage (STORAGE=disk): uploads live in a folder on the API server. It is meant for
// images only. The browser PUTs to a short-lived signed link on the API itself
// (/api/v1/storage/<key>?exp=..&sig=..), which the web apps proxy like any other /api call, so it
// works from HTTPS sites without the API needing its own certificate; reads come back the same way.

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const (
	// DiskPathPrefix is where the API serves the signed disk links.
	DiskPathPrefix = "/api/v1/storage/"
	// DiskMaxBytes is the largest file disk storage accepts (images only).
	DiskMaxBytes = 2 << 20
)

// diskImageTypes are the content types disk storage keeps, checked on the bytes, not the header.
var diskImageTypes = map[string]bool{"image/png": true, "image/jpeg": true, "image/webp": true, "image/gif": true}

var errBadKey = errors.New("storage: bad object key")

type diskStore struct {
	dir string
	key []byte
	now func() time.Time
}

func newDisk(dir string, secret []byte) (*diskStore, error) {
	abs, err := filepath.Abs(dir)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(abs, 0o750); err != nil {
		return nil, fmt.Errorf("storage: make folder %s: %w", abs, err)
	}
	probe, err := os.CreateTemp(abs, ".probe-*")
	if err != nil {
		return nil, fmt.Errorf("storage: folder %s is not writable: %w", abs, err)
	}
	probe.Close()
	os.Remove(probe.Name())
	// A key of its own, so a storage link can never be mistaken for anything else signed with the secret.
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte("lms disk storage links"))
	return &diskStore{dir: abs, key: mac.Sum(nil), now: time.Now}, nil
}

// path maps an object key (purpose/2026/11/<uuid>/name.png) to a file inside the folder. Keys
// with empty, dot or dot-dot parts are refused, so a link can never reach outside the folder or
// the hidden temp files.
func (d *diskStore) path(key string) (string, error) {
	if key == "" || strings.ContainsAny(key, "\\\x00") {
		return "", errBadKey
	}
	for _, part := range strings.Split(key, "/") {
		if part == "" || strings.HasPrefix(part, ".") {
			return "", errBadKey
		}
	}
	return filepath.Join(d.dir, filepath.FromSlash(key)), nil
}

func (d *diskStore) sign(method, key string, exp int64, dl, name string) string {
	mac := hmac.New(sha256.New, d.key)
	fmt.Fprintf(mac, "%s\n%s\n%d\n%s\n%s", method, key, exp, dl, name)
	return hex.EncodeToString(mac.Sum(nil))
}

func (d *diskStore) link(method, key string, ttl time.Duration, dl, name string) string {
	exp := d.now().Add(ttl).Unix()
	q := url.Values{}
	if dl != "" {
		q.Set("dl", dl)
	}
	if name != "" {
		q.Set("name", name)
	}
	q.Set("exp", strconv.FormatInt(exp, 10))
	q.Set("sig", d.sign(method, key, exp, dl, name))
	parts := strings.Split(key, "/")
	for i, p := range parts {
		parts[i] = url.PathEscape(p)
	}
	return DiskPathPrefix + strings.Join(parts, "/") + "?" + q.Encode()
}

func (d *diskStore) verify(method, key string, q url.Values) bool {
	exp, err := strconv.ParseInt(q.Get("exp"), 10, 64)
	if err != nil || d.now().Unix() > exp {
		return false
	}
	want := d.sign(method, key, exp, q.Get("dl"), q.Get("name"))
	return hmac.Equal([]byte(want), []byte(q.Get("sig")))
}

// sniff returns the content type of the file's first bytes.
func sniff(f *os.File) string {
	buf := make([]byte, 512)
	n, _ := io.ReadFull(f, buf)
	f.Seek(0, io.SeekStart)
	return http.DetectContentType(buf[:n])
}

// write stores r at key through a temp file, so a half-written upload is never served.
// check, when set, looks at the finished temp file and can refuse it.
func (d *diskStore) write(key string, r io.Reader, check func(*os.File) error) error {
	file, err := d.path(key)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(file), 0o750); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(file), ".upload-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name()) // no-op after the rename
	if _, err := io.Copy(tmp, r); err != nil {
		tmp.Close()
		return err
	}
	if check != nil {
		if _, err := tmp.Seek(0, io.SeekStart); err != nil {
			tmp.Close()
			return err
		}
		if err := check(tmp); err != nil {
			tmp.Close()
			return err
		}
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), file)
}

func (d *diskStore) size(key string) (int64, string, error) {
	file, err := d.path(key)
	if err != nil {
		return 0, "", err
	}
	f, err := os.Open(file)
	if err != nil {
		return 0, "", err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return 0, "", err
	}
	return info.Size(), sniff(f), nil
}

func (d *diskStore) open(key string) (*os.File, error) {
	file, err := d.path(key)
	if err != nil {
		return nil, err
	}
	return os.Open(file)
}

func (d *diskStore) remove(key string) error {
	file, err := d.path(key)
	if err != nil {
		return err
	}
	if err := os.Remove(file); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

func (d *diskStore) ping() error {
	info, err := os.Stat(d.dir)
	if err != nil {
		return err
	}
	if !info.IsDir() {
		return fmt.Errorf("storage: %s is not a folder", d.dir)
	}
	return nil
}

var (
	errTooBig   = errors.New("the image must be 2 MB or smaller")
	errNotImage = errors.New("only PNG, JPG, WEBP or GIF images can be uploaded")
)

// ServeHTTP answers the signed links: PUT stores an image, GET and HEAD return it.
func (d *diskStore) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	key, ok := strings.CutPrefix(r.URL.Path, DiskPathPrefix)
	if _, err := d.path(key); !ok || err != nil {
		http.NotFound(w, r)
		return
	}
	switch r.Method {
	case http.MethodPut:
		if !d.verify(http.MethodPut, key, r.URL.Query()) {
			http.Error(w, "this upload link is invalid or expired, please try again", http.StatusForbidden)
			return
		}
		d.receive(w, r, key)
	case http.MethodGet, http.MethodHead:
		if !d.verify(http.MethodGet, key, r.URL.Query()) {
			http.Error(w, "this link is invalid or expired", http.StatusForbidden)
			return
		}
		d.send(w, r, key)
	default:
		w.Header().Set("Allow", "GET, HEAD, PUT")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (d *diskStore) receive(w http.ResponseWriter, r *http.Request, key string) {
	if r.ContentLength > DiskMaxBytes {
		http.Error(w, errTooBig.Error(), http.StatusRequestEntityTooLarge)
		return
	}
	body := http.MaxBytesReader(w, r.Body, DiskMaxBytes)
	err := d.write(key, body, func(f *os.File) error {
		info, err := f.Stat()
		if err != nil {
			return err
		}
		if info.Size() == 0 || !diskImageTypes[sniff(f)] {
			return errNotImage
		}
		return nil
	})
	var tooBig *http.MaxBytesError
	switch {
	case err == nil:
		w.WriteHeader(http.StatusOK)
	case errors.As(err, &tooBig):
		http.Error(w, errTooBig.Error(), http.StatusRequestEntityTooLarge)
	case errors.Is(err, errNotImage):
		http.Error(w, errNotImage.Error(), http.StatusUnsupportedMediaType)
	default:
		http.Error(w, "could not save the file, please try again", http.StatusInternalServerError)
	}
}

func (d *diskStore) send(w http.ResponseWriter, r *http.Request, key string) {
	f, err := d.open(key)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil || info.IsDir() {
		http.NotFound(w, r)
		return
	}
	q := r.URL.Query()
	h := w.Header()
	h.Set("Content-Type", sniff(f))
	h.Set("Content-Disposition", disposition(q.Get("dl") == "1", q.Get("name")))
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Cache-Control", "private, max-age=3600")
	http.ServeContent(w, r, "", info.ModTime(), f)
}

// disposition is the Content-Disposition value: inline to view, attachment to save, with the name.
func disposition(download bool, name string) string {
	disp := "inline"
	if download {
		disp = "attachment"
	}
	if name != "" {
		if v := mime.FormatMediaType(disp, map[string]string{"filename": name}); v != "" {
			return v
		}
	}
	return disp
}
