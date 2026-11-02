package service

import (
	"strings"
	"testing"
	"time"
)

func TestBuildICS(t *testing.T) {
	start := time.Date(2026, 11, 2, 10, 0, 0, 0, time.UTC)
	out := string(BuildICS("LMS", ICSEvent{UID: "x@lms", Title: "Go, live; Q&A", Description: "line1\nline2 " + strings.Repeat("long ", 30),
		Location: "https://meet.google.com/abc-defg-hij", URL: "https://meet.google.com/abc-defg-hij", Start: start, End: start.Add(time.Hour)}))
	for _, want := range []string{"BEGIN:VCALENDAR\r\n", "DTSTART:20261102T100000Z", "DTEND:20261102T110000Z", `SUMMARY:Go\, live\; Q&A`, "TRIGGER:-PT15M", "END:VCALENDAR\r\n"} {
		if !strings.Contains(out, want) {
			t.Errorf("ics missing %q", want)
		}
	}
	for _, line := range strings.Split(out, "\r\n") {
		if len(line) > 75 {
			t.Errorf("line longer than 75 octets: %d", len(line))
		}
	}
}

func TestGoogleCalendarLink(t *testing.T) {
	start := time.Date(2026, 11, 2, 10, 0, 0, 0, time.UTC)
	l := GoogleCalendarLink("Class", "d", "loc", start, start.Add(time.Hour))
	if !strings.Contains(l, "dates=20261102T100000Z%2F20261102T110000Z") {
		t.Errorf("bad link %s", l)
	}
}
