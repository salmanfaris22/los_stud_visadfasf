package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/lms/backend/internal/apperr"
	"github.com/lms/backend/internal/auth"
	"github.com/lms/backend/internal/dto"
	"github.com/lms/backend/internal/repository"
)

var strategyLabel = map[string]string{"round_robin": "round-robin", "least_busy": "least busy", "fifo": "queue", "manual": "manual"}

// autoAssign applies the first matching assignment rule. Round-robin and least-busy give the
// lead to an eligible counsellor now; FIFO and manual rules (or nobody available) leave it in
// the queue. exclude skips the current owner when the SLA reassigns. With onlyIfFound the lead
// is left untouched when no counsellor is free (used by the retry job).
func (s *LeadService) autoAssign(ctx context.Context, l repository.Lead, exclude *uuid.UUID, onlyIfFound bool) (repository.Lead, error) {
	st := s.settings.Sales(ctx)
	strategy, team := "round_robin", (*uuid.UUID)(nil)
	rule, err := s.Q.MatchAssignmentRule(ctx, repository.MatchAssignmentRuleParams{Source: l.Source, CourseID: l.CourseID})
	switch {
	case err == nil:
		strategy, team = rule.Strategy, rule.TeamID
	case !errors.Is(err, pgx.ErrNoRows):
		return l, dbErr(err, "assignment rule")
	}
	if onlyIfFound && strategy != "round_robin" && strategy != "least_busy" {
		return l, nil
	}
	var inc int32
	if exclude != nil {
		inc = 1
	}
	var out repository.Lead
	var owner *uuid.UUID
	err = s.tx(ctx, func(q *repository.Queries) error {
		if strategy == "round_robin" || strategy == "least_busy" {
			id, err := q.PickCounsellor(ctx, repository.PickCounsellorParams{RequireAvailable: st.CRM.RequireAvailable, TeamID: team,
				ExcludeID: exclude, LeastBusy: strategy == "least_busy"})
			switch {
			case err == nil:
				owner = &id
				if err := q.TouchAssigned(ctx, id); err != nil {
					return err
				}
			case !errors.Is(err, pgx.ErrNoRows):
				return err
			}
		}
		if owner == nil && onlyIfFound {
			out = l
			return nil
		}
		var sla *time.Time
		if owner != nil && st.CRM.SLAMinutes > 0 {
			t := time.Now().Add(time.Duration(st.CRM.SLAMinutes) * time.Minute)
			sla = &t
		}
		var err error
		if out, err = q.AssignLead(ctx, repository.AssignLeadParams{ID: l.ID, OwnerID: owner, TeamID: team, SlaDueAt: sla,
			Pullable: strategy != "manual", ReassignInc: inc}); err != nil {
			return err
		}
		return q.MoveFollowUpsToOwner(ctx, repository.MoveFollowUpsToOwnerParams{LeadID: l.ID, OwnerID: owner})
	})
	if err != nil {
		return l, dbErr(err, "assignment")
	}
	if owner == nil && onlyIfFound {
		return out, nil
	}

	switch {
	case owner != nil:
		name := s.userName(ctx, *owner)
		body := fmt.Sprintf("Assigned to %s (%s)", name, strategyLabel[strategy])
		if exclude != nil {
			body = fmt.Sprintf("Reassigned to %s: not contacted within %d min", name, st.CRM.SLAMinutes)
		}
		s.activity(ctx, s.Q, l.ID, nil, "assigned", body, map[string]any{"to": owner, "strategy": strategy})
		s.notifyAssigned(ctx, *owner, out)
	case strategy == "manual":
		s.activity(ctx, s.Q, l.ID, nil, "assigned", "Waiting for a manager to assign it", nil)
	case strategy == "fifo":
		s.activity(ctx, s.Q, l.ID, nil, "assigned", "In the queue: the next counsellor to tap “Get next lead” takes it", nil)
	default:
		s.activity(ctx, s.Q, l.ID, nil, "assigned", "In the queue: no counsellor was available", nil)
	}
	if exclude != nil && (owner == nil || *owner != *exclude) {
		s.notify.Send(ctx, []uuid.UUID{*exclude}, "lead_reassigned", "Lead reassigned: "+l.Name,
			fmt.Sprintf("It was not contacted within %d minutes.", st.CRM.SLAMinutes), "/crm/leads")
	}
	return out, nil
}

func (s *LeadService) notifyAssigned(ctx context.Context, owner uuid.UUID, l repository.Lead) {
	body := sourceLabel(l.Source)
	if l.Phone != "" {
		body += " · " + l.Phone
	}
	s.notify.Send(ctx, []uuid.UUID{owner}, "lead_assigned", "New lead: "+l.Name, body, "/crm/leads/"+l.ID.String())
}

func (b base) userName(ctx context.Context, id uuid.UUID) string {
	if u, err := b.Q.GetUserByID(ctx, id); err == nil {
		return u.Name
	}
	return "someone"
}

// checkAssignee makes sure leads only go to active staff.
func (s *LeadService) checkAssignee(ctx context.Context, id uuid.UUID) error {
	u, err := s.Q.GetUserByID(ctx, id)
	if err != nil || u.Kind != auth.KindStaff || u.Status != "active" {
		return apperr.Invalid("leads can only be assigned to active staff")
	}
	return nil
}

// assignTo gives the lead to a person (nil = back to the queue) on behalf of actor.
func (s *LeadService) assignTo(ctx context.Context, actor *auth.Principal, l repository.Lead, owner *uuid.UUID, _ bool) (repository.Lead, error) {
	var team *uuid.UUID
	var sla *time.Time
	if owner != nil {
		if err := s.checkAssignee(ctx, *owner); err != nil {
			return l, err
		}
		if p, err := s.Q.GetCounsellorProfile(ctx, *owner); err == nil {
			team = p.TeamID
		}
		if m := s.settings.Sales(ctx).CRM.SLAMinutes; m > 0 && l.FirstContactedAt == nil {
			t := time.Now().Add(time.Duration(m) * time.Minute)
			sla = &t
		}
	} else {
		team = l.TeamID
	}
	var out repository.Lead
	err := s.tx(ctx, func(q *repository.Queries) error {
		var err error
		if out, err = q.AssignLead(ctx, repository.AssignLeadParams{ID: l.ID, OwnerID: owner, TeamID: team, SlaDueAt: sla, Pullable: true}); err != nil {
			return err
		}
		return q.MoveFollowUpsToOwner(ctx, repository.MoveFollowUpsToOwnerParams{LeadID: l.ID, OwnerID: owner})
	})
	if err != nil {
		return l, dbErr(err, "assignment")
	}
	by := ""
	if actor != nil {
		by = " by " + actor.Name
	}
	if owner == nil {
		s.activity(ctx, s.Q, l.ID, actor, "assigned", "Moved to the queue"+by, nil)
		return out, nil
	}
	s.activity(ctx, s.Q, l.ID, actor, "assigned", "Assigned to "+s.userName(ctx, *owner)+by, map[string]any{"to": owner})
	if actor == nil || *owner != actor.ID {
		s.notifyAssigned(ctx, *owner, out)
	}
	return out, nil
}

// canAssign checks who may hand a lead to whom: counsellors cannot reassign, team managers
// only within their team, everyone else freely.
func (s *LeadService) canAssign(ctx context.Context, actor *auth.Principal, owner *uuid.UUID) error {
	o, team := actor.SalesFilter()
	switch {
	case o == nil && team == nil:
		return nil
	case team == nil:
		return apperr.Forbidden("ask your manager to reassign leads")
	case owner == nil:
		return nil
	}
	p, err := s.Q.GetCounsellorProfile(ctx, *owner)
	if err != nil || p.TeamID == nil || *p.TeamID != *team {
		return apperr.Forbidden("you can only assign leads to your own team")
	}
	return nil
}

func (s *LeadService) Assign(ctx context.Context, actor *auth.Principal, id uuid.UUID, in dto.AssignInput) (dto.Lead, error) {
	if err := s.canAssign(ctx, actor, in.OwnerID); err != nil {
		return dto.Lead{}, err
	}
	if _, err := s.get(ctx, actor, id); err != nil {
		return dto.Lead{}, err
	}
	l, err := s.Q.GetLead(ctx, id)
	if err != nil {
		return dto.Lead{}, dbErr(err, "lead")
	}
	if _, err := s.assignTo(ctx, actor, l, in.OwnerID, false); err != nil {
		return dto.Lead{}, err
	}
	s.audit.Log(ctx, actor, "assign", "lead", id, in)
	return s.get(ctx, actor, id)
}

func (s *LeadService) BulkAssign(ctx context.Context, actor *auth.Principal, in dto.BulkAssignInput) (dto.OK, error) {
	n := 0
	for _, id := range in.IDs {
		if _, err := s.Assign(ctx, actor, id, dto.AssignInput{OwnerID: in.OwnerID}); err != nil {
			if n == 0 {
				return dto.OK{}, err
			}
			break
		}
		n++
	}
	return dto.OK{OK: true, Message: fmt.Sprintf("%d leads assigned", n)}, nil
}

// TakeNext gives the counsellor the oldest waiting lead (FIFO). SKIP LOCKED means two people
// tapping at once never get the same lead.
func (s *LeadService) TakeNext(ctx context.Context, actor *auth.Principal) (dto.Lead, error) {
	var sla *time.Time
	if m := s.settings.Sales(ctx).CRM.SLAMinutes; m > 0 {
		t := time.Now().Add(time.Duration(m) * time.Minute)
		sla = &t
	}
	l, err := s.Q.TakeNextLead(ctx, repository.TakeNextLeadParams{OwnerID: &actor.ID, TeamID: actor.TeamID, SlaDueAt: sla})
	if errors.Is(err, pgx.ErrNoRows) {
		return dto.Lead{}, &apperr.Error{Kind: apperr.KindNotFound, Message: "no leads are waiting in the queue"}
	}
	if err != nil {
		return dto.Lead{}, dbErr(err, "lead")
	}
	_ = s.Q.TouchAssigned(ctx, actor.ID)
	_ = s.Q.MoveFollowUpsToOwner(ctx, repository.MoveFollowUpsToOwnerParams{LeadID: l.ID, OwnerID: &actor.ID})
	s.activity(ctx, s.Q, l.ID, actor, "assigned", actor.Name+" took it from the queue", map[string]any{"to": actor.ID, "strategy": "fifo"})
	return s.get(ctx, actor, l.ID)
}

// RunAssignmentJobs reassigns leads nobody contacted in time and retries queued leads
// (scheduler, every minute).
func (s *LeadService) RunAssignmentJobs(ctx context.Context) (reassigned, assigned int, err error) {
	st := s.settings.Sales(ctx)
	if st.CRM.SLAMinutes > 0 {
		overdue, err := s.Q.OverdueSLALeads(ctx)
		if err != nil {
			return 0, 0, err
		}
		for _, l := range overdue {
			if st.CRM.MaxReassign > 0 && l.ReassignCount >= st.CRM.MaxReassign {
				if _, err := s.assignTo(ctx, nil, l, nil, false); err == nil {
					s.activity(ctx, s.Q, l.ID, nil, "system", fmt.Sprintf("Still not contacted after %d reassignments: moved to the queue", l.ReassignCount), nil)
					managers, _ := s.Q.TeamManagers(ctx, l.TeamID)
					if len(managers) == 0 {
						managers, _ = s.Q.UsersWithPermission(ctx, repository.UsersWithPermissionParams{Module: "leads", Action: "delete"})
					}
					s.notify.Send(ctx, managers, "lead_escalated", "Lead not contacted: "+l.Name,
						"Nobody contacted this lead in time. It is waiting in the queue.", "/crm/leads/"+l.ID.String())
				}
				continue
			}
			if _, err := s.autoAssign(ctx, l, l.OwnerID, false); err == nil {
				reassigned++
			}
		}
	}
	pool, err := s.Q.PoolLeads(ctx)
	if err != nil {
		return reassigned, 0, err
	}
	for _, l := range pool {
		out, err := s.autoAssign(ctx, l, nil, true)
		if err == nil && out.OwnerID != nil {
			assigned++
		}
	}
	return reassigned, assigned, nil
}

// ── my sales (phone app home) ──

func (s *LeadService) MySales(ctx context.Context, actor *auth.Principal) (dto.MySales, error) {
	loc := s.settings.Location(ctx)
	now := time.Now().In(loc)
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, loc)
	out := dto.MySales{SalesScope: orDefault(actor.SalesScope, auth.SalesOwn)}
	if p, err := s.Q.GetCounsellorProfile(ctx, actor.ID); err == nil {
		out.HasProfile, out.Available, out.AcceptsLeads, out.CommissionBP, out.TeamID = true, p.Available, p.AcceptsLeads, p.CommissionBp, p.TeamID
		if p.TeamID != nil {
			if teams, err := s.Q.ListTeams(ctx); err == nil {
				for _, t := range teams {
					if t.ID == *p.TeamID {
						out.TeamName = t.Name
					}
				}
			}
		}
		_ = s.Q.TouchCounsellorSeen(ctx, actor.ID)
	}
	c, err := s.Q.MySalesCounts(ctx, repository.MySalesCountsParams{UserID: &actor.ID, DayEnd: endOfDay(now), TeamID: actor.TeamID,
		MonthStart: monthStart, Month: time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)})
	if err != nil {
		return out, dbErr(err, "sales")
	}
	out.Counts = dto.SalesCounts{OpenLeads: c.OpenLeads, UntouchedLeads: c.UntouchedLeads, FollowUpsToday: c.FollowUpsToday,
		FollowUpsOverdue: c.FollowUpsOverdue, PoolLeads: c.PoolLeads, AdmissionsMonth: c.AdmissionsMonth,
		CollectedMonthPaise: c.CollectedMonth, CommissionMonthPaise: c.CommissionMonth}
	if s.commissions != nil && out.HasProfile {
		if tp, err := s.commissions.progress(ctx, actor.ID, monthStart); err == nil {
			out.Target = tp
		}
	}
	return out, nil
}

func (s *LeadService) SetAvailability(ctx context.Context, actor *auth.Principal, available bool) (dto.MySales, error) {
	if _, err := s.Q.SetAvailability(ctx, repository.SetAvailabilityParams{UserID: actor.ID, Available: available}); err != nil {
		return dto.MySales{}, dbErr(err, "availability")
	}
	return s.MySales(ctx, actor)
}
