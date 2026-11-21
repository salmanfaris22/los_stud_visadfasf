package storage

// Fast images for disk storage: every view gets a compressed copy at a fixed width (made on the
// first request and kept next to the original), served with long cache headers. The original is
// only sent for downloads. GIFs are sent as they are (animation).

import (
	"bytes"
	"image"
	"image/draw"
	_ "image/gif" // decoders, registered for image.Decode
	"image/jpeg"
	"image/png"
	"net/http"
	"os"
	"strconv"

	xdraw "golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
)

// ImageWidths are the sizes images are served in; a requested width snaps up to the next one.
var ImageWidths = []int{128, 320, 640, 1280, 1920}

const (
	defaultImageWidth = 1920
	maxImagePixels    = 40_000_000 // larger images are sent as they are (decoding them needs too much memory)
	jpegQuality       = 80
)

// resizeSlots limits how many images are decoded at once (memory on a small server).
var resizeSlots = make(chan struct{}, 2)

// snapWidth picks the served width for a requested one (0 = the default).
func snapWidth(w int) int {
	if w <= 0 {
		return defaultImageWidth
	}
	for _, s := range ImageWidths {
		if w <= s {
			return s
		}
	}
	return ImageWidths[len(ImageWidths)-1]
}

func variantKey(key string, width int) string { return key + "~w" + strconv.Itoa(width) }

// ServeImage sends a stored file: downloads get the original, views get the compressed copy for
// the requested width. cache is the Cache-Control value. Disk storage only.
func (s *Store) ServeImage(w http.ResponseWriter, r *http.Request, key, fileName string, download bool, cache string, width int) {
	if !s.ImagesOnly() {
		http.NotFound(w, r)
		return
	}
	d := s.disk
	sendKey := key
	if !download {
		if v, err := d.variant(key, snapWidth(width)); err == nil {
			sendKey = v
		}
	}
	f, err := d.open(sendKey)
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
	h := w.Header()
	h.Set("Content-Type", sniff(f))
	h.Set("Content-Disposition", disposition(download, fileName))
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Cache-Control", cache)
	http.ServeContent(w, r, "", info.ModTime(), f)
}

// variant returns the key of the compressed copy of key at width, making it when missing. GIFs and
// images that are too large to decode come back as the original key.
func (d *diskStore) variant(key string, width int) (string, error) {
	vkey := variantKey(key, width)
	vpath, err := d.path(vkey)
	if err != nil {
		return "", err
	}
	if _, err := os.Stat(vpath); err == nil {
		return vkey, nil
	}
	orig, err := d.open(key)
	if err != nil {
		return "", err
	}
	defer orig.Close()
	cfg, format, err := image.DecodeConfig(orig)
	if err != nil {
		return "", err
	}
	if format == "gif" || cfg.Width*cfg.Height > maxImagePixels {
		return key, nil
	}
	info, err := orig.Stat()
	if err != nil {
		return "", err
	}

	resizeSlots <- struct{}{}
	defer func() { <-resizeSlots }()
	if _, err := os.Stat(vpath); err == nil { // made by another request while this one waited
		return vkey, nil
	}
	if _, err := orig.Seek(0, 0); err != nil {
		return "", err
	}
	src, _, err := image.Decode(orig)
	if err != nil {
		return "", err
	}
	out, err := encodeVariant(src, width)
	if err != nil {
		return "", err
	}
	if int64(out.Len()) >= info.Size() && src.Bounds().Dx() <= width {
		// Re-encoding did not make it smaller and it needs no resize: the original is the copy.
		if _, err := orig.Seek(0, 0); err != nil {
			return "", err
		}
		return vkey, d.write(vkey, orig, nil)
	}
	return vkey, d.write(vkey, out, nil)
}

// encodeVariant scales src down to at most width pixels wide and compresses it: JPEG for opaque
// images, PNG when there is transparency.
func encodeVariant(src image.Image, width int) (*bytes.Buffer, error) {
	b := src.Bounds()
	img := src
	if b.Dx() > width {
		h := int(float64(b.Dy()) * float64(width) / float64(b.Dx()))
		if h < 1 {
			h = 1
		}
		dst := image.NewRGBA(image.Rect(0, 0, width, h))
		xdraw.CatmullRom.Scale(dst, dst.Bounds(), src, b, draw.Over, nil)
		img = dst
	}
	out := &bytes.Buffer{}
	if opaque(img) {
		return out, jpeg.Encode(out, img, &jpeg.Options{Quality: jpegQuality})
	}
	enc := png.Encoder{CompressionLevel: png.BestCompression}
	return out, enc.Encode(out, img)
}

// opaque reports whether every pixel is fully opaque.
func opaque(img image.Image) bool {
	if o, ok := img.(interface{ Opaque() bool }); ok {
		return o.Opaque()
	}
	b := img.Bounds()
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			if _, _, _, a := img.At(x, y).RGBA(); a != 0xffff {
				return false
			}
		}
	}
	return true
}

// WarmImage makes the default compressed copy right after an upload, so the first view is fast.
// It does nothing for S3 storage.
func (s *Store) WarmImage(key string) error {
	if !s.ImagesOnly() {
		return nil
	}
	_, err := s.disk.variant(key, defaultImageWidth)
	return err
}
