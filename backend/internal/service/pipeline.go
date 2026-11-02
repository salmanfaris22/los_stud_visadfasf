package service

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"

	"github.com/lms/backend/internal/apperr"
	"github.com/lms/backend/internal/auth"
	"github.com/lms/backend/internal/dto"
	"github.com/lms/backend/internal/repository"
)

// Pipeline stages, lost reasons, assignment rules, teams and counsellor profiles.

func (s *LeadService) Stages(ctx context.Context) ([]dto.Stage, error) {
	rows, err := s.Q.ListStages(ctx)
	if err != nil {
		return nil, dbErr(err, "stages")
	}
	out := make([]dto.Stage, 0, len(rows))
	for _, r := range rows {
		out = append(out, dto.Stage{ID: r.ID, Name: r.Name, Color: r.Color, Kind: r.Kind, Position: r.Position, IsDefault: r.IsDefault, LeadCount: r.LeadCount})
	}
	return out, nil
}

func (s *LeadService) CreateStage(ctx context.Context, actor *auth.Principal, in dto.StageInput) ([]dto.Stage, error) {
	st, err := s.Q.CreateStage(ctx, repository.CreateStageParams{Name: strings.TrimSpace(in.Name), Color: in.Color, Kind: in.Kind})
	if err != nil {
		return nil, dbErr(err, "a stage with this name")
	}
	if in.IsDefault && in.Kind == "open" {
		_ = s.Q.SetDefaultStage(ctx, st.ID)
	}
	s.audit.Log(ctx, actor, "create", "lead_stage", st.ID, in)
	return s.Stages(ctx)
}

func (s *LeadService) UpdateStage(ctx context.Context, actor *auth.Principal, id uuid.UUID, in dto.StageInput) ([]dto.Stage, error) {
	cur, err := s.Q.GetStage(ctx, id)
	if err != nil {
		return nil, apperr.NotFound("stage")
	}
	if cur.Kind != in.Kind {
		if n, _ := s.Q.CountStagesOfKind(ctx, cur.Kind); n <= 1 {
			return nil, apperr.Conflict(fmt.Sprintf("keep at least one %s stage", cur.Kind))
		}
	}
	if _, err := s.Q.UpdateStage(ctx, repository.UpdateStageParams{ID: id, Name: strings.TrimSpace(in.Name), Color: in.Color, Kind: in.Kind}); err != nil {
		return nil, dbErr(err, "a stage with this name")
	}
	if in.IsDefault && in.Kind == "open" {
		_ = s.Q.SetDefaultStage(ctx, id)
	}
	s.audit.Log(ctx, actor, "update", "lead_stage", id, in)
	return s.Stages(ctx)
}

// DeleteStage moves the stage's leads to the default stage first.
func (s *LeadService) DeleteStage(ctx context.Context, actor *auth.Principal, id uuid.UUID) ([]dto.Stage, error) {
	cur, err := s.Q.GetStage(ctx, id)
	if err != nil {
		return nil, apperr.NotFound("stage")
	}
	if n, _ := s.Q.CountStagesOfKind(ctx, cur.Kind); n <= 1 {
		return nil, apperr.Conflict(fmt.Sprintf("keep at least one %s stage", cur.Kind))
	}
	err = s.tx(ctx, func(q *repository.Queries) error {
		if cur.IsDefault {
			stages, err := q.ListStages(ctx)
			if err != nil {
				return err
			}
			for _, st := range stages {
				if st.ID != id && st.Kind == "open" {
					if err := q.SetDefaultStage(ctx, st.ID); err != nil {
						return err
					}
					break
				}
			}
		}
		def, err := q.DefaultStage(ctx)
		if err != nil {
			return err
		}
		target := def.ID
		if cur.Kind != "open" { // won/lost leads go to another stage of the same kind
			if other, err := q.ListStages(ctx); err == nil {
				for _, st := range other {
					if st.ID != id && st.Kind == cur.Kind {
						target = st.ID
						break
					}
				}
			}
		}
		if err := q.MoveLeadsToStage(ctx, repository.MoveLeadsToStageParams{FromID: &id, ToID: &target}); err != nil {
			return err
		}
		return q.DeleteStage(ctx, id)
	})
	if err != nil {
		return nil, dbErr(err, "stage")
	}
	s.audit.Log(ctx, actor, "delete", "lead_stage", id, nil)
	return s.Stages(ctx)
}

func (s *LeadService) ReorderStages(ctx context.Context, actor *auth.Principal, ids []uuid.UUID) ([]dto.Stage, error) {
	err := s.tx(ctx, func(q *repository.Queries) error {
		for i, id := range ids {
			if err := q.SetStagePosition(ctx, repository.SetStagePositionParams{ID: id, Position: int32(i)}); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, dbErr(err, "stages")
	}
	return s.Stages(ctx)
}

func (s *LeadService) LostReasons(ctx context.Context) ([]dto.LostReason, error) {
	rows, err := s.Q.ListLostReasons(ctx)
	if err != nil {
		return nil, dbErr(err, "lost reasons")
	}
	out := make([]dto.LostReason, 0, len(rows))
	for _, r := range rows {
		out = append(out, dto.LostReason{ID: r.ID, Label: r.Label})
	}
	return out, nil
}

func (s *LeadService) CreateLostReason(ctx context.Context, actor *auth.Principal, in dto.LostReasonInput) ([]dto.LostReason, error) {
	if _, err := s.Q.CreateLostReason(ctx, strings.TrimSpace(in.Label)); err != nil {
		return nil, dbErr(err, "this reason")
	}
	return s.LostReasons(ctx)
}

func (s *LeadService) DeleteLostReason(ctx context.Context, actor *auth.Principal, id uuid.UUID) ([]dto.LostReason, error) {
	if err := s.Q.DeleteLostReason(ctx, id); err != nil {
		return nil, dbErr(err, "reason")
	}
	return s.LostReasons(ctx)
}

func (s *LeadService) Rules(ctx context.Context) ([]dto.AssignmentRule, error) {
	rows, err := s.Q.ListAssignmentRules(ctx)
	if err != nil {
		return nil, dbErr(err, "rules")
	}
	out := make([]dto.AssignmentRule, 0, len(rows))
	for _, r := range rows {
		out = append(out, dto.AssignmentRule{ID: r.ID, Name: r.Name, Source: r.Source, CourseID: r.CourseID, CourseTitle: str(r.CourseTitle),
			TeamID: r.TeamID, TeamName: str(r.TeamName), Strategy: r.Strategy, Priority: r.Priority, Active: r.Active})
	}
	return out, nil
}

func (s *LeadService) SaveRule(ctx context.Context, actor *auth.Principal, id *uuid.UUID, in dto.AssignmentRuleInput) ([]dto.AssignmentRule, error) {
	src := strings.ToLower(strings.TrimSpace(in.Source))
	var err error
	if id == nil {
		_, err = s.Q.CreateAssignmentRule(ctx, repository.CreateAssignmentRuleParams{Name: strings.TrimSpace(in.Name), Source: src, CourseID: in.CourseID,
			TeamID: in.TeamID, Strategy: in.Strategy, Priority: in.Priority, Active: in.Active})
	} else {
		_, err = s.Q.UpdateAssignmentRule(ctx, repository.UpdateAssignmentRuleParams{ID: *id, Name: strings.TrimSpace(in.Name), Source: src,
			CourseID: in.CourseID, TeamID: in.TeamID, Strategy: in.Strategy, Priority: in.Priority, Active: in.Active})
	}
	if err != nil {
		return nil, dbErr(err, "rule")
	}
	s.audit.Log(ctx, actor, "save", "assignment_rule", "", in)
	return s.Rules(ctx)
}

func (s *LeadService) DeleteRule(ctx context.Context, actor *auth.Principal, id uuid.UUID) ([]dto.AssignmentRule, error) {
	if err := s.Q.DeleteAssignmentRule(ctx, id); err != nil {
		return nil, dbErr(err, "rule")
	}
	s.audit.Log(ctx, actor, "delete", "assignment_rule", id, nil)
	return s.Rules(ctx)
}

// ── teams & counsellors ──

func (s *LeadService) Teams(ctx context.Context) ([]dto.Team, error) {
	rows, err := s.Q.ListTeams(ctx)
	if err != nil {
		return nil, dbErr(err, "teams")
	}
	out := make([]dto.Team, 0, len(rows))
	for _, r := range rows {
		out = append(out, dto.Team{ID: r.ID, Name: r.Name, MemberCount: r.MemberCount, CreatedAt: r.CreatedAt})
	}
	return out, nil
}

func (s *LeadService) SaveTeam(ctx context.Context, actor *auth.Principal, id *uuid.UUID, in dto.TeamInput) ([]dto.Team, error) {
	var err error
	if id == nil {
		_, err = s.Q.CreateTeam(ctx, strings.TrimSpace(in.Name))
	} else {
		_, err = s.Q.UpdateTeam(ctx, repository.UpdateTeamParams{ID: *id, Name: strings.TrimSpace(in.Name)})
	}
	if err != nil {
		return nil, dbErr(err, "a team with this name")
	}
	s.audit.Log(ctx, actor, "save", "team", "", in)
	return s.Teams(ctx)
}

func (s *LeadService) DeleteTeam(ctx context.Context, actor *auth.Principal, id uuid.UUID) ([]dto.Team, error) {
	if err := s.Q.DeleteTeam(ctx, id); err != nil {
		return nil, dbErr(err, "team")
	}
	s.access.Invalidate(nil)
	s.audit.Log(ctx, actor, "delete", "team", id, nil)
	return s.Teams(ctx)
}

func (s *LeadService) Counsellors(ctx context.Context, team *uuid.UUID) ([]dto.Counsellor, error) {
	rows, err := s.Q.ListCounsellors(ctx, team)
	if err != nil {
		return nil, dbErr(err, "counsellors")
	}
	out := make([]dto.Counsellor, 0, len(rows))
	for _, r := range rows {
		out = append(out, dto.Counsellor{ID: r.ID, Name: r.Name, Email: r.Email, Phone: str(r.Phone), AvatarURL: str(r.AvatarUrl), Status: r.Status,
			TeamID: r.TeamID, TeamName: str(r.TeamName), CommissionBP: r.CommissionBp, AcceptsLeads: r.AcceptsLeads, Available: r.Available,
			MaxOpenLeads: r.MaxOpenLeads, OpenLeads: r.OpenLeads, LastAssignedAt: r.LastAssignedAt, LastSeenAt: r.LastSeenAt})
	}
	return out, nil
}

func (s *LeadService) UpdateCounsellor(ctx context.Context, actor *auth.Principal, id uuid.UUID, in dto.CounsellorInput) ([]dto.Counsellor, error) {
	if err := s.checkAssignee(ctx, id); err != nil {
		return nil, apperr.Invalid("only active staff can have a sales profile")
	}
	if _, err := s.Q.UpsertCounsellorProfile(ctx, repository.UpsertCounsellorProfileParams{UserID: id, TeamID: in.TeamID, CommissionBp: in.CommissionBP,
		AcceptsLeads: in.AcceptsLeads, MaxOpenLeads: in.MaxOpenLeads}); err != nil {
		return nil, dbErr(err, "profile")
	}
	s.access.Invalidate(&id) // team changes the user's sales scope
	s.audit.Log(ctx, actor, "update", "counsellor", id, in)
	return s.Counsellors(ctx, nil)
}
