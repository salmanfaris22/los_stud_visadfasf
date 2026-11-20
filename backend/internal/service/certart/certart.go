// Package certart holds the built-in certificate art and the fonts certificates are drawn with.
// Fonts: Poppins and Great Vibes (SIL Open Font License, see fonts/OFL-*.txt).
package certart

import (
	"embed"
	"path"
	"regexp"
)

//go:embed art/* fonts/*
var files embed.FS

var artName = regexp.MustCompile(`^[a-z0-9-]+\.(jpg|png)$`)

// URLPrefix is where the API serves the built-in art (see httpx).
const URLPrefix = "/api/v1/certificate-art/"

// Art returns a built-in image by file name, e.g. "ms-navy-gold.jpg".
func Art(name string) ([]byte, bool) {
	if !artName.MatchString(name) {
		return nil, false
	}
	b, err := files.ReadFile(path.Join("art", name))
	return b, err == nil
}

// Font is one certificate font: its file and vertical metrics (fractions of the font size).
type Font struct {
	File    string
	Ascent  float64
	Descent float64
}

// Fonts are the field fonts. The same metrics are used by the admin editor so both place text alike.
var Fonts = map[string]Font{
	"sans-light":     {"Poppins-Light.ttf", 1.05, 0.35},
	"sans":           {"Poppins-Regular.ttf", 1.05, 0.35},
	"sans-medium":    {"Poppins-Medium.ttf", 1.05, 0.35},
	"sans-semibold":  {"Poppins-SemiBold.ttf", 1.05, 0.35},
	"sans-bold":      {"Poppins-Bold.ttf", 1.05, 0.35},
	"sans-extrabold": {"Poppins-ExtraBold.ttf", 1.05, 0.35},
	"script":         {"GreatVibes-Regular.ttf", 0.851, 0.401},
}

// FontBytes returns the TTF data of a font key.
func FontBytes(key string) []byte {
	f, ok := Fonts[key]
	if !ok {
		return nil
	}
	b, _ := files.ReadFile(path.Join("fonts", f.File))
	return b
}

// Bold is the font used for **bold** words written in the given font.
func Bold(key string) string {
	switch key {
	case "sans-light", "sans", "sans-medium":
		return "sans-semibold"
	case "sans-semibold", "sans-bold":
		return "sans-extrabold"
	}
	return key
}
