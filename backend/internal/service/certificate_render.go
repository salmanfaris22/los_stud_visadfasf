package service

import (
	"bytes"
	"fmt"
	"image/color"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-pdf/fpdf"
	qrcode "github.com/skip2/go-qrcode"

	"github.com/lms/backend/internal/dto"
	"github.com/lms/backend/internal/service/certart"
)

// A4 landscape, in millimetres (template field units).
const (
	certPageW = 297.0
	certPageH = 210.0
	ptToMM    = 25.4 / 72
)

// CertValues fill the placeholders of a template.
type CertValues struct {
	Student, Course, CourseText, Code, VerifyURL string
	Issued                                       time.Time // already in the institute time zone
}

var spaces = regexp.MustCompile(`[ \t]+`)

// Fill replaces the placeholders and tidies the spaces left by empty values.
func (v CertValues) Fill(s string) string {
	r := strings.NewReplacer(
		"{student}", v.Student, "{course}", v.Course, "{course_text}", v.CourseText,
		"{year}", strconv.Itoa(v.Issued.Year()), "{date}", v.Issued.Format("2 January 2006"),
		"{code}", v.Code, "{verify_url}", v.VerifyURL,
	)
	lines := strings.Split(r.Replace(s), "\n")
	for i, l := range lines {
		lines[i] = strings.TrimSpace(spaces.ReplaceAllString(l, " "))
	}
	return strings.Join(lines, "\n")
}

// imageType reads the image format from its first bytes ("" when fpdf cannot draw it).
func imageType(b []byte) string {
	switch {
	case bytes.HasPrefix(b, []byte{0xFF, 0xD8, 0xFF}):
		return "JPG"
	case bytes.HasPrefix(b, []byte("\x89PNG")):
		return "PNG"
	case bytes.HasPrefix(b, []byte("GIF8")):
		return "GIF"
	}
	return ""
}

// segment is a piece of one line drawn in one font.
type segment struct {
	text string
	font string
}

// RenderTemplatePDF draws a certificate: the background over the whole page, then every field.
// images loads image fields (signatures, logos) by URL.
func RenderTemplatePDF(title string, background []byte, fields []dto.CertificateField, v CertValues, images func(src string) ([]byte, error)) ([]byte, error) {
	pdf := fpdf.New("L", "mm", "A4", "")
	pdf.SetTitle(title, true)
	pdf.SetCreator("MS Ai School", true)
	pdf.SetAutoPageBreak(false, 0)
	pdf.SetMargins(0, 0, 0)
	pdf.AddPage()

	if len(background) > 0 {
		typ := imageType(background)
		if typ == "" {
			return nil, fmt.Errorf("the background must be a JPG or PNG image")
		}
		pdf.RegisterImageOptionsReader("background", fpdf.ImageOptions{ImageType: typ}, bytes.NewReader(background))
		pdf.ImageOptions("background", 0, 0, certPageW, certPageH, false, fpdf.ImageOptions{ImageType: typ}, 0, "")
	}

	loaded := map[string]bool{}
	useFont := func(key string, size float64) {
		if _, ok := certart.Fonts[key]; !ok {
			key = "sans"
		}
		if !loaded[key] {
			pdf.AddUTF8FontFromBytes(key, "", certart.FontBytes(key))
			loaded[key] = true
		}
		pdf.SetFont(key, "", size)
	}

	for i, f := range fields {
		switch f.Kind {
		case "qr":
			q, err := qrcode.New(v.VerifyURL, qrcode.Medium)
			if err != nil {
				return nil, err
			}
			q.ForegroundColor = hexColor(f.Color, color.RGBA{13, 30, 83, 255})
			q.BackgroundColor = color.White
			png, err := q.PNG(512)
			if err != nil {
				return nil, err
			}
			name := "qr" + strconv.Itoa(i)
			pdf.RegisterImageOptionsReader(name, fpdf.ImageOptions{ImageType: "PNG"}, bytes.NewReader(png))
			pdf.ImageOptions(name, f.X, f.Y, f.W, f.W, false, fpdf.ImageOptions{ImageType: "PNG"}, 0, "")
		case "image":
			if f.Src == "" || images == nil {
				continue
			}
			b, err := images(f.Src)
			if err != nil {
				return nil, err
			}
			typ := imageType(b)
			if typ == "" {
				return nil, fmt.Errorf("image %q must be a JPG or PNG", f.Label)
			}
			name := "img" + strconv.Itoa(i)
			pdf.RegisterImageOptionsReader(name, fpdf.ImageOptions{ImageType: typ}, bytes.NewReader(b))
			pdf.ImageOptions(name, f.X, f.Y, f.W, 0, false, fpdf.ImageOptions{ImageType: typ}, 0, "")
		default:
			drawTextField(pdf, f, v.Fill(f.Text), useFont)
		}
	}

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// drawTextField lays out a text field like the admin editor does:
// lines wrap at the box width, line i sits on baseline y + ascent + i*lineHeight, letter spacing is added between characters.
func drawTextField(pdf *fpdf.Fpdf, f dto.CertificateField, text string, useFont func(string, float64)) {
	if strings.TrimSpace(text) == "" {
		return
	}
	if f.Uppercase {
		text = strings.ToUpper(text)
	}
	font := f.Font
	if _, ok := certart.Fonts[font]; !ok {
		font = "sans"
	}
	size := f.Size
	if size <= 0 {
		size = 12
	}
	lh := f.LineHeight
	if lh <= 0 {
		lh = 1.2
	}
	r, g, b := hexRGB(orDefault(f.Color, "#000000"))
	pdf.SetTextColor(r, g, b)

	measure := func(s segment, size float64) float64 {
		useFont(s.font, size)
		return pdf.GetStringWidth(s.text)
	}
	lineWidth := func(line []segment, size float64) float64 {
		w, n := 0.0, 0
		for _, s := range line {
			w += measure(s, size)
			n += utf8.RuneCountInString(s.text)
		}
		if n > 1 {
			w += f.Spacing * float64(n-1)
		}
		return w
	}

	var lines [][]segment
	if f.Fit {
		lines = [][]segment{boldRuns(strings.ReplaceAll(text, "\n", " "), font)}
		if w := lineWidth(lines[0], size); w > f.W && w > 0 {
			n := float64(utf8.RuneCountInString(plain(lines[0])) - 1)
			glyphs := w - f.Spacing*n
			if room := f.W - f.Spacing*n; glyphs > 0 && room > 0 {
				size *= room / glyphs
			}
		}
	} else {
		for _, para := range strings.Split(text, "\n") {
			lines = append(lines, wrapLine(boldRuns(para, font), f.W, func(l []segment) float64 { return lineWidth(l, size) })...)
		}
	}

	sizeMM := size * ptToMM
	asc := certart.Fonts[font].Ascent
	for i, line := range lines {
		baseline := f.Y + asc*sizeMM + float64(i)*lh*sizeMM
		x := f.X
		switch w := lineWidth(line, size); f.Align {
		case "center":
			x += (f.W - w) / 2
		case "right":
			x += f.W - w
		}
		for _, s := range line {
			useFont(s.font, size)
			if f.Spacing == 0 {
				pdf.Text(x, baseline, s.text)
				x += pdf.GetStringWidth(s.text)
				continue
			}
			for _, ch := range s.text {
				c := string(ch)
				pdf.Text(x, baseline, c)
				x += pdf.GetStringWidth(c) + f.Spacing
			}
		}
	}
}

// boldRuns splits "**bold**" markup into font runs.
func boldRuns(text, font string) []segment {
	var out []segment
	for i, part := range strings.Split(text, "**") {
		if part == "" {
			continue
		}
		key := font
		if i%2 == 1 {
			key = certart.Bold(font)
		}
		out = append(out, segment{part, key})
	}
	return out
}

func plain(line []segment) string {
	var b strings.Builder
	for _, s := range line {
		b.WriteString(s.text)
	}
	return b.String()
}

// wrapLine breaks runs into lines no wider than max, at spaces (a word longer than a line stays whole).
func wrapLine(runs []segment, max float64, width func([]segment) float64) [][]segment {
	type word struct{ parts []segment }
	var words []word
	cur := word{}
	for _, r := range runs {
		for j, w := range strings.Split(r.text, " ") {
			if j > 0 {
				words = append(words, cur)
				cur = word{}
			}
			if w != "" {
				cur.parts = append(cur.parts, segment{w, r.font})
			}
		}
	}
	words = append(words, cur)

	var lines [][]segment
	var line []segment
	join := func(line []segment, w word) []segment {
		out := append([]segment{}, line...)
		if len(out) > 0 && len(w.parts) > 0 {
			out = append(out, segment{" ", w.parts[0].font})
		}
		return append(out, w.parts...)
	}
	for _, w := range words {
		if len(w.parts) == 0 {
			continue
		}
		next := join(line, w)
		if len(line) > 0 && width(next) > max {
			lines = append(lines, line)
			line = append([]segment{}, w.parts...)
			continue
		}
		line = next
	}
	if len(line) > 0 {
		lines = append(lines, line)
	}
	return lines
}

func hexColor(h string, def color.RGBA) color.Color {
	if !regexp.MustCompile(`^#[0-9a-fA-F]{6}$`).MatchString(h) {
		return def
	}
	r, g, b := hexRGB(h)
	return color.RGBA{uint8(r), uint8(g), uint8(b), 255}
}
