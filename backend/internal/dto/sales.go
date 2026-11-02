package dto

import (
	"time"

	"github.com/google/uuid"
)

// ───────────── Teams & counsellors ─────────────

type Team struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	MemberCount int32     `json:"member_count"`
	CreatedAt   time.Time `json:"created_at"`
}

type TeamInput struct {
	Name string `json:"name" minLength:"2" maxLength:"80"`
}

// Counsellor is a staff member who works leads, with their sales profile.
type Counsellor struct {
	ID             uuid.UUID  `json:"id"`
	Name           string     `json:"name"`
	Email          string     `json:"email"`
	Phone          string     `json:"phone"`
	AvatarURL      string     `json:"avatar_url"`
	Status         string     `json:"status"`
	TeamID         *uuid.UUID `json:"team_id"`
	TeamName       string     `json:"team_name"`
	CommissionBP   int32      `json:"commission_bp" doc:"Default commission in basis points (850 = 8.5%)"`
	AcceptsLeads   bool       `json:"accepts_leads" doc:"Included in automatic lead distribution"`
	Available      bool       `json:"available" doc:"On duty (toggle in the phone app)"`
	MaxOpenLeads   int32      `json:"max_open_leads" doc:"0 = no limit"`
	OpenLeads      int32      `json:"open_leads"`
	LastAssignedAt *time.Time `json:"last_assigned_at"`
	LastSeenAt     *time.Time `json:"last_seen_at"`
}

type CounsellorInput struct {
	TeamID       *uuid.UUID `json:"team_id,omitempty"`
	CommissionBP int32      `json:"commission_bp" minimum:"0" maximum:"10000"`
	AcceptsLeads bool       `json:"accepts_leads"`
	MaxOpenLeads int32      `json:"max_open_leads" minimum:"0" maximum:"100000"`
}

type AvailabilityInput struct {
	Available bool `json:"available"`
}

type SalesCounts struct {
	OpenLeads            int32 `json:"open_leads"`
	UntouchedLeads       int32 `json:"untouched_leads"`
	FollowUpsToday       int32 `json:"follow_ups_today"`
	FollowUpsOverdue     int32 `json:"follow_ups_overdue"`
	PoolLeads            int32 `json:"pool_leads" doc:"Unassigned leads waiting in the queue (Get next lead)"`
	AdmissionsMonth      int32 `json:"admissions_month"`
	CollectedMonthPaise  int64 `json:"collected_month_paise"`
	CommissionMonthPaise int64 `json:"commission_month_paise"`
}

// MySales is the signed-in counsellor's home screen (phone app and admin dashboard).
type MySales struct {
	SalesScope   string          `json:"sales_scope" enum:"all,team,own"`
	HasProfile   bool            `json:"has_profile"`
	Available    bool            `json:"available"`
	AcceptsLeads bool            `json:"accepts_leads"`
	CommissionBP int32           `json:"commission_bp"`
	TeamID       *uuid.UUID      `json:"team_id"`
	TeamName     string          `json:"team_name"`
	Counts       SalesCounts     `json:"counts"`
	Target       *TargetProgress `json:"target"`
}

// ───────────── Pipeline settings ─────────────

type Stage struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	Color     string    `json:"color"`
	Kind      string    `json:"kind" enum:"open,won,lost"`
	Position  int32     `json:"position"`
	IsDefault bool      `json:"is_default"`
	LeadCount int32     `json:"lead_count"`
}

type StageInput struct {
	Name      string `json:"name" minLength:"1" maxLength:"40"`
	Color     string `json:"color" pattern:"^#[0-9a-fA-F]{6}$"`
	Kind      string `json:"kind" enum:"open,won,lost"`
	IsDefault bool   `json:"is_default,omitempty" doc:"New leads start here (open stages only)"`
}

type LostReason struct {
	ID    uuid.UUID `json:"id"`
	Label string    `json:"label"`
}

type LostReasonInput struct {
	Label string `json:"label" minLength:"2" maxLength:"80"`
}

type AssignmentRule struct {
	ID          uuid.UUID  `json:"id"`
	Name        string     `json:"name"`
	Source      string     `json:"source" doc:"Empty = any source"`
	CourseID    *uuid.UUID `json:"course_id"`
	CourseTitle string     `json:"course_title"`
	TeamID      *uuid.UUID `json:"team_id"`
	TeamName    string     `json:"team_name"`
	Strategy    string     `json:"strategy" enum:"round_robin,least_busy,fifo,manual"`
	Priority    int32      `json:"priority"`
	Active      bool       `json:"active"`
}

type AssignmentRuleInput struct {
	Name     string     `json:"name" minLength:"2" maxLength:"80"`
	Source   string     `json:"source,omitempty" maxLength:"60"`
	CourseID *uuid.UUID `json:"course_id,omitempty"`
	TeamID   *uuid.UUID `json:"team_id,omitempty"`
	Strategy string     `json:"strategy" enum:"round_robin,least_busy,fifo,manual"`
	Priority int32      `json:"priority" minimum:"0" maximum:"100000" doc:"Lower runs first"`
	Active   bool       `json:"active"`
}

// ───────────── Leads ─────────────

type Lead struct {
	ID               uuid.UUID  `json:"id"`
	Name             string     `json:"name"`
	Email            string     `json:"email"`
	Phone            string     `json:"phone"`
	WhatsAppID       string     `json:"whatsapp_id" doc:"Phone in international format, digits only"`
	City             string     `json:"city"`
	Source           string     `json:"source"`
	SourceRef        string     `json:"source_ref"`
	Message          string     `json:"message"`
	CourseID         *uuid.UUID `json:"course_id"`
	CourseTitle      string     `json:"course_title"`
	StageID          *uuid.UUID `json:"stage_id"`
	StageName        string     `json:"stage_name"`
	StageColor       string     `json:"stage_color"`
	StageKind        string     `json:"stage_kind"`
	OwnerID          *uuid.UUID `json:"owner_id"`
	OwnerName        string     `json:"owner_name"`
	TeamID           *uuid.UUID `json:"team_id"`
	TeamName         string     `json:"team_name"`
	AssignedAt       *time.Time `json:"assigned_at"`
	SLADueAt         *time.Time `json:"sla_due_at"`
	FirstContactedAt *time.Time `json:"first_contacted_at"`
	LastActivityAt   time.Time  `json:"last_activity_at"`
	NextFollowUpAt   *time.Time `json:"next_follow_up_at"`
	LostReason       string     `json:"lost_reason"`
	StudentID        *uuid.UUID `json:"student_id"`
	AdmissionID      *uuid.UUID `json:"admission_id"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

// LeadInput is the public website enquiry form.
type LeadInput struct {
	Name     string     `json:"name" minLength:"2" maxLength:"120"`
	Email    string     `json:"email,omitempty" format:"email" maxLength:"200"`
	Phone    string     `json:"phone,omitempty" maxLength:"30"`
	CourseID *uuid.UUID `json:"course_id,omitempty"`
	Message  string     `json:"message,omitempty" maxLength:"3000"`
	Source   string     `json:"source,omitempty" maxLength:"60"`
}

// LeadCreate is a lead added by staff (admin site, phone app, CSV, webhooks).
type LeadCreate struct {
	Name       string     `json:"name" minLength:"1" maxLength:"120"`
	Email      string     `json:"email,omitempty" maxLength:"200"`
	Phone      string     `json:"phone,omitempty" maxLength:"30"`
	City       string     `json:"city,omitempty" maxLength:"80"`
	Source     string     `json:"source,omitempty" maxLength:"60" doc:"Defaults to manual"`
	CourseID   *uuid.UUID `json:"course_id,omitempty"`
	Message    string     `json:"message,omitempty" maxLength:"3000"`
	OwnerID    *uuid.UUID `json:"owner_id,omitempty" doc:"Assign directly instead of the assignment rules"`
	AssignToMe bool       `json:"assign_to_me,omitempty"`
}

type LeadUpdate struct {
	Name     string     `json:"name" minLength:"1" maxLength:"120"`
	Email    string     `json:"email,omitempty" maxLength:"200"`
	Phone    string     `json:"phone,omitempty" maxLength:"30"`
	City     string     `json:"city,omitempty" maxLength:"80"`
	Source   string     `json:"source,omitempty" maxLength:"60"`
	CourseID *uuid.UUID `json:"course_id,omitempty"`
	Message  string     `json:"message,omitempty" maxLength:"3000"`
}

type LeadCreated struct {
	Lead      Lead `json:"lead"`
	Duplicate bool `json:"duplicate" doc:"The phone or email matched an existing lead, which was updated instead"`
}

type LeadStageInput struct {
	StageID    uuid.UUID `json:"stage_id"`
	LostReason string    `json:"lost_reason,omitempty" maxLength:"120"`
	Note       string    `json:"note,omitempty" maxLength:"5000"`
}

type NoteInput struct {
	Body string `json:"body" minLength:"1" maxLength:"5000"`
}

type FollowUpInput struct {
	DueAt time.Time `json:"due_at"`
	Note  string    `json:"note,omitempty" maxLength:"1000"`
}

type CallInput struct {
	Phone           string     `json:"phone,omitempty" maxLength:"30"`
	Direction       string     `json:"direction,omitempty" enum:"outgoing,incoming,missed"`
	StartedAt       *time.Time `json:"started_at,omitempty"`
	DurationSeconds int32      `json:"duration_seconds" minimum:"0" maximum:"86400"`
	Note            string     `json:"note,omitempty" maxLength:"2000"`
}

type AssignInput struct {
	OwnerID *uuid.UUID `json:"owner_id" doc:"null moves the lead back to the unassigned queue"`
}

type BulkAssignInput struct {
	IDs     []uuid.UUID `json:"ids" minItems:"1" maxItems:"1000"`
	OwnerID *uuid.UUID  `json:"owner_id"`
}

type LeadActivity struct {
	ID        uuid.UUID  `json:"id"`
	Kind      string     `json:"kind"`
	Body      string     `json:"body"`
	Data      any        `json:"data"`
	ActorID   *uuid.UUID `json:"actor_id"`
	ActorName string     `json:"actor_name"`
	CreatedAt time.Time  `json:"created_at"`
}

type FollowUp struct {
	ID        uuid.UUID  `json:"id"`
	LeadID    uuid.UUID  `json:"lead_id"`
	LeadName  string     `json:"lead_name"`
	LeadPhone string     `json:"lead_phone"`
	StageName string     `json:"stage_name"`
	OwnerID   *uuid.UUID `json:"owner_id"`
	DueAt     time.Time  `json:"due_at"`
	Note      string     `json:"note"`
	DoneAt    *time.Time `json:"done_at"`
	Overdue   bool       `json:"overdue"`
	CreatedAt time.Time  `json:"created_at"`
}

type LeadDetail struct {
	Lead       Lead           `json:"lead"`
	Activities []LeadActivity `json:"activities"`
	FollowUps  []FollowUp     `json:"follow_ups"`
	WhatsApp   *WAContact     `json:"whatsapp"`
}

type LeadFilter struct {
	PageQuery
	Q          string
	StageID    *uuid.UUID
	StageKind  string
	OwnerID    *uuid.UUID
	Unassigned bool
	Mine       bool
	Source     string
	CourseID   *uuid.UUID
	TeamID     *uuid.UUID
	FollowUp   string // today | overdue
	From       *time.Time
	To         *time.Time
	Sort       string // created | activity | follow_up
}

type LeadList struct {
	List[Lead]
	StageCounts map[string]int32 `json:"stage_counts" doc:"stage id -> leads in scope"`
}

type LeadImportInput struct {
	CSV     string     `json:"csv" minLength:"5" maxLength:"3000000" doc:"CSV with header: name,phone,email,city,source,course,message"`
	OwnerID *uuid.UUID `json:"owner_id,omitempty" doc:"Assign every row to this counsellor; empty = assignment rules"`
}

// ───────────── Sales & accounts settings ─────────────

type BusinessSettings struct {
	LegalName             string `json:"legal_name" maxLength:"160"`
	GSTIN                 string `json:"gstin" maxLength:"15"`
	Address               string `json:"address" maxLength:"500"`
	State                 string `json:"state" maxLength:"60"`
	Phone                 string `json:"phone" maxLength:"30"`
	Email                 string `json:"email" maxLength:"200"`
	AdmissionPrefix       string `json:"admission_prefix" maxLength:"12"`
	ReceiptPrefix         string `json:"receipt_prefix" maxLength:"12"`
	DefaultGSTBP          int32  `json:"default_gst_bp" minimum:"0" maximum:"10000" doc:"1800 = 18%"`
	CommissionExcludesGST bool   `json:"commission_excludes_gst" doc:"Pay commission on the amount without GST"`
	ReceiptNote           string `json:"receipt_note" maxLength:"500"`
	Timezone              string `json:"timezone" maxLength:"60"`
}

type PaymentSettings struct {
	UPIID        string `json:"upi_id" maxLength:"100"`
	PayeeName    string `json:"payee_name" maxLength:"120"`
	QRImageURL   string `json:"qr_image_url" maxLength:"600"`
	BankDetails  string `json:"bank_details" maxLength:"1000"`
	Instructions string `json:"instructions" maxLength:"1000"`
}

type CRMSettings struct {
	SLAMinutes       int32  `json:"sla_minutes" minimum:"0" maximum:"10080" doc:"Reassign untouched leads after this many minutes (0 = off)"`
	MaxReassign      int32  `json:"max_reassign" minimum:"0" maximum:"20" doc:"After this many reassignments the lead goes to the queue"`
	RequireAvailable bool   `json:"require_available" doc:"Only counsellors marked Available get new leads"`
	CountryCode      string `json:"country_code" pattern:"^[0-9]{1,4}$" doc:"Added to 10-digit phone numbers"`
	WebhookToken     string `json:"webhook_token" readOnly:"true"`
}

type ReminderSettings struct {
	FeeDaysBefore       int32  `json:"fee_days_before" minimum:"0" maximum:"60"`
	OverdueEveryDays    int32  `json:"overdue_every_days" minimum:"1" maximum:"60"`
	WhatsAppTemplate    string `json:"whatsapp_template" maxLength:"120" doc:"Approved template with {{1}} name, {{2}} amount, {{3}} due date, {{4}} UPI ID"`
	TemplateLanguage    string `json:"template_language" maxLength:"10"`
	Email               bool   `json:"email"`
	FollowUpLeadMinutes int32  `json:"follow_up_lead_minutes" minimum:"0" maximum:"1440" doc:"Remind counsellors this many minutes before a follow-up"`
}

type SalesSettings struct {
	Business  BusinessSettings `json:"business"`
	Payments  PaymentSettings  `json:"payments"`
	CRM       CRMSettings      `json:"crm"`
	Reminders ReminderSettings `json:"reminders"`
}

func DefaultSalesSettings() SalesSettings {
	return SalesSettings{
		Business:  BusinessSettings{AdmissionPrefix: "ADM-", ReceiptPrefix: "RCPT-", DefaultGSTBP: 1800, Timezone: "Asia/Kolkata"},
		CRM:       CRMSettings{SLAMinutes: 15, MaxReassign: 3, RequireAvailable: true, CountryCode: "91"},
		Reminders: ReminderSettings{FeeDaysBefore: 3, OverdueEveryDays: 3, TemplateLanguage: "en", Email: true, FollowUpLeadMinutes: 10},
	}
}
