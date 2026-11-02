package service

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/mail"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/lms/backend/internal/apperr"
	"github.com/lms/backend/internal/auth"
	"github.com/lms/backend/internal/dto"
	"github.com/lms/backend/internal/platform/realtime"
	"github.com/lms/backend/internal/repository"
)

// LeadService is the CRM: lead capture from every source (with de-duplication), the pipeline,
// notes, follow-ups, calls, assignment (see assignment.go) and CSV import/export.
type LeadService struct {
	base
	commissions *CommissionService
}

var nonDigits = regexp.MustCompile(`[^0-9]`)

// NormalizePhone returns digits in international format: 10-digit numbers get the country code,
// a leading 0 trunk prefix is dropped. Empty input stays empty.
func NormalizePhone(raw, countryCode string) string {
	d := nonDigits.ReplaceAllString(raw, "")
	d = strings.TrimLeft(d, "0")
	if len(d) == 10 && countryCode != "" {
		d = countryCode + d
	}
	if len(d) < 8 {
		return ""
	}
	return d
}

func cleanEmail(e string) (string, error) {
	e = strings.ToLower(strings.TrimSpace(e))
	if e == "" {
		return "", nil
	}
	if a, err := mail.ParseAddress(e); err != nil || a.Address != e || !strings.Contains(e[strings.Index(e, "@"):], ".") {
		return "", apperr.Invalid("%q is not a valid email", e)
	}
	return e, nil
}

func toLead(r repository.ListLeadsRow) dto.Lead {
	return dto.Lead{ID: r.ID, Name: r.Name, Email: r.Email, Phone: r.Phone, WhatsAppID: r.PhoneNorm, City: r.City, Source: r.Source,
		SourceRef: r.SourceRef, Message: r.Message, CourseID: r.CourseID, CourseTitle: str(r.CourseTitle), StageID: r.StageID,
		StageName: str(r.StageName), StageColor: str(r.StageColor), StageKind: str(r.StageKind), OwnerID: r.OwnerID, OwnerName: str(r.OwnerName),
		TeamID: r.TeamID, TeamName: str(r.TeamName), AssignedAt: r.AssignedAt, SLADueAt: r.SlaDueAt, FirstContactedAt: r.FirstContactedAt,
		LastActivityAt: r.LastActivityAt, NextFollowUpAt: r.NextFollowUpAt, LostReason: r.LostReason, StudentID: r.StudentID,
		AdmissionID: r.AdmissionID, CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt}
}

// get loads one lead the actor may see (nil actor = system, no scope).
func (s *LeadService) get(ctx context.Context, actor *auth.Principal, id uuid.UUID) (dto.Lead, error) {
	p := repository.ListLeadsParams{ID: &id, Lim: 1}
	if actor != nil {
		p.ScopeOwner, p.ScopeTeam = actor.SalesFilter()
	}
	rows, err := s.Q.ListLeads(ctx, p)
	if err != nil {
		return dto.Lead{}, dbErr(err, "lead")
	}
	if len(rows) == 0 {
		return dto.Lead{}, apperr.NotFound("lead")
	}
	return toLead(rows[0]), nil
}

// Get returns a lead with its timeline, follow-ups and WhatsApp chat.
func (s *LeadService) Get(ctx context.Context, actor *auth.Principal, id uuid.UUID) (dto.LeadDetail, error) {
	l, err := s.get(ctx, actor, id)
	if err != nil {
		return dto.LeadDetail{}, err
	}
	out := dto.LeadDetail{Lead: l, Activities: []dto.LeadActivity{}, FollowUps: []dto.FollowUp{}}
	acts, err := s.Q.ListLeadActivities(ctx, id)
	if err != nil {
		return out, dbErr(err, "lead")
	}
	for _, a := range acts {
		var data any = map[string]any{}
		if len(a.Data) > 0 {
			_ = json.Unmarshal(a.Data, &data)
		}
		out.Activities = append(out.Activities, dto.LeadActivity{ID: a.ID, Kind: a.Kind, Body: a.Body, Data: data, ActorID: a.ActorID,
			ActorName: str(a.ActorName), CreatedAt: a.CreatedAt})
	}
	fus, err := s.Q.ListLeadFollowUps(ctx, id)
	if err != nil {
		return out, dbErr(err, "lead")
	}
	now := time.Now()
	for _, f := range fus {
		out.FollowUps = append(out.FollowUps, dto.FollowUp{ID: f.ID, LeadID: f.LeadID, LeadName: l.Name, LeadPhone: l.Phone, StageName: l.StageName,
			OwnerID: f.OwnerID, DueAt: f.DueAt, Note: f.Note, DoneAt: f.DoneAt, Overdue: f.DoneAt == nil && f.DueAt.Before(now), CreatedAt: f.CreatedAt})
	}
	if c, err := s.Q.GetWAContactByLead(ctx, &id); err == nil {
		wc := waContactFromModel(c)
		out.WhatsApp = &wc
	}
	return out, nil
}

func (s *LeadService) List(ctx context.Context, actor *auth.Principal, f dto.LeadFilter) (dto.LeadList, error) {
	loc := s.settings.Location(ctx)
	p := repository.ListLeadsParams{StageID: f.StageID, StageKind: optStr(f.StageKind), OwnerID: f.OwnerID, Unassigned: f.Unassigned,
		Source: optStr(f.Source), CourseID: f.CourseID, TeamID: f.TeamID, CreatedFrom: f.From, CreatedTo: f.To, Q: optStr(f.Q),
		Sort: orDefault(f.Sort, "created"), Lim: f.Lim(), Off: f.Off()}
	if f.Mine {
		p.OwnerID = &actor.ID
	}
	switch f.FollowUp {
	case "today":
		end := endOfDay(time.Now().In(loc))
		p.FollowUpBefore = &end
		p.Sort = "follow_up"
	case "overdue":
		now := time.Now()
		p.FollowUpBefore = &now
		p.Sort = "follow_up"
	}
	p.ScopeOwner, p.ScopeTeam = actor.SalesFilter()
	rows, err := s.Q.ListLeads(ctx, p)
	if err != nil {
		return dto.LeadList{}, dbErr(err, "leads")
	}
	items := make([]dto.Lead, 0, len(rows))
	var total int64
	for _, r := range rows {
		total = r.TotalCount
		items = append(items, toLead(r))
	}
	counts, err := s.Q.LeadStageCounts(ctx, repository.LeadStageCountsParams{ScopeOwner: p.ScopeOwner, ScopeTeam: p.ScopeTeam})
	if err != nil {
		return dto.LeadList{}, dbErr(err, "leads")
	}
	sc := map[string]int32{}
	for _, c := range counts {
		if c.StageID != nil {
			sc[c.StageID.String()] = c.Total
		}
	}
	return dto.LeadList{List: dto.NewList(items, total, f.PageQuery), StageCounts: sc}, nil
}

func endOfDay(t time.Time) time.Time {
	y, m, d := t.Date()
	return time.Date(y, m, d+1, 0, 0, 0, 0, t.Location())
}

func (s *LeadService) Sources(ctx context.Context) ([]string, error) {
	out, err := s.Q.LeadSources(ctx)
	if err != nil {
		return nil, dbErr(err, "leads")
	}
	for _, d := range []string{"website", "whatsapp", "meta_ads", "manual", "import", "walk_in", "referral"} {
		found := false
		for _, x := range out {
			found = found || x == d
		}
		if !found {
			out = append(out, d)
		}
	}
	return out, nil
}

// activity records a timeline entry (errors are ignored: the timeline must never block work).
func (b base) activity(ctx context.Context, q *repository.Queries, leadID uuid.UUID, actor *auth.Principal, kind, body string, data any) {
	raw := []byte("{}")
	if data != nil {
		raw, _ = json.Marshal(data)
	}
	var actorID *uuid.UUID
	if actor != nil {
		actorID = &actor.ID
	}
	_, _ = q.AddLeadActivity(ctx, repository.AddLeadActivityParams{LeadID: leadID, ActorID: actorID, Kind: kind, Body: body, Data: raw})
}

// LeadCapture is a lead arriving from any source.
type LeadCapture struct {
	Name, Email, Phone, City, Source, SourceRef, Message string
	CourseID                                           *uuid.UUID
	OwnerID                                            *uuid.UUID // assign directly (skips the rules)
	NoAssign                                           bool
}

// Capture stores a lead. When the phone or email already exists the existing lead gets the new
// enquiry on its timeline (and is reopened if it was lost) instead of a duplicate.
func (s *LeadService) Capture(ctx context.Context, actor *auth.Principal, in LeadCapture) (dto.LeadCreated, error) {
	st := s.settings.Sales(ctx)
	email, err := cleanEmail(in.Email)
	if err != nil {
		return dto.LeadCreated{}, err
	}
	phone := strings.TrimSpace(in.Phone)
	norm := NormalizePhone(phone, st.CRM.CountryCode)
	if norm == "" && email == "" {
		return dto.LeadCreated{}, apperr.Invalid("add a phone number or an email")
	}
	if phone == "" && norm != "" {
		phone = "+" + norm
	}
	name := strings.TrimSpace(in.Name)
	if name == "" {
		name = orDefault(phone, email)
	}
	source := strings.ToLower(orDefault(strings.TrimSpace(in.Source), "manual"))
	if in.CourseID != nil {
		if _, err := s.Q.GetCourse(ctx, *in.CourseID); err != nil {
			in.CourseID = nil
		}
	}
	if in.OwnerID != nil {
		if err := s.checkAssignee(ctx, *in.OwnerID); err != nil {
			return dto.LeadCreated{}, err
		}
	}

	dup, err := s.Q.FindDuplicateLead(ctx, repository.FindDuplicateLeadParams{PhoneNorm: norm, Email: email})
	if err == nil {
		return s.mergeEnquiry(ctx, actor, dup, in, name, email, phone, norm, source)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return dto.LeadCreated{}, dbErr(err, "lead")
	}

	stage, err := s.Q.DefaultStage(ctx)
	if err != nil {
		return dto.LeadCreated{}, apperr.Invalid("add at least one open pipeline stage first")
	}
	l, err := s.Q.CreateLead(ctx, repository.CreateLeadParams{Name: name, Email: email, Phone: phone, PhoneNorm: norm, CourseID: in.CourseID,
		Message: strings.TrimSpace(in.Message), Source: source, SourceRef: in.SourceRef, City: strings.TrimSpace(in.City), StageID: &stage.ID})
	if err != nil {
		return dto.LeadCreated{}, dbErr(err, "lead")
	}
	s.activity(ctx, s.Q, l.ID, actor, "created", "Lead added from "+sourceLabel(source), map[string]any{"source": source, "message": l.Message})
	s.audit.Log(ctx, actor, "create", "lead", l.ID, map[string]string{"source": source})
	switch {
	case in.OwnerID != nil:
		_, err = s.assignTo(ctx, actor, l, in.OwnerID, false)
	case !in.NoAssign:
		_, err = s.autoAssign(ctx, l, nil, false)
	}
	if err != nil {
		return dto.LeadCreated{}, err
	}
	out, err := s.get(ctx, nil, l.ID)
	return dto.LeadCreated{Lead: out}, err
}

func sourceLabel(src string) string {
	switch src {
	case "whatsapp":
		return "WhatsApp"
	case "meta_ads":
		return "Meta lead ads"
	case "website":
		return "the website"
	case "import":
		return "CSV import"
	case "manual":
		return "manual entry"
	}
	return src
}

func (s *LeadService) mergeEnquiry(ctx context.Context, actor *auth.Principal, l repository.Lead, in LeadCapture, name, email, phone, norm, source string) (dto.LeadCreated, error) {
	// fill gaps only: never overwrite what the counsellor already knows
	upd := repository.UpdateLeadFieldsParams{ID: l.ID, Name: l.Name, Email: l.Email, Phone: l.Phone, PhoneNorm: l.PhoneNorm, CourseID: l.CourseID,
		City: l.City, Source: l.Source, Message: l.Message}
	if upd.Email == "" {
		upd.Email = email
	}
	if upd.PhoneNorm == "" {
		upd.Phone, upd.PhoneNorm = phone, norm
	}
	if upd.CourseID == nil {
		upd.CourseID = in.CourseID
	}
	if upd.City == "" {
		upd.City = strings.TrimSpace(in.City)
	}
	if (upd.Name == "" || upd.Name == upd.Phone || upd.Name == upd.Email) && name != "" {
		upd.Name = name
	}
	l2, err := s.Q.UpdateLeadFields(ctx, upd)
	if err != nil {
		return dto.LeadCreated{}, dbErr(err, "lead")
	}
	body := "Enquired again via " + sourceLabel(source)
	if m := strings.TrimSpace(in.Message); m != "" {
		body += ": " + m
	}
	s.activity(ctx, s.Q, l.ID, actor, "enquiry", body, map[string]any{"source": source})
	_ = s.Q.TouchLead(ctx, l.ID)

	if l.StageID != nil { // a lost lead that comes back is reopened
		if stg, err := s.Q.GetStage(ctx, *l.StageID); err == nil && stg.Kind == "lost" {
			if def, err := s.Q.DefaultStage(ctx); err == nil {
				if _, err := s.Q.SetLeadStage(ctx, repository.SetLeadStageParams{ID: l.ID, StageID: &def.ID, LostReason: ""}); err == nil {
					s.activity(ctx, s.Q, l.ID, nil, "stage", fmt.Sprintf("Reopened: %s → %s (new enquiry)", stg.Name, def.Name), nil)
				}
			}
		}
	}
	switch {
	case l2.OwnerID != nil:
		s.notify.Send(ctx, []uuid.UUID{*l2.OwnerID}, "lead_returned", l2.Name+" enquired again", body, "/crm/leads/"+l.ID.String())
	case in.OwnerID != nil:
		if _, err := s.assignTo(ctx, actor, l2, in.OwnerID, false); err != nil {
			return dto.LeadCreated{}, err
		}
	case !in.NoAssign:
		if _, err := s.autoAssign(ctx, l2, nil, false); err != nil {
			return dto.LeadCreated{}, err
		}
	}
	out, err := s.get(ctx, nil, l.ID)
	return dto.LeadCreated{Lead: out, Duplicate: true}, err
}

// Create is a lead added by staff (admin site or phone app).
func (s *LeadService) Create(ctx context.Context, actor *auth.Principal, in dto.LeadCreate) (dto.LeadCreated, error) {
	owner := in.OwnerID
	if in.AssignToMe {
		owner = &actor.ID
	}
	if owner != nil && *owner != actor.ID && !actor.SeesAllSales() {
		if _, team := actor.SalesFilter(); team == nil {
			return dto.LeadCreated{}, apperr.Forbidden("you can only assign leads to yourself")
		}
	}
	return s.Capture(ctx, actor, LeadCapture{Name: in.Name, Email: in.Email, Phone: in.Phone, City: in.City, Source: in.Source,
		CourseID: in.CourseID, Message: in.Message, OwnerID: owner})
}

func (s *LeadService) Update(ctx context.Context, actor *auth.Principal, id uuid.UUID, in dto.LeadUpdate) (dto.Lead, error) {
	cur, err := s.get(ctx, actor, id)
	if err != nil {
		return dto.Lead{}, err
	}
	email, err := cleanEmail(in.Email)
	if err != nil {
		return dto.Lead{}, err
	}
	phone := strings.TrimSpace(in.Phone)
	norm := NormalizePhone(phone, s.settings.Sales(ctx).CRM.CountryCode)
	if norm == "" && email == "" {
		return dto.Lead{}, apperr.Invalid("keep a phone number or an email")
	}
	if _, err := s.Q.UpdateLeadFields(ctx, repository.UpdateLeadFieldsParams{ID: id, Name: strings.TrimSpace(in.Name), Email: email, Phone: phone,
		PhoneNorm: norm, CourseID: in.CourseID, City: strings.TrimSpace(in.City), Source: orDefault(strings.ToLower(strings.TrimSpace(in.Source)), cur.Source),
		Message: strings.TrimSpace(in.Message)}); err != nil {
		return dto.Lead{}, dbErr(err, "lead")
	}
	s.audit.Log(ctx, actor, "update", "lead", id, in)
	return s.get(ctx, actor, id)
}

func (s *LeadService) Delete(ctx context.Context, actor *auth.Principal, id uuid.UUID) error {
	if _, err := s.get(ctx, actor, id); err != nil {
		return err
	}
	if err := s.Q.DeleteLead(ctx, id); err != nil {
		return dbErr(err, "lead")
	}
	s.audit.Log(ctx, actor, "delete", "lead", id, nil)
	return nil
}

// SetStage moves a lead in the pipeline. Lost needs a reason.
func (s *LeadService) SetStage(ctx context.Context, actor *auth.Principal, id uuid.UUID, in dto.LeadStageInput) (dto.Lead, error) {
	cur, err := s.get(ctx, actor, id)
	if err != nil {
		return dto.Lead{}, err
	}
	stg, err := s.Q.GetStage(ctx, in.StageID)
	if err != nil {
		return dto.Lead{}, apperr.Invalid("unknown stage")
	}
	reason := strings.TrimSpace(in.LostReason)
	if stg.Kind == "lost" && reason == "" {
		return dto.Lead{}, apperr.Invalid("choose why the lead was lost")
	}
	if stg.Kind != "lost" {
		reason = ""
	}
	def, _ := s.Q.DefaultStage(ctx)
	if _, err := s.Q.SetLeadStage(ctx, repository.SetLeadStageParams{ID: id, StageID: &stg.ID, LostReason: reason, Contacted: stg.ID != def.ID}); err != nil {
		return dto.Lead{}, dbErr(err, "lead")
	}
	body := fmt.Sprintf("%s → %s", orDefault(cur.StageName, "—"), stg.Name)
	if reason != "" {
		body += " · " + reason
	}
	if n := strings.TrimSpace(in.Note); n != "" {
		body += "\n" + n
	}
	s.activity(ctx, s.Q, id, actor, "stage", body, map[string]any{"from": cur.StageID, "to": stg.ID})
	return s.get(ctx, actor, id)
}

func (s *LeadService) AddNote(ctx context.Context, actor *auth.Principal, id uuid.UUID, in dto.NoteInput) (dto.Lead, error) {
	if _, err := s.get(ctx, actor, id); err != nil {
		return dto.Lead{}, err
	}
	s.activity(ctx, s.Q, id, actor, "note", strings.TrimSpace(in.Body), nil)
	_ = s.Q.TouchLead(ctx, id)
	return s.get(ctx, actor, id)
}

// LogCall records a call made from the phone app (or by hand) and counts as first contact.
func (s *LeadService) LogCall(ctx context.Context, actor *auth.Principal, id uuid.UUID, in dto.CallInput) (dto.Lead, error) {
	l, err := s.get(ctx, actor, id)
	if err != nil {
		return dto.Lead{}, err
	}
	started := time.Now()
	if in.StartedAt != nil {
		started = *in.StartedAt
	}
	dir := orDefault(in.Direction, "outgoing")
	if _, err := s.Q.CreateCallLog(ctx, repository.CreateCallLogParams{LeadID: id, UserID: &actor.ID, Phone: orDefault(in.Phone, l.Phone),
		Direction: dir, StartedAt: started, DurationSeconds: in.DurationSeconds}); err != nil {
		return dto.Lead{}, dbErr(err, "call")
	}
	body := map[string]string{"outgoing": "Outgoing call", "incoming": "Incoming call", "missed": "Missed call"}[dir]
	if in.DurationSeconds > 0 {
		body += fmt.Sprintf(" · %dm %02ds", in.DurationSeconds/60, in.DurationSeconds%60)
	} else if dir == "outgoing" {
		body += " · not answered"
	}
	if n := strings.TrimSpace(in.Note); n != "" {
		body += "\n" + n
	}
	s.activity(ctx, s.Q, id, actor, "call", body, map[string]any{"direction": dir, "seconds": in.DurationSeconds})
	if dir != "missed" {
		_ = s.Q.MarkLeadContacted(ctx, id)
	} else {
		_ = s.Q.TouchLead(ctx, id)
	}
	return s.get(ctx, actor, id)
}

// ── follow-ups ──

func (s *LeadService) AddFollowUp(ctx context.Context, actor *auth.Principal, id uuid.UUID, in dto.FollowUpInput) (dto.Lead, error) {
	l, err := s.get(ctx, actor, id)
	if err != nil {
		return dto.Lead{}, err
	}
	if in.DueAt.Before(time.Now().Add(-time.Hour)) {
		return dto.Lead{}, apperr.Invalid("pick a follow-up time in the future")
	}
	owner := l.OwnerID
	if owner == nil {
		owner = &actor.ID
	}
	if _, err := s.Q.CreateFollowUp(ctx, repository.CreateFollowUpParams{LeadID: id, OwnerID: owner, DueAt: in.DueAt, Note: strings.TrimSpace(in.Note),
		CreatedBy: &actor.ID}); err != nil {
		return dto.Lead{}, dbErr(err, "follow-up")
	}
	_ = s.Q.RefreshLeadFollowUp(ctx, id)
	loc := s.settings.Location(ctx)
	body := "Follow-up on " + in.DueAt.In(loc).Format("Mon 2 Jan, 3:04 PM")
	if n := strings.TrimSpace(in.Note); n != "" {
		body += ": " + n
	}
	s.activity(ctx, s.Q, id, actor, "follow_up", body, map[string]any{"due_at": in.DueAt})
	return s.get(ctx, actor, id)
}

func (s *LeadService) CompleteFollowUp(ctx context.Context, actor *auth.Principal, id uuid.UUID) error {
	f, err := s.Q.GetFollowUp(ctx, id)
	if err != nil {
		return apperr.NotFound("follow-up")
	}
	if _, err := s.get(ctx, actor, f.LeadID); err != nil {
		return err
	}
	if _, err := s.Q.CompleteFollowUp(ctx, id); err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return dbErr(err, "follow-up")
	}
	_ = s.Q.RefreshLeadFollowUp(ctx, f.LeadID)
	s.activity(ctx, s.Q, f.LeadID, actor, "follow_up", "Follow-up done"+map[bool]string{true: ": " + f.Note, false: ""}[f.Note != ""], nil)
	_ = s.Q.TouchLead(ctx, f.LeadID)
	return nil
}

func (s *LeadService) DeleteFollowUp(ctx context.Context, actor *auth.Principal, id uuid.UUID) error {
	f, err := s.Q.GetFollowUp(ctx, id)
	if err != nil {
		return apperr.NotFound("follow-up")
	}
	if _, err := s.get(ctx, actor, f.LeadID); err != nil {
		return err
	}
	if err := s.Q.DeleteFollowUp(ctx, id); err != nil {
		return dbErr(err, "follow-up")
	}
	_ = s.Q.RefreshLeadFollowUp(ctx, f.LeadID)
	return nil
}

// FollowUps lists open follow-ups due before the window ends ("today", "overdue" or "week").
// Counsellors only see their own; others may pass an owner.
func (s *LeadService) FollowUps(ctx context.Context, actor *auth.Principal, owner *uuid.UUID, window string) ([]dto.FollowUp, error) {
	now := time.Now()
	before := endOfDay(now.In(s.settings.Location(ctx)))
	switch window {
	case "overdue":
		before = now
	case "week":
		before = before.AddDate(0, 0, 7)
	}
	if o, _ := actor.SalesFilter(); o != nil {
		owner = o
	}
	rows, err := s.Q.ListFollowUpsDue(ctx, repository.ListFollowUpsDueParams{Before: before, OwnerID: owner})
	if err != nil {
		return nil, dbErr(err, "follow-ups")
	}
	out := make([]dto.FollowUp, 0, len(rows))
	for _, f := range rows {
		out = append(out, dto.FollowUp{ID: f.ID, LeadID: f.LeadID, LeadName: f.LeadName, LeadPhone: f.LeadPhone, StageName: f.StageName,
			OwnerID: f.OwnerID, DueAt: f.DueAt, Note: f.Note, DoneAt: f.DoneAt, Overdue: f.DueAt.Before(now), CreatedAt: f.CreatedAt})
	}
	return out, nil
}

// SendFollowUpReminders notifies counsellors shortly before a follow-up is due (scheduler, every minute).
func (s *LeadService) SendFollowUpReminders(ctx context.Context) (int, error) {
	lead := time.Duration(s.settings.Sales(ctx).Reminders.FollowUpLeadMinutes) * time.Minute
	rows, err := s.Q.FollowUpsToRemind(ctx, time.Now().Add(lead))
	if err != nil || len(rows) == 0 {
		return 0, err
	}
	loc := s.settings.Location(ctx)
	ids := make([]uuid.UUID, 0, len(rows))
	for _, f := range rows {
		ids = append(ids, f.ID)
		body := "Due " + f.DueAt.In(loc).Format("3:04 PM")
		if f.Note != "" {
			body += " · " + f.Note
		}
		s.notify.Send(ctx, []uuid.UUID{*f.OwnerID}, "follow_up", "Follow up: "+f.LeadName, body, "/crm/leads/"+f.LeadID.String())
	}
	return len(rows), s.Q.MarkFollowUpsReminded(ctx, ids)
}

// ── CSV ──

func (s *LeadService) Export(ctx context.Context, actor *auth.Principal) (dto.File, error) {
	o, t := actor.SalesFilter()
	rows, err := s.Q.ListLeadsForExport(ctx, repository.ListLeadsForExportParams{ScopeOwner: o, ScopeTeam: t})
	if err != nil {
		return dto.File{}, dbErr(err, "leads")
	}
	loc := s.settings.Location(ctx)
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	_ = w.Write([]string{"created", "name", "phone", "email", "city", "source", "course", "stage", "owner", "next_follow_up", "lost_reason"})
	for _, r := range rows {
		fu := ""
		if r.NextFollowUpAt != nil {
			fu = r.NextFollowUpAt.In(loc).Format("2006-01-02 15:04")
		}
		_ = w.Write([]string{r.CreatedAt.In(loc).Format("2006-01-02 15:04"), safeCSV(r.Name), safeCSV(r.Phone), safeCSV(r.Email), safeCSV(r.City),
			safeCSV(r.Source), safeCSV(r.CourseTitle), safeCSV(r.StageName), safeCSV(r.OwnerName), fu, safeCSV(r.LostReason)})
	}
	w.Flush()
	s.audit.Log(ctx, actor, "export", "lead", "", map[string]int{"rows": len(rows)})
	return dto.File{Name: fmt.Sprintf("leads-%s.csv", time.Now().In(loc).Format("2006-01-02")), ContentType: "text/csv; charset=utf-8", Data: buf.Bytes()}, nil
}

// Import adds leads from CSV (header: name,phone,email,city,source,course,message). Rows that
// match an existing lead are merged, like any other duplicate enquiry.
func (s *LeadService) Import(ctx context.Context, actor *auth.Principal, in dto.LeadImportInput) (dto.ImportResult, error) {
	r := csv.NewReader(strings.NewReader(strings.TrimPrefix(in.CSV, "\uFEFF")))
	r.FieldsPerRecord = -1
	r.TrimLeadingSpace = true
	head, err := r.Read()
	if err != nil {
		return dto.ImportResult{}, apperr.Invalid("the CSV is empty")
	}
	col := map[string]int{}
	for i, h := range head {
		col[strings.ToLower(strings.TrimSpace(h))] = i
	}
	if _, ok := col["phone"]; !ok {
		if _, ok := col["email"]; !ok {
			return dto.ImportResult{}, apperr.Invalid("the CSV needs a phone or email column")
		}
	}
	courses, _ := s.Q.CourseOptions(ctx, nil)
	courseByName := map[string]uuid.UUID{}
	for _, c := range courses {
		courseByName[strings.ToLower(c.Title)] = c.ID
		courseByName[strings.ToLower(c.Slug)] = c.ID
	}
	if in.OwnerID != nil {
		if err := s.checkAssignee(ctx, *in.OwnerID); err != nil {
			return dto.ImportResult{}, err
		}
	}
	res := dto.ImportResult{Errors: []string{}}
	line := 1
	for {
		rec, err := r.Read()
		if err == io.EOF {
			break
		}
		line++
		if err != nil {
			res.Errors = append(res.Errors, fmt.Sprintf("line %d: %v", line, err))
			continue
		}
		get := func(k string) string {
			if i, ok := col[k]; ok && i < len(rec) {
				return strings.TrimSpace(rec[i])
			}
			return ""
		}
		var course *uuid.UUID
		if id, ok := courseByName[strings.ToLower(get("course"))]; ok {
			course = &id
		}
		out, err := s.Capture(ctx, actor, LeadCapture{Name: get("name"), Phone: get("phone"), Email: get("email"), City: get("city"),
			Source: orDefault(get("source"), "import"), Message: get("message"), CourseID: course, OwnerID: in.OwnerID})
		switch {
		case err != nil:
			res.Errors = append(res.Errors, fmt.Sprintf("line %d: %s", line, fail(err)))
		case out.Duplicate:
			res.Skipped++
		default:
			res.Created++
		}
		if len(res.Errors) > 200 {
			res.Errors = append(res.Errors, "too many errors, stopped")
			break
		}
	}
	s.audit.Log(ctx, actor, "import", "lead", "", res)
	return res, nil
}

// fail returns a readable message for row errors.
func fail(err error) string {
	var ae *apperr.Error
	if errors.As(err, &ae) {
		return ae.Message
	}
	return "could not save"
}

// publishLead tells a user's open apps (phone app sound, admin list) that a lead changed.
func (b base) publishLead(ctx context.Context, userID uuid.UUID, kind string, leadID uuid.UUID, name string) {
	if b.Hub == nil {
		return
	}
	b.Hub.Publish(ctx, userID, realtime.Event{Type: kind, Data: map[string]any{"lead_id": leadID, "name": name}})
}
