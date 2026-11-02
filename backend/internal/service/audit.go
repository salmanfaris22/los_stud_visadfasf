package service

import (
	"context"
	"encoding/json"
	"log/slog"

	"github.com/google/uuid"

	"github.com/lms/backend/internal/auth"
	"github.com/lms/backend/internal/dto"
	"github.com/lms/backend/internal/repository"
)

// AuditService records who changed what. Logging never fails the caller.
type AuditService struct{ deps *Deps }

func (s *AuditService) Log(ctx context.Context, actor *auth.Principal, action, entity string, entityID any, data any) {
	var actorID *uuid.UUID
	if actor != nil {
		actorID = &actor.ID
	}
	raw := []byte("{}")
	if data != nil {
		if b, err := json.Marshal(data); err == nil {
			raw = b
		}
	}
	id := ""
	switch v := entityID.(type) {
	case uuid.UUID:
		id = v.String()
	case string:
		id = v
	}
	if err := s.deps.Q.InsertAudit(ctx, repository.InsertAuditParams{ActorID: actorID, Action: action, Entity: entity, EntityID: id, Data: raw, Ip: auth.MetaFrom(ctx).IP}); err != nil {
		slog.Error("audit insert failed", "err", err)
	}
}

func (s *AuditService) List(ctx context.Context, f dto.AuditFilter) (dto.List[dto.AuditEntry], error) {
	rows, err := s.deps.Q.ListAudit(ctx, repository.ListAuditParams{Entity: optStr(f.Entity), ActorID: f.ActorID, Action: optStr(f.Action), Lim: f.Lim(), Off: f.Off()})
	if err != nil {
		return dto.List[dto.AuditEntry]{}, dbErr(err, "audit log")
	}
	out := make([]dto.AuditEntry, 0, len(rows))
	var total int64
	for _, r := range rows {
		total = r.TotalCount
		var data any
		_ = json.Unmarshal(r.Data, &data)
		out = append(out, dto.AuditEntry{ID: r.ID, ActorID: r.ActorID, ActorName: str(r.ActorName), ActorEmail: str(r.ActorEmail), Action: r.Action,
			Entity: r.Entity, EntityID: r.EntityID, Data: data, IP: r.Ip, CreatedAt: r.CreatedAt})
	}
	return dto.NewList(out, total, f.PageQuery), nil
}
