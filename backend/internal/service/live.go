package service

import (
	"context"
	"fmt"
	"log/slog"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/lms/backend/internal/apperr"
	"github.com/lms/backend/internal/auth"
	"github.com/lms/backend/internal/dto"
	"github.com/lms/backend/internal/platform/google"
	"github.com/lms/backend/internal/repository"
)

// LiveService manages Google Meet live sessions: audience targeting, attendance,
// recordings, the Sync button (Calendar / Meet / Drive), .ics files and reminders.
type LiveService struct{ base }

func toLive(r repository.LiveSession, hostName string, present int32) dto.LiveSession {
	return dto.LiveSession{ID: r.ID, Title: r.Title, Description: r.Description, MeetURL: r.MeetUrl, StartsAt: r.StartsAt, EndsAt: r.EndsAt,
		HostID: r.HostID, HostName: hostName, RecordingURL: r.RecordingUrl, Status: r.Status, CalendarSynced: r.GcalEventID != "",
		LastSyncedAt: r.LastSyncedAt, PresentCount: present, Targets: []dto.LiveTarget{},
		GoogleCalendarURL: GoogleCalendarLink(r.Title, strings.TrimSpace(r.Description+"\n\nJoin: "+r.MeetUrl), r.MeetUrl, r.StartsAt, r.EndsAt)}
}

func rowToSession(r repository.GetLiveSessionRow) repository.LiveSession {
	return repository.LiveSession{ID: r.ID, Title: r.Title, Description: r.Description, MeetUrl: r.MeetUrl, StartsAt: r.StartsAt, EndsAt: r.EndsAt,
		HostID: r.HostID, RecordingUrl: r.RecordingUrl, GcalEventID: r.GcalEventID, Status: r.Status, RemindedDay: r.RemindedDay,
		RemindedSoon: r.RemindedSoon, LastSyncedAt: r.LastSyncedAt, CreatedBy: r.CreatedBy, CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt}
}

func validMeetURL(raw string) error {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Scheme != "https" || u.Host == "" {
		return apperr.Invalid("paste the full meeting link, e.g. https://meet.google.com/abc-defg-hij")
	}
	return nil
}

func (s *LiveService) List(ctx context.Context, actor *auth.Principal, f dto.LiveFilter) (dto.List[dto.LiveSession], error) {
	rows, err := s.Q.ListLiveSessions(ctx, repository.ListLiveSessionsParams{FromTime: f.From, ToTime: f.To, CourseID: f.CourseID, MentorID: actor.MentorScope(), Lim: f.Lim(), Off: f.Off()})
	if err != nil {
		return dto.List[dto.LiveSession]{}, dbErr(err, "live sessions")
	}
	out := make([]dto.LiveSession, 0, len(rows))
	var total int64
	for _, r := range rows {
		total = r.TotalCount
		sess := repository.LiveSession{ID: r.ID, Title: r.Title, Description: r.Description, MeetUrl: r.MeetUrl, StartsAt: r.StartsAt, EndsAt: r.EndsAt,
			HostID: r.HostID, RecordingUrl: r.RecordingUrl, GcalEventID: r.GcalEventID, Status: r.Status, LastSyncedAt: r.LastSyncedAt}
		out = append(out, toLive(sess, str(r.HostName), r.PresentCount))
	}
	return dto.NewList(out, total, f.PageQuery), nil
}

// checkTargets validates every target exists and is inside a scoped mentor's assignments.
func (s *LiveService) checkTargets(ctx context.Context, actor *auth.Principal, targets []dto.LiveTarget) error {
	for _, t := range targets {
		var err error
		switch t.Type {
		case "course":
			if _, e := s.Q.GetCourse(ctx, t.ID); e != nil {
				return dbErr(e, "course")
			}
			err = s.access.EnsureCourse(ctx, actor, t.ID)
		case "batch":
			if _, e := s.Q.GetBatch(ctx, t.ID); e != nil {
				return dbErr(e, "batch")
			}
			err = s.access.EnsureBatch(ctx, actor, t.ID)
		case "student":
			if u, e := s.Q.GetUserByID(ctx, t.ID); e != nil || u.Kind != auth.KindStudent {
				return apperr.NotFound("student")
			}
			err = s.access.EnsureStudent(ctx, actor, t.ID)
		default:
			return apperr.Invalid("unknown target type %q", t.Type)
		}
		if err != nil {
			return err
		}
	}
	return nil
}

// canManage lets scoped mentors manage sessions they host/created or that target their groups.
func (s *LiveService) canManage(ctx context.Context, actor *auth.Principal, sess repository.LiveSession) error {
	if actor.MentorScope() == nil || (sess.HostID != nil && *sess.HostID == actor.ID) || (sess.CreatedBy != nil && *sess.CreatedBy == actor.ID) {
		return nil
	}
	targets, err := s.Q.ListLiveTargets(ctx, sess.ID)
	if err != nil {
		return dbErr(err, "live session")
	}
	for _, t := range targets {
		if s.checkTargets(ctx, actor, []dto.LiveTarget{{Type: t.TargetType, ID: t.TargetID}}) == nil {
			return nil
		}
	}
	return errOutOfScope
}

func (s *LiveService) load(ctx context.Context, actor *auth.Principal, id uuid.UUID) (repository.LiveSession, string, error) {
	r, err := s.Q.GetLiveSession(ctx, id)
	if err != nil {
		return repository.LiveSession{}, "", dbErr(err, "live session")
	}
	sess := rowToSession(r)
	return sess, str(r.HostName), s.canManage(ctx, actor, sess)
}

func (s *LiveService) targets(ctx context.Context, id uuid.UUID) ([]dto.LiveTarget, error) {
	rows, err := s.Q.ListLiveTargets(ctx, id)
	if err != nil {
		return nil, dbErr(err, "targets")
	}
	out := make([]dto.LiveTarget, 0, len(rows))
	for _, r := range rows {
		out = append(out, dto.LiveTarget{Type: r.TargetType, ID: r.TargetID, Label: r.Label})
	}
	return out, nil
}

func (s *LiveService) detail(ctx context.Context, sess repository.LiveSession, hostName string) (dto.LiveDetail, error) {
	audience, err := s.Q.LiveAudienceStudents(ctx, sess.ID)
	if err != nil {
		return dto.LiveDetail{}, dbErr(err, "audience")
	}
	att, err := s.Q.ListLiveAttendance(ctx, sess.ID)
	if err != nil {
		return dto.LiveDetail{}, dbErr(err, "attendance")
	}
	byStudent := map[uuid.UUID]repository.LiveAttendance{}
	present := int32(0)
	for _, a := range att {
		byStudent[a.StudentID] = a
		if a.Present {
			present++
		}
	}
	targets, err := s.targets(ctx, sess.ID)
	if err != nil {
		return dto.LiveDetail{}, err
	}
	out := dto.LiveDetail{Session: toLive(sess, hostName, present), Roster: make([]dto.LiveRosterRow, 0, len(audience))}
	out.Session.Targets = targets
	for _, st := range audience {
		row := dto.LiveRosterRow{StudentID: st.ID, Name: st.Name, Email: st.Email, StudentCode: str(st.StudentCode)}
		if a, ok := byStudent[st.ID]; ok {
			row.Marked, row.Present, row.Source, row.JoinedAt, row.DurationSeconds = true, a.Present, a.Source, a.JoinedAt, a.DurationSeconds
		}
		out.Roster = append(out.Roster, row)
	}
	return out, nil
}

func (s *LiveService) Get(ctx context.Context, actor *auth.Principal, id uuid.UUID) (dto.LiveDetail, error) {
	sess, host, err := s.load(ctx, actor, id)
	if err != nil {
		return dto.LiveDetail{}, err
	}
	return s.detail(ctx, sess, host)
}

func (s *LiveService) validate(ctx context.Context, actor *auth.Principal, in dto.LiveInput) error {
	if err := validMeetURL(in.MeetURL); err != nil {
		return err
	}
	if !in.EndsAt.After(in.StartsAt) {
		return apperr.Invalid("end time must be after start time")
	}
	if in.EndsAt.Sub(in.StartsAt) > 12*time.Hour {
		return apperr.Invalid("a session can be at most 12 hours long")
	}
	return s.checkTargets(ctx, actor, in.Targets)
}

func saveTargets(ctx context.Context, q *repository.Queries, id uuid.UUID, targets []dto.LiveTarget) error {
	if err := q.ClearLiveTargets(ctx, id); err != nil {
		return err
	}
	for _, t := range targets {
		if err := q.AddLiveTarget(ctx, repository.AddLiveTargetParams{SessionID: id, TargetType: t.Type, TargetID: t.ID}); err != nil {
			return err
		}
	}
	return nil
}

func (s *LiveService) Create(ctx context.Context, actor *auth.Principal, in dto.LiveInput) (dto.LiveDetail, error) {
	if err := s.validate(ctx, actor, in); err != nil {
		return dto.LiveDetail{}, err
	}
	host := in.HostID
	if host == nil {
		host = &actor.ID
	}
	var sess repository.LiveSession
	err := s.tx(ctx, func(q *repository.Queries) error {
		var err error
		if sess, err = q.CreateLiveSession(ctx, repository.CreateLiveSessionParams{Title: strings.TrimSpace(in.Title), Description: in.Description,
			MeetUrl: strings.TrimSpace(in.MeetURL), StartsAt: in.StartsAt, EndsAt: in.EndsAt, HostID: host, CreatedBy: &actor.ID}); err != nil {
			return err
		}
		return saveTargets(ctx, q, sess.ID, in.Targets)
	})
	if err != nil {
		return dto.LiveDetail{}, dbErr(err, "live session")
	}
	s.audit.Log(ctx, actor, "create", "live", sess.ID, in)
	s.notifyAudience(ctx, sess.ID, "live", "New live class: "+sess.Title, "Scheduled live session. Check the calendar for the time.", "/learn/live")
	r, _ := s.Q.GetLiveSession(ctx, sess.ID)
	return s.detail(ctx, sess, str(r.HostName))
}

func (s *LiveService) Update(ctx context.Context, actor *auth.Principal, id uuid.UUID, in dto.LiveInput) (dto.LiveDetail, error) {
	cur, _, err := s.load(ctx, actor, id)
	if err != nil {
		return dto.LiveDetail{}, err
	}
	if err := s.validate(ctx, actor, in); err != nil {
		return dto.LiveDetail{}, err
	}
	var sess repository.LiveSession
	err = s.tx(ctx, func(q *repository.Queries) error {
		var err error
		if sess, err = q.UpdateLiveSession(ctx, repository.UpdateLiveSessionParams{ID: id, Title: strings.TrimSpace(in.Title), Description: in.Description,
			MeetUrl: strings.TrimSpace(in.MeetURL), StartsAt: in.StartsAt, EndsAt: in.EndsAt, HostID: in.HostID, Status: orDefault(in.Status, "scheduled")}); err != nil {
			return err
		}
		return saveTargets(ctx, q, id, in.Targets)
	})
	if err != nil {
		return dto.LiveDetail{}, dbErr(err, "live session")
	}
	s.audit.Log(ctx, actor, "update", "live", id, in)
	if !cur.StartsAt.Equal(sess.StartsAt) || sess.Status != cur.Status {
		title := "Live class rescheduled: " + sess.Title
		if sess.Status == "cancelled" {
			title = "Live class cancelled: " + sess.Title
		}
		s.notifyAudience(ctx, id, "live", title, "Open the live page for the latest details.", "/learn/live")
	}
	r, _ := s.Q.GetLiveSession(ctx, id)
	return s.detail(ctx, sess, str(r.HostName))
}

func (s *LiveService) Delete(ctx context.Context, actor *auth.Principal, id uuid.UUID) error {
	sess, _, err := s.load(ctx, actor, id)
	if err != nil {
		return err
	}
	if sess.GcalEventID != "" {
		if hc, _, done, err := s.orgGoogle(ctx); err == nil {
			if err := google.DeleteEvent(ctx, hc, sess.GcalEventID); err != nil {
				slog.Warn("delete calendar event", "err", err)
			}
			done()
		}
	}
	if err := s.Q.DeleteLiveSession(ctx, id); err != nil {
		return dbErr(err, "live session")
	}
	s.audit.Log(ctx, actor, "delete", "live", id, map[string]string{"title": sess.Title})
	return nil
}

func (s *LiveService) MarkAttendance(ctx context.Context, actor *auth.Principal, id uuid.UUID, in dto.LiveAttendanceInput) (dto.LiveDetail, error) {
	sess, host, err := s.load(ctx, actor, id)
	if err != nil {
		return dto.LiveDetail{}, err
	}
	err = s.tx(ctx, func(q *repository.Queries) error {
		for _, r := range in.Records {
			if err := q.UpsertLiveAttendance(ctx, repository.UpsertLiveAttendanceParams{SessionID: id, StudentID: r.StudentID, Present: r.Present, Source: "manual"}); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return dto.LiveDetail{}, dbErr(err, "attendance")
	}
	s.audit.Log(ctx, actor, "mark", "live_attendance", id, map[string]int{"records": len(in.Records)})
	return s.detail(ctx, sess, host)
}

func (s *LiveService) SetRecording(ctx context.Context, actor *auth.Principal, id uuid.UUID, in dto.RecordingInput) (dto.LiveDetail, error) {
	sess, host, err := s.load(ctx, actor, id)
	if err != nil {
		return dto.LiveDetail{}, err
	}
	link := strings.TrimSpace(in.RecordingURL)
	if link != "" {
		if err := validLink(link, false); err != nil {
			return dto.LiveDetail{}, apperr.Invalid("%s", err.Error())
		}
	}
	if err := s.Q.SetLiveRecording(ctx, repository.SetLiveRecordingParams{ID: id, RecordingUrl: link}); err != nil {
		return dto.LiveDetail{}, dbErr(err, "live session")
	}
	sess.RecordingUrl = link
	if link != "" {
		s.notifyAudience(ctx, id, "recording", "Recording available: "+sess.Title, "Watch the recording of the live class.", "/learn/live")
	}
	s.audit.Log(ctx, actor, "recording", "live", id, in)
	return s.detail(ctx, sess, host)
}

// Sync runs the requested Google steps and reports each one separately.
func (s *LiveService) Sync(ctx context.Context, actor *auth.Principal, id uuid.UUID, in dto.SyncInput) (dto.SyncResult, error) {
	sess, host, err := s.load(ctx, actor, id)
	if err != nil {
		return dto.SyncResult{}, err
	}
	st := s.settings.Get(ctx)
	res := dto.SyncResult{}
	hc, _, done, gerr := s.orgGoogle(ctx)
	if done != nil {
		defer done()
	}
	notConnected := func(step *dto.SyncStep) bool {
		if gerr != nil {
			*step = dto.SyncStep{Ran: true, OK: false, Message: gerr.Error()}
			return true
		}
		return false
	}
	audience, err := s.Q.LiveAudienceStudents(ctx, id)
	if err != nil {
		return dto.SyncResult{}, dbErr(err, "audience")
	}

	if in.Calendar {
		switch {
		case !st.Google.CalendarSync:
			res.Calendar = dto.SyncStep{Ran: true, Message: "Calendar sync is turned off in Settings → Google"}
		case notConnected(&res.Calendar):
		default:
			emails := make([]string, 0, len(audience)+2)
			for _, a := range audience {
				emails = append(emails, a.Email)
			}
			staff, _ := s.Q.LiveAudienceStaff(ctx, id)
			for _, m := range staff {
				emails = append(emails, m.Email)
			}
			eventID, err := google.UpsertEvent(ctx, hc, sess.GcalEventID, google.EventInput{Title: sess.Title, Description: sess.Description,
				MeetURL: sess.MeetUrl, Start: sess.StartsAt, End: sess.EndsAt, Attendees: emails})
			if err != nil {
				res.Calendar = dto.SyncStep{Ran: true, Message: "Google Calendar error: " + err.Error()}
			} else {
				_ = s.Q.SetLiveSynced(ctx, repository.SetLiveSyncedParams{ID: id, GcalEventID: eventID})
				sess.GcalEventID = eventID
				res.Calendar = dto.SyncStep{Ran: true, OK: true, Message: fmt.Sprintf("Calendar event saved, %d invites sent", len(emails))}
			}
		}
	}

	code := google.MeetingCode(sess.MeetUrl)
	if in.Attendance {
		switch {
		case !st.Google.WorkspaceEnabled:
			res.Attendance = dto.SyncStep{Ran: true, Message: "Turn on Google Workspace in Settings to sync Meet attendance"}
		case time.Now().Before(sess.StartsAt):
			res.Attendance = dto.SyncStep{Ran: true, Message: "The session has not started yet"}
		case notConnected(&res.Attendance):
		default:
			seconds, err := google.MeetAttendance(ctx, hc, code, sess.StartsAt.Add(-time.Hour), sess.EndsAt.Add(4*time.Hour))
			if err != nil {
				res.Attendance = dto.SyncStep{Ran: true, Message: "Meet attendance error: " + err.Error()}
				break
			}
			marked := 0
			for _, a := range audience {
				if secs, ok := seconds[strings.ToLower(a.Email)]; ok && secs > 0 {
					if err := s.Q.UpsertLiveAttendance(ctx, repository.UpsertLiveAttendanceParams{SessionID: id, StudentID: a.ID, Present: true, Source: "meet", DurationSeconds: int32(secs)}); err == nil {
						marked++
					}
				}
			}
			res.Attendance = dto.SyncStep{Ran: true, OK: true, Message: fmt.Sprintf("%d participants found, %d students marked present", len(seconds), marked)}
		}
	}

	if in.Recording {
		switch {
		case !st.Google.WorkspaceEnabled:
			res.Recording = dto.SyncStep{Ran: true, Message: "Turn on Google Workspace in Settings to fetch Meet recordings"}
		case notConnected(&res.Recording):
		default:
			link, err := google.MeetRecording(ctx, hc, code)
			switch {
			case err != nil:
				res.Recording = dto.SyncStep{Ran: true, Message: "Meet recording error: " + err.Error()}
			case link == "":
				res.Recording = dto.SyncStep{Ran: true, Message: "No recording found yet (Google can take a while after the call ends)"}
			default:
				_ = s.Q.SetLiveRecording(ctx, repository.SetLiveRecordingParams{ID: id, RecordingUrl: link})
				sess.RecordingUrl = link
				res.Recording = dto.SyncStep{Ran: true, OK: true, Message: "Recording attached"}
				s.notifyAudience(ctx, id, "recording", "Recording available: "+sess.Title, "Watch the recording of the live class.", "/learn/live")
			}
		}
	}
	_ = s.Q.SetLiveSynced(ctx, repository.SetLiveSyncedParams{ID: id, GcalEventID: sess.GcalEventID})
	s.audit.Log(ctx, actor, "sync", "live", id, res)
	det, err := s.detail(ctx, sess, host)
	if err != nil {
		return dto.SyncResult{}, err
	}
	res.Session = det.Session
	return res, nil
}

// ICS returns a calendar file. Students must be in the audience; staff need access.
func (s *LiveService) ICS(ctx context.Context, actor *auth.Principal, id uuid.UUID) (dto.File, error) {
	r, err := s.Q.GetLiveSession(ctx, id)
	if err != nil {
		return dto.File{}, dbErr(err, "live session")
	}
	if actor.IsStudent() {
		ok, err := s.Q.StudentCanSeeLive(ctx, repository.StudentCanSeeLiveParams{SessionID: id, StudentID: actor.ID})
		if err != nil || !ok {
			return dto.File{}, apperr.NotFound("live session")
		}
	} else if err := s.canManage(ctx, actor, rowToSession(r)); err != nil {
		return dto.File{}, err
	}
	brand := s.settings.Get(ctx).Branding.Name
	data := BuildICS(brand, ICSEvent{UID: liveUID(id), Title: r.Title, Description: strings.TrimSpace(r.Description + "\n\nJoin: " + r.MeetUrl),
		Location: r.MeetUrl, URL: r.MeetUrl, Start: r.StartsAt, End: r.EndsAt})
	return dto.File{Name: Slugify(r.Title) + ".ics", ContentType: "text/calendar; charset=utf-8", Data: data}, nil
}

// Mine lists sessions visible to a student. scope = "upcoming" or "past".
func (s *LiveService) Mine(ctx context.Context, student *auth.Principal, scope string) ([]dto.LiveSession, error) {
	now := time.Now()
	p := repository.MyLiveSessionsParams{StudentID: student.ID, Lim: 200}
	if scope == "past" {
		p.ToTime = &now
	} else {
		p.FromTime = &now
	}
	rows, err := s.Q.MyLiveSessions(ctx, p)
	if err != nil {
		return nil, dbErr(err, "live sessions")
	}
	out := make([]dto.LiveSession, 0, len(rows))
	for _, r := range rows {
		if scope == "past" && !r.EndsAt.Before(now) {
			continue // still running: it belongs to "upcoming"
		}
		sess := repository.LiveSession{ID: r.ID, Title: r.Title, Description: r.Description, MeetUrl: r.MeetUrl, StartsAt: r.StartsAt, EndsAt: r.EndsAt,
			HostID: r.HostID, RecordingUrl: r.RecordingUrl, GcalEventID: r.GcalEventID, Status: r.Status, LastSyncedAt: r.LastSyncedAt}
		d := toLive(sess, str(r.HostName), 0)
		d.Attended = r.Attended
		if scope == "past" {
			d.MeetURL = "" // past meetings: show the recording instead
		}
		out = append(out, d)
	}
	if scope == "past" { // newest first
		for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
			out[i], out[j] = out[j], out[i]
		}
	}
	return out, nil
}

// Join records attendance (source "join") and returns the meeting link.
func (s *LiveService) Join(ctx context.Context, student *auth.Principal, id uuid.UUID) (dto.JoinResult, error) {
	r, err := s.Q.GetLiveSession(ctx, id)
	if err != nil {
		return dto.JoinResult{}, dbErr(err, "live session")
	}
	ok, err := s.Q.StudentCanSeeLive(ctx, repository.StudentCanSeeLiveParams{SessionID: id, StudentID: student.ID})
	if err != nil || !ok {
		return dto.JoinResult{}, apperr.NotFound("live session")
	}
	if r.Status == "cancelled" {
		return dto.JoinResult{}, apperr.Invalid("this session was cancelled")
	}
	now := time.Now()
	if now.Before(r.StartsAt.Add(-30*time.Minute)) || now.After(r.EndsAt.Add(30*time.Minute)) {
		return dto.JoinResult{}, apperr.Invalid("you can join from 30 minutes before the start until the session ends")
	}
	_ = s.Q.UpsertLiveAttendance(ctx, repository.UpsertLiveAttendanceParams{SessionID: id, StudentID: student.ID, Present: true, Source: "join", JoinedAt: &now})
	return dto.JoinResult{MeetURL: r.MeetUrl}, nil
}

func (s *LiveService) notifyAudience(ctx context.Context, id uuid.UUID, kind, title, body, link string) {
	students, err := s.Q.LiveAudienceStudents(ctx, id)
	if err != nil {
		return
	}
	ids := make([]uuid.UUID, 0, len(students))
	for _, st := range students {
		ids = append(ids, st.ID)
	}
	s.notify.Send(ctx, ids, kind, title, body, link)
}

// SendDueReminders notifies audiences 24h and 15m before sessions start (run every minute).
func (s *LiveService) SendDueReminders(ctx context.Context) (int, error) {
	due, err := s.Q.DueLiveReminders(ctx)
	if err != nil {
		return 0, err
	}
	for _, sess := range due {
		soon := !sess.RemindedSoon && time.Until(sess.StartsAt) <= 15*time.Minute
		if soon {
			s.notifyAudience(ctx, sess.ID, "live_reminder", "Starting in 15 minutes: "+sess.Title, "Tap to open the live page and join.", "/learn/live")
			staff, _ := s.Q.LiveAudienceStaff(ctx, sess.ID)
			ids := make([]uuid.UUID, 0, len(staff))
			for _, m := range staff {
				ids = append(ids, m.ID)
			}
			s.notify.Send(ctx, ids, "live_reminder", "You host soon: "+sess.Title, "Starts in 15 minutes.", "/live/"+sess.ID.String())
		} else {
			s.notifyAudience(ctx, sess.ID, "live_reminder", "Tomorrow: "+sess.Title, "Live class within 24 hours. Add it to your calendar.", "/learn/live")
		}
		_ = s.Q.MarkLiveReminded(ctx, repository.MarkLiveRemindedParams{ID: sess.ID, Day: true, Soon: soon})
	}
	return len(due), nil
}
