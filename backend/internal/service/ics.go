package service

import (
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
)

// ICSEvent is the data needed to write an .ics calendar file.
type ICSEvent struct {
	UID         string
	Title       string
	Description string
	Location    string
	URL         string
	Start, End  time.Time
}

const icsStamp = "20060102T150405Z"

func icsEscape(s string) string {
	r := strings.NewReplacer(`\`, `\\`, ";", `\;`, ",", `\,`, "\r\n", `\n`, "\n", `\n`)
	return r.Replace(s)
}

// icsFold splits long lines at 75 octets as RFC 5545 requires.
func icsFold(line string) string {
	if len(line) <= 75 {
		return line
	}
	var b strings.Builder
	limit := 75 // first line; continuation lines start with a space, so they carry 74
	for len(line) > limit {
		cut := limit
		for cut > 0 && !utf8Start(line[cut]) {
			cut--
		}
		b.WriteString(line[:cut])
		b.WriteString("\r\n ")
		line = line[cut:]
		limit = 74
	}
	b.WriteString(line)
	return b.String()
}

func utf8Start(c byte) bool { return c&0xC0 != 0x80 }

// BuildICS renders a single-event calendar with a 15-minute reminder.
func BuildICS(prodName string, ev ICSEvent) []byte {
	lines := []string{
		"BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//" + icsEscape(prodName) + "//Live Sessions//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
		"BEGIN:VEVENT",
		"UID:" + ev.UID,
		"DTSTAMP:" + time.Now().UTC().Format(icsStamp),
		"DTSTART:" + ev.Start.UTC().Format(icsStamp),
		"DTEND:" + ev.End.UTC().Format(icsStamp),
		"SUMMARY:" + icsEscape(ev.Title),
		"DESCRIPTION:" + icsEscape(ev.Description),
		"LOCATION:" + icsEscape(ev.Location),
		"URL:" + ev.URL,
		"BEGIN:VALARM", "TRIGGER:-PT15M", "ACTION:DISPLAY", "DESCRIPTION:" + icsEscape(ev.Title), "END:VALARM",
		"END:VEVENT", "END:VCALENDAR",
	}
	var b strings.Builder
	for _, l := range lines {
		b.WriteString(icsFold(l))
		b.WriteString("\r\n")
	}
	return []byte(b.String())
}

// GoogleCalendarLink returns an "add to Google Calendar" URL (works without any API).
func GoogleCalendarLink(title, details, location string, start, end time.Time) string {
	q := url.Values{}
	q.Set("action", "TEMPLATE")
	q.Set("text", title)
	q.Set("dates", start.UTC().Format(icsStamp)+"/"+end.UTC().Format(icsStamp))
	q.Set("details", details)
	q.Set("location", location)
	return "https://calendar.google.com/calendar/render?" + q.Encode()
}

func liveUID(id uuid.UUID) string { return fmt.Sprintf("live-%s@lms", id) }
