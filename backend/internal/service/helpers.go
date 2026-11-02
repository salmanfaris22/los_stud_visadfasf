package service

import (
	"regexp"
	"strings"

	"github.com/lms/backend/internal/apperr"
)

func dbErr(err error, what string) error { return apperr.DB(err, what) }

func str(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// optStr returns nil for blank strings (used for optional filters / nullable columns).
func optStr(s string) *string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	return &s
}

func pct(approved, total int32) int {
	if total <= 0 {
		return 0
	}
	return int(approved * 100 / total)
}

var slugRe = regexp.MustCompile(`[^a-z0-9]+`)

// Slugify turns a title into a URL slug.
func Slugify(s string) string {
	s = strings.Trim(slugRe.ReplaceAllString(strings.ToLower(s), "-"), "-")
	if len(s) > 80 {
		s = strings.Trim(s[:80], "-")
	}
	if s == "" {
		s = "item"
	}
	return s
}

// safeCSV neutralises spreadsheet formula injection in exported cells.
func safeCSV(s string) string {
	if s != "" && strings.ContainsRune("=+-@\t\r", rune(s[0])) {
		return "'" + s
	}
	return s
}

func orDefault(v, def string) string {
	if strings.TrimSpace(v) == "" {
		return def
	}
	return v
}
