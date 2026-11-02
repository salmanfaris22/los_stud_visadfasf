// Package google wraps Google OAuth (login + organisation connect) and the
// Calendar, Meet and Admin Reports REST APIs used by live-session sync.
package google

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"golang.org/x/oauth2"
	goog "golang.org/x/oauth2/google"

	"github.com/lms/backend/internal/config"
)

const (
	ScopeCalendarEvents = "https://www.googleapis.com/auth/calendar.events"
	ScopeMeetReadonly   = "https://www.googleapis.com/auth/meetings.space.readonly"
	ScopeReportsAudit   = "https://www.googleapis.com/auth/admin.reports.audit.readonly"
)

type Client struct {
	cfg *config.Config
}

func New(cfg *config.Config) *Client { return &Client{cfg: cfg} }

func (c *Client) Enabled() bool { return c.cfg.GoogleClientID != "" && c.cfg.GoogleClientSecret != "" }

// LoginConfig is used for "Sign in with Google".
func (c *Client) LoginConfig() *oauth2.Config {
	return &oauth2.Config{
		ClientID:     c.cfg.GoogleClientID,
		ClientSecret: c.cfg.GoogleClientSecret,
		Endpoint:     goog.Endpoint,
		RedirectURL:  c.cfg.APIPublicURL + "/api/v1/auth/google/callback",
		Scopes:       []string{"openid", "email", "profile"},
	}
}

// OrgConfig connects the institute's Google account for calendar/meet sync.
func (c *Client) OrgConfig(workspace bool) *oauth2.Config {
	scopes := []string{"openid", "email", ScopeCalendarEvents}
	if workspace {
		scopes = append(scopes, ScopeMeetReadonly, ScopeReportsAudit)
	}
	return &oauth2.Config{
		ClientID:     c.cfg.GoogleClientID,
		ClientSecret: c.cfg.GoogleClientSecret,
		Endpoint:     goog.Endpoint,
		RedirectURL:  c.cfg.APIPublicURL + "/api/v1/settings/google/callback",
		Scopes:       scopes,
	}
}

// State is carried through the OAuth round trip, signed with HMAC.
type State struct {
	Purpose string `json:"p"`
	App     string `json:"a"`
	Nonce   string `json:"n"`
	Exp     int64  `json:"e"`
}

func SignState(secret []byte, s State) string {
	raw, _ := json.Marshal(s)
	body := base64.RawURLEncoding.EncodeToString(raw)
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(body))
	return body + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func ParseState(secret []byte, v string) (State, error) {
	var s State
	body, sig, ok := strings.Cut(v, ".")
	if !ok {
		return s, errors.New("bad state")
	}
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(body))
	want := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(sig), []byte(want)) {
		return s, errors.New("bad state signature")
	}
	raw, err := base64.RawURLEncoding.DecodeString(body)
	if err != nil {
		return s, err
	}
	if err := json.Unmarshal(raw, &s); err != nil {
		return s, err
	}
	if time.Now().Unix() > s.Exp {
		return s, errors.New("state expired")
	}
	return s, nil
}

type UserInfo struct {
	Sub           string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
	Picture       string `json:"picture"`
}

func FetchUserInfo(ctx context.Context, hc *http.Client) (UserInfo, error) {
	var u UserInfo
	err := doJSON(ctx, hc, http.MethodGet, "https://openidconnect.googleapis.com/v1/userinfo", nil, &u)
	return u, err
}

// EventInput is the calendar event we keep in sync with a live session.
type EventInput struct {
	Title       string
	Description string
	MeetURL     string
	Start, End  time.Time
	Attendees   []string
}

// UpsertEvent creates or updates an event on the connected account's primary calendar and
// emails invitations to attendees. It returns the event id.
func UpsertEvent(ctx context.Context, hc *http.Client, eventID string, in EventInput) (string, error) {
	type attendee struct {
		Email string `json:"email"`
	}
	type when struct {
		DateTime string `json:"dateTime"`
	}
	body := map[string]any{
		"summary":     in.Title,
		"description": strings.TrimSpace(in.Description + "\n\nJoin: " + in.MeetURL),
		"location":    in.MeetURL,
		"start":       when{in.Start.UTC().Format(time.RFC3339)},
		"end":         when{in.End.UTC().Format(time.RFC3339)},
		"reminders":   map[string]any{"useDefault": true},
	}
	atts := make([]attendee, 0, len(in.Attendees))
	for _, e := range in.Attendees {
		atts = append(atts, attendee{e})
	}
	body["attendees"] = atts
	base := "https://www.googleapis.com/calendar/v3/calendars/primary/events"
	var out struct {
		ID string `json:"id"`
	}
	if eventID != "" {
		err := doJSON(ctx, hc, http.MethodPut, base+"/"+url.PathEscape(eventID)+"?sendUpdates=all", body, &out)
		if err == nil {
			return out.ID, nil
		}
		var he *HTTPError
		if !errors.As(err, &he) || (he.Status != 404 && he.Status != 410) {
			return "", err
		}
	}
	if err := doJSON(ctx, hc, http.MethodPost, base+"?sendUpdates=all", body, &out); err != nil {
		return "", err
	}
	return out.ID, nil
}

func DeleteEvent(ctx context.Context, hc *http.Client, eventID string) error {
	if eventID == "" {
		return nil
	}
	return doJSON(ctx, hc, http.MethodDelete, "https://www.googleapis.com/calendar/v3/calendars/primary/events/"+url.PathEscape(eventID)+"?sendUpdates=all", nil, nil)
}

var meetCodeRe = regexp.MustCompile(`([a-z]{3}-[a-z]{4}-[a-z]{3})`)

// MeetingCode extracts "abc-defg-hij" from a meet.google.com link.
func MeetingCode(meetURL string) string {
	return meetCodeRe.FindString(strings.ToLower(meetURL))
}

// MeetAttendance reads Admin Reports "call_ended" events for a meeting and returns
// seconds attended per participant email. Needs a Workspace admin account.
func MeetAttendance(ctx context.Context, hc *http.Client, code string, from, to time.Time) (map[string]int, error) {
	if code == "" {
		return nil, errors.New("meet link has no meeting code")
	}
	filterCode := strings.ToUpper(strings.ReplaceAll(code, "-", ""))
	q := url.Values{}
	q.Set("eventName", "call_ended")
	q.Set("filters", "meeting_code=="+filterCode)
	q.Set("startTime", from.UTC().Format(time.RFC3339))
	q.Set("endTime", to.UTC().Format(time.RFC3339))
	q.Set("maxResults", "1000")
	out := map[string]int{}
	pageToken := ""
	for {
		if pageToken != "" {
			q.Set("pageToken", pageToken)
		}
		var resp struct {
			NextPageToken string `json:"nextPageToken"`
			Items         []struct {
				Events []struct {
					Parameters []struct {
						Name     string `json:"name"`
						Value    string `json:"value"`
						IntValue string `json:"intValue"`
					} `json:"parameters"`
				} `json:"events"`
			} `json:"items"`
		}
		err := doJSON(ctx, hc, http.MethodGet, "https://admin.googleapis.com/admin/reports/v1/activity/users/all/applications/meet?"+q.Encode(), nil, &resp)
		if err != nil {
			return nil, err
		}
		for _, it := range resp.Items {
			for _, ev := range it.Events {
				email, secs := "", 0
				for _, p := range ev.Parameters {
					switch p.Name {
					case "identifier":
						email = strings.ToLower(p.Value)
					case "duration_seconds":
						fmt.Sscan(p.IntValue, &secs)
					}
				}
				if email != "" {
					out[email] += secs
				}
			}
		}
		if resp.NextPageToken == "" {
			return out, nil
		}
		pageToken = resp.NextPageToken
	}
}

// MeetRecording returns the Drive link of the newest recording for the meeting code.
func MeetRecording(ctx context.Context, hc *http.Client, code string) (string, error) {
	if code == "" {
		return "", errors.New("meet link has no meeting code")
	}
	q := url.Values{}
	q.Set("filter", fmt.Sprintf(`space.meeting_code = "%s"`, code))
	var recs struct {
		ConferenceRecords []struct {
			Name string `json:"name"`
		} `json:"conferenceRecords"`
	}
	if err := doJSON(ctx, hc, http.MethodGet, "https://meet.googleapis.com/v2/conferenceRecords?"+q.Encode(), nil, &recs); err != nil {
		return "", err
	}
	for _, cr := range recs.ConferenceRecords {
		var r struct {
			Recordings []struct {
				DriveDestination struct {
					ExportURI string `json:"exportUri"`
				} `json:"driveDestination"`
			} `json:"recordings"`
		}
		if err := doJSON(ctx, hc, http.MethodGet, "https://meet.googleapis.com/v2/"+cr.Name+"/recordings", nil, &r); err != nil {
			return "", err
		}
		for _, rec := range r.Recordings {
			if rec.DriveDestination.ExportURI != "" {
				return rec.DriveDestination.ExportURI, nil
			}
		}
	}
	return "", nil
}

type HTTPError struct {
	Status int
	Body   string
}

func (e *HTTPError) Error() string { return fmt.Sprintf("google api %d: %s", e.Status, e.Body) }

func doJSON(ctx context.Context, hc *http.Client, method, u string, in, out any) error {
	var body io.Reader
	if in != nil {
		raw, err := json.Marshal(in)
		if err != nil {
			return err
		}
		body = bytes.NewReader(raw)
	}
	req, err := http.NewRequestWithContext(ctx, method, u, body)
	if err != nil {
		return err
	}
	if in != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := hc.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if resp.StatusCode >= 300 {
		msg := string(raw)
		if len(msg) > 300 {
			msg = msg[:300]
		}
		return &HTTPError{Status: resp.StatusCode, Body: msg}
	}
	if out != nil && len(raw) > 0 {
		return json.Unmarshal(raw, out)
	}
	return nil
}
