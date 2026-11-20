package service

import (
	"bytes"
	"strings"
	"testing"
	"time"

	"github.com/lms/backend/internal/dto"
)

func TestCertValuesFill(t *testing.T) {
	v := CertValues{Student: "Fathima Risana", Course: "AI Video Production", Code: "MS-1", Issued: time.Date(2026, 11, 20, 10, 0, 0, 0, time.UTC)}
	got := v.Fill("For **{course}** at MS AI School. {course_text}")
	if got != "For **AI Video Production** at MS AI School." {
		t.Errorf("empty course text left spaces: %q", got)
	}
	if got := v.Fill("COMPLETED – {year}\n{date}"); got != "COMPLETED – 2026\n20 November 2026" {
		t.Errorf("year/date = %q", got)
	}
}

func TestBoldRunsAndWrap(t *testing.T) {
	runs := boldRuns("completing the **AI Video** course", "sans")
	if len(runs) != 3 || runs[1].text != "AI Video" || runs[1].font != "sans-semibold" || runs[0].font != "sans" {
		t.Fatalf("runs = %+v", runs)
	}
	// width = characters, so lines break at 12 characters.
	width := func(l []segment) float64 { return float64(len(plain(l))) }
	lines := wrapLine(boldRuns("one two three **four five** six", "sans"), 12, width)
	var got []string
	for _, l := range lines {
		got = append(got, plain(l))
	}
	if strings.Join(got, "|") != "one two|three four|five six" {
		t.Errorf("lines = %q", got)
	}
	// The bold word keeps its font after wrapping.
	if lines[1][2].font != "sans-semibold" {
		t.Errorf("bold lost: %+v", lines[1])
	}
}

func TestRenderTemplatePDF(t *testing.T) {
	fields := []dto.CertificateField{
		{ID: "n", Kind: "text", Text: "{student}", X: 19, Y: 98, W: 157, Font: "script", Size: 64, Color: "#e3c06c", Fit: true},
		{ID: "d", Kind: "text", Text: "For **{course}**. {course_text}", X: 19, Y: 133, W: 159, Font: "sans", Size: 11, LineHeight: 1.7},
		{ID: "r", Kind: "text", Text: "completed – {year}", X: 19, Y: 184, W: 63, Font: "sans-bold", Size: 11.6, Spacing: 0.5, Uppercase: true},
		{ID: "q", Kind: "qr", X: 93, Y: 179, W: 15},
	}
	v := CertValues{Student: "A Very Long Student Name That Must Shrink To Fit", Course: "Go", Code: "MS-1", VerifyURL: "http://x/verify/MS-1", Issued: time.Now()}
	raw, err := RenderTemplatePDF("t", nil, fields, v, nil)
	if err != nil || !bytes.HasPrefix(raw, []byte("%PDF")) {
		t.Fatalf("render: %v (%d bytes)", err, len(raw))
	}
	if _, err := RenderTemplatePDF("t", []byte("RIFF....WEBP"), fields, v, nil); err == nil {
		t.Error("a WebP background must be refused")
	}
}
