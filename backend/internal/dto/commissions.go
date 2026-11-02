package dto

import (
	"time"

	"github.com/google/uuid"
)

type CommissionEntry struct {
	ID             uuid.UUID  `json:"id"`
	CounsellorID   uuid.UUID  `json:"counsellor_id"`
	CounsellorName string     `json:"counsellor_name"`
	AdmissionID    *uuid.UUID `json:"admission_id"`
	AdmissionNo    string     `json:"admission_no"`
	PaymentID      *uuid.UUID `json:"payment_id"`
	ReceiptNo      string     `json:"receipt_no"`
	Kind           string     `json:"kind" enum:"earned,reversal,slab_adjust,bonus,manual"`
	BasePaise      int64      `json:"base_paise"`
	BP             int32      `json:"bp"`
	AmountPaise    int64      `json:"amount_paise"`
	Month          string     `json:"month" doc:"YYYY-MM"`
	Paid           bool       `json:"paid"`
	Note           string     `json:"note"`
	CreatedAt      time.Time  `json:"created_at"`
}

type Slab struct {
	MinAdmissions int32 `json:"min_admissions" minimum:"0" maximum:"100000"`
	BP            int32 `json:"bp" minimum:"0" maximum:"10000"`
}

type CommissionTarget struct {
	ID                 uuid.UUID `json:"id"`
	CounsellorID       uuid.UUID `json:"counsellor_id"`
	CounsellorName     string    `json:"counsellor_name"`
	Month              string    `json:"month"`
	TargetAdmissions   int32     `json:"target_admissions"`
	TargetPaise        int64     `json:"target_paise"`
	Slabs              []Slab    `json:"slabs"`
	BonusMinAdmissions int32     `json:"bonus_min_admissions"`
	BonusPaise         int64     `json:"bonus_paise"`
}

type CommissionTargetInput struct {
	CounsellorID       uuid.UUID `json:"counsellor_id"`
	Month              string    `json:"month" pattern:"^[0-9]{4}-[0-9]{2}$"`
	TargetAdmissions   int32     `json:"target_admissions" minimum:"0"`
	TargetPaise        int64     `json:"target_paise" minimum:"0"`
	Slabs              []Slab    `json:"slabs" maxItems:"20" doc:"Reaching min_admissions raises the month's rate to at least bp"`
	BonusMinAdmissions int32     `json:"bonus_min_admissions" minimum:"0"`
	BonusPaise         int64     `json:"bonus_paise" minimum:"0"`
}

// TargetProgress shows a counsellor where they stand this month.
type TargetProgress struct {
	Month            string `json:"month"`
	TargetAdmissions int32  `json:"target_admissions"`
	Admissions       int32  `json:"admissions"`
	TargetPaise      int64  `json:"target_paise"`
	CollectedPaise   int64  `json:"collected_paise"`
	SlabBP           int32  `json:"slab_bp" doc:"Rate unlocked by this month's admissions (0 = none)"`
	NextSlab         *Slab  `json:"next_slab"`
	BonusPaise       int64  `json:"bonus_paise"`
	BonusAt          int32  `json:"bonus_at"`
}

type CommissionRow struct {
	CounsellorID     uuid.UUID       `json:"counsellor_id"`
	CounsellorName   string          `json:"counsellor_name"`
	CommissionBP     int32           `json:"commission_bp"`
	Admissions       int32           `json:"admissions"`
	CollectedPaise   int64           `json:"collected_paise"`
	EarnedPaise      int64           `json:"earned_paise"`
	ReversedPaise    int64           `json:"reversed_paise"`
	AdjustmentsPaise int64           `json:"adjustments_paise"`
	TotalPaise       int64           `json:"total_paise" doc:"Month total"`
	PaidPaise        int64           `json:"paid_paise" doc:"Paid out for this month"`
	UnpaidPaise      int64           `json:"unpaid_paise" doc:"All-time balance still to pay"`
	Target           *TargetProgress `json:"target"`
}

type CommissionSummary struct {
	Month  string          `json:"month"`
	Rows   []CommissionRow `json:"rows"`
	Totals CommissionRow   `json:"totals"`
}

type ManualCommissionInput struct {
	CounsellorID uuid.UUID `json:"counsellor_id"`
	Month        string    `json:"month" pattern:"^[0-9]{4}-[0-9]{2}$"`
	AmountPaise  int64     `json:"amount_paise" doc:"Negative to deduct"`
	Note         string    `json:"note" minLength:"2" maxLength:"500"`
}

type PayoutInput struct {
	CounsellorID uuid.UUID `json:"counsellor_id"`
	Month        string    `json:"month" pattern:"^[0-9]{4}-[0-9]{2}$" doc:"Pays every unpaid entry up to this month"`
	PaidOn       string    `json:"paid_on,omitempty" format:"date"`
	Reference    string    `json:"reference,omitempty" maxLength:"120"`
	Note         string    `json:"note,omitempty" maxLength:"500"`
}

type Payout struct {
	ID             uuid.UUID `json:"id"`
	CounsellorID   uuid.UUID `json:"counsellor_id"`
	CounsellorName string    `json:"counsellor_name"`
	Month          string    `json:"month"`
	AmountPaise    int64     `json:"amount_paise"`
	PaidOn         string    `json:"paid_on"`
	Reference      string    `json:"reference"`
	Note           string    `json:"note"`
	CreatedByName  string    `json:"created_by_name"`
	CreatedAt      time.Time `json:"created_at"`
}

type MonthInput struct {
	Month string `json:"month" pattern:"^[0-9]{4}-[0-9]{2}$"`
}

type MyEarnings struct {
	Month   string            `json:"month"`
	Row     CommissionRow     `json:"row"`
	Entries []CommissionEntry `json:"entries"`
	Payouts []Payout          `json:"payouts"`
}
