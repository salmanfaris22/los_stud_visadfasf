package service

import "testing"

func TestSlugify(t *testing.T) {
	cases := map[string]string{"Go Backend Mastery!": "go-backend-mastery", "  Next.js  13 / App Router ": "next-js-13-app-router", "!!!": "item", "Ünïcode Course": "n-code-course"}
	for in, want := range cases {
		if got := Slugify(in); got != want {
			t.Errorf("Slugify(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestSafeCSV(t *testing.T) {
	for in, want := range map[string]string{"=SUM(A1)": "'=SUM(A1)", "+91 900": "'+91 900", "@x": "'@x", "Anu": "Anu", "": ""} {
		if got := safeCSV(in); got != want {
			t.Errorf("safeCSV(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestValidLink(t *testing.T) {
	if validLink("https://github.com/x/y", false) != nil {
		t.Error("valid https link rejected")
	}
	if validLink("javascript:alert(1)", false) == nil || validLink("ftp://x", false) == nil || validLink("github.com/x", false) == nil {
		t.Error("unsafe/partial link accepted")
	}
	if validLink("https://drive.google.com/file/d/1/view", true) != nil || validLink("https://docs.google.com/document/d/1", true) != nil {
		t.Error("drive link rejected")
	}
	if validLink("https://dropbox.com/x", true) == nil {
		t.Error("non-drive link accepted as drive")
	}
}

func TestPct(t *testing.T) {
	if pct(1, 3) != 33 || pct(0, 0) != 0 || pct(4, 4) != 100 {
		t.Error("pct wrong")
	}
}
