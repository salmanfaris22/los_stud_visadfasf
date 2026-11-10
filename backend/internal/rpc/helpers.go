package rpc

import (
	"context"

	"github.com/google/uuid"

	lmsv1 "github.com/lms/backend/gen/lms/v1"
	"github.com/lms/backend/internal/auth"
	"github.com/lms/backend/internal/dto"
)

// Small helpers used by the generated adapters (services_gen.go).

func actor(ctx context.Context) *auth.Principal { return auth.FromContext(ctx) }

// idOf reads the request's id (protovalidate already checked it is a UUID).
func idOf(m interface{ GetId() string }) uuid.UUID { return uuidFromPB(m.GetId()) }

// page reads the paging fields of a list request (0 means the default).
func page(m interface {
	GetPage() int32
	GetPerPage() int32
}) dto.PageQuery {
	return dto.PageQuery{Page: int(m.GetPage()), PerPage: int(m.GetPerPage())}
}

// def32 returns d when v is unset (0).
func def32(v, d int32) int32 {
	if v == 0 {
		return d
	}
	return v
}

// defStr returns d when v is unset ("").
func defStr(v, d string) string {
	if v == "" {
		return d
	}
	return v
}

// noErr adapts a call that cannot fail to the (value, error) shape.
func noErr[T any](v T) (T, error) { return v, nil }

// leadFilter turns the ListLeads request into the service filter.
func leadFilter(m *lmsv1.ListLeadsRequest) dto.LeadFilter {
	return dto.LeadFilter{
		PageQuery: page(m), Q: m.GetQ(), StageID: optUUID(m.GetStageId()), StageKind: m.GetStageKind(),
		OwnerID: optUUID(m.GetOwnerId()), Unassigned: m.GetUnassigned(), Mine: m.GetMine(), Source: m.GetSource(),
		CourseID: optUUID(m.GetCourseId()), TeamID: optUUID(m.GetTeamId()), FollowUp: m.GetFollowUp(),
		From: optTsFromPB(m.GetFrom()), To: optTsFromPB(m.GetTo()), Sort: m.GetSort(),
	}
}
