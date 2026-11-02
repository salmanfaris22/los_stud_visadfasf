package service

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"

	"github.com/lms/backend/internal/dto"
	"github.com/lms/backend/internal/repository"
)

// TEMPORARY shims so the package compiles while LMS v2 (sales/CRM) is half-built.
// leads.go references these, but commissions.go and whatsapp.go are not written yet.
// Delete this file when service/commissions.go and service/whatsapp.go land
// (the compiler will report duplicate declarations as a reminder).

// CommissionService is a placeholder; the real one lives in commissions.go (v2 phase 4).
type CommissionService struct {
	base
}

// progress is a placeholder: no target data until commissions.go exists.
func (c *CommissionService) progress(_ context.Context, _ uuid.UUID, _ time.Time) (*dto.TargetProgress, error) {
	return nil, errors.New("commissions not implemented yet")
}

// waContactFromModel maps a stored WhatsApp contact to its API shape (no lead/owner/student
// names or last message — the real whatsapp.go fills those from joined queries).
func waContactFromModel(c repository.WaContact) dto.WAContact {
	name := c.ProfileName
	if name == "" {
		name = c.WaID
	}
	return dto.WAContact{
		ID: c.ID, WaID: c.WaID, ProfileName: c.ProfileName, DisplayName: name,
		LeadID: c.LeadID, StudentID: c.StudentID,
		LastInboundAt: c.LastInboundAt, LastMessageAt: c.LastMessageAt, Unread: c.Unread,
		CanReply: c.LastInboundAt != nil && time.Since(*c.LastInboundAt) < 24*time.Hour,
	}
}
