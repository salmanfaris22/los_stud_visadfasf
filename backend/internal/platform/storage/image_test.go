package storage

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/gif"
	"image/png"
	"math/rand"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

// photoPNG is a noisy opaque PNG (compresses badly as PNG, well as JPEG), like a screenshot or photo.
func photoPNG(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	rng := rand.New(rand.NewSource(1))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, color.RGBA{uint8(x + rng.Intn(40)), uint8(y + rng.Intn(40)), uint8(rng.Intn(255)), 255})
		}
	}
	var b bytes.Buffer
	if err := png.Encode(&b, img); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

func put(t *testing.T, s *Store, key string, data []byte) {
	t.Helper()
	if err := s.Put(context.Background(), key, bytes.NewReader(data), int64(len(data)), ""); err != nil {
		t.Fatal(err)
	}
}

func serve(t *testing.T, s *Store, key string, download bool, width int) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	s.ServeImage(rec, httptest.NewRequest("GET", "/api/v1/files/x", nil), key, "pic.png", download, "public, max-age=31536000, immutable", width)
	return rec
}

func TestSnapWidth(t *testing.T) {
	for in, want := range map[int]int{0: 1920, -5: 1920, 1: 128, 128: 128, 129: 320, 600: 640, 1300: 1920, 99999: 1920} {
		if got := snapWidth(in); got != want {
			t.Errorf("snapWidth(%d) = %d, want %d", in, got, want)
		}
	}
}

func TestServeImageCompressesAndResizes(t *testing.T) {
	s, dir := newDiskStore(t)
	key := "thumbnail/2026/11/aaaa/photo.png"
	orig := photoPNG(t, 2400, 1350)
	put(t, s, key, orig)

	rec := serve(t, s, key, false, 640)
	if rec.Code != 200 || rec.Header().Get("Content-Type") != "image/jpeg" || rec.Header().Get("Cache-Control") != "public, max-age=31536000, immutable" {
		t.Fatalf("view = %d %q %q", rec.Code, rec.Header().Get("Content-Type"), rec.Header().Get("Cache-Control"))
	}
	cfg, _, err := image.DecodeConfig(bytes.NewReader(rec.Body.Bytes()))
	if err != nil || cfg.Width != 640 || cfg.Height != 360 {
		t.Fatalf("640 copy is %dx%d (%v)", cfg.Width, cfg.Height, err)
	}
	if rec.Body.Len()*5 > len(orig) {
		t.Fatalf("640 copy is %d bytes, original %d: not compressed enough", rec.Body.Len(), len(orig))
	}
	if _, err := os.Stat(filepath.Join(dir, filepath.FromSlash(key)+"~w640")); err != nil {
		t.Fatal("copy not kept on disk:", err)
	}

	// No width = the default 1920 copy, still JPEG and much smaller than the PNG.
	full := serve(t, s, key, false, 0)
	cfg, _, _ = image.DecodeConfig(bytes.NewReader(full.Body.Bytes()))
	if cfg.Width != 1920 || full.Body.Len() >= len(orig)/2 {
		t.Fatalf("default copy %d wide, %d bytes (original %d)", cfg.Width, full.Body.Len(), len(orig))
	}

	// Downloads get the original bytes.
	dl := serve(t, s, key, true, 640)
	if !bytes.Equal(dl.Body.Bytes(), orig) || dl.Header().Get("Content-Disposition") != "attachment; filename=pic.png" {
		t.Fatalf("download: %d bytes, disposition %q", dl.Body.Len(), dl.Header().Get("Content-Disposition"))
	}

	// WarmImage makes the default copy ahead of time.
	key2 := "thumbnail/2026/11/bbbb/photo.png"
	put(t, s, key2, photoPNG(t, 800, 450))
	if err := s.WarmImage(key2); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, filepath.FromSlash(key2)+"~w1920")); err != nil {
		t.Fatal("WarmImage made no copy:", err)
	}
}

func TestServeImageKeepsTransparencyAndGIF(t *testing.T) {
	s, _ := newDiskStore(t)

	// Transparent logo: stays PNG.
	logo := image.NewNRGBA(image.Rect(0, 0, 900, 300))
	for x := 0; x < 900; x++ {
		logo.Set(x, 150, color.NRGBA{200, 0, 0, 255})
	}
	var b bytes.Buffer
	png.Encode(&b, logo)
	put(t, s, "cms/2026/11/cccc/logo.png", b.Bytes())
	rec := serve(t, s, "cms/2026/11/cccc/logo.png", false, 320)
	cfg, format, err := image.DecodeConfig(bytes.NewReader(rec.Body.Bytes()))
	if err != nil || format != "png" || cfg.Width != 320 {
		t.Fatalf("transparent copy: %s %dx%d %v", format, cfg.Width, cfg.Height, err)
	}

	// GIF (may be animated): sent as it is.
	g := &gif.GIF{Image: []*image.Paletted{image.NewPaletted(image.Rect(0, 0, 2000, 10), color.Palette{color.Black, color.White})}, Delay: []int{0}}
	b.Reset()
	gif.EncodeAll(&b, g)
	put(t, s, "blog/2026/11/dddd/anim.gif", b.Bytes())
	rec = serve(t, s, "blog/2026/11/dddd/anim.gif", false, 320)
	if rec.Header().Get("Content-Type") != "image/gif" || !bytes.Equal(rec.Body.Bytes(), b.Bytes()) {
		t.Fatalf("gif changed: %q, %d bytes", rec.Header().Get("Content-Type"), rec.Body.Len())
	}

	// Small image that does not get smaller: the original is used as the copy.
	tiny := tinyPNG
	put(t, s, "avatar/2026/11/eeee/me.png", tiny)
	rec = serve(t, s, "avatar/2026/11/eeee/me.png", false, 128)
	if rec.Code != 200 || rec.Body.Len() > len(tiny) {
		t.Fatalf("tiny image grew: %d > %d", rec.Body.Len(), len(tiny))
	}

	// Missing file.
	if rec := serve(t, s, "avatar/2026/11/ffff/none.png", false, 128); rec.Code != http.StatusNotFound {
		t.Fatalf("missing = %d", rec.Code)
	}
}
