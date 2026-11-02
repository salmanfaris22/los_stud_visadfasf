package dto

import (
	"time"

	"github.com/google/uuid"
)

// Money is in paise (₹1 = 100) and rates in basis points (18% = 1800). Dates are "YYYY-MM-DD".

type FeeLineInput struct {
	CourseID uuid.UUID  `json:"course_id"`
	BatchID  *uuid.UUID `json:"batch_id,omitempty"`
	FeePaise *int64     `json:"fee_paise,omitempty" minimum:"0" doc:"Course fee incl. GST; empty = the course's fee"`
}

type InstallmentInput struct {
	DueDate     string `json:"due_date" format:"date"`
	AmountPaise int64  `json:"amount_paise" minimum:"1"`
}

// InstallmentPlan generates equal installments instead of a hand-made list.
type InstallmentPlan struct {
	Count          int    `json:"count" minimum:"1" maximum:"36"`
	FirstDue       string `json:"first_due" format:"date"`
	IntervalMonths int    `json:"interval_months" minimum:"1" maximum:"12"`
}

type NewStudentInput struct {
	Name  string `json:"name" minLength:"2" maxLength:"120"`
	Email string `json:"email" format:"email" maxLength:"200"`
	Phone string `json:"phone,omitempty" maxLength:"30"`
}

type PaymentInput struct {
	AmountPaise   int64      `json:"amount_paise" minimum:"1"`
	Method        string     `json:"method" enum:"upi,cash,bank,card,cheque,other"`
	Reference     string     `json:"reference,omitempty" maxLength:"120" doc:"UPI UTR / transaction id / cheque no."`
	PaidOn        string     `json:"paid_on,omitempty" format:"date" doc:"Defaults to today"`
	ProofUploadID *uuid.UUID `json:"proof_upload_id,omitempty" doc:"Screenshot or receipt (upload purpose payment_proof)"`
	Note          string     `json:"note,omitempty" maxLength:"1000"`
	Approve       bool       `json:"approve,omitempty" doc:"Record as approved now (needs payments edit)"`
}

type AdmissionInput struct {
	StudentID     *uuid.UUID        `json:"student_id,omitempty" doc:"Existing student; or give student to create one"`
	Student       *NewStudentInput  `json:"student,omitempty"`
	LeadID        *uuid.UUID        `json:"lead_id,omitempty"`
	Courses       []FeeLineInput    `json:"courses" minItems:"1" maxItems:"20"`
	DiscountPaise int64             `json:"discount_paise" minimum:"0"`
	CounsellorID  *uuid.UUID        `json:"counsellor_id,omitempty" doc:"Earns the commission; defaults to you or the lead owner"`
	CommissionBP  *int32            `json:"commission_bp,omitempty" minimum:"0" maximum:"10000" doc:"Per-deal override (needs commissions edit)"`
	Installments  []InstallmentInput `json:"installments,omitempty" maxItems:"60"`
	Plan          *InstallmentPlan  `json:"plan,omitempty"`
	Advance       *PaymentInput     `json:"advance,omitempty" doc:"Money collected now (e.g. advance with screenshot)"`
	Notes         string            `json:"notes,omitempty" maxLength:"2000"`
}

type AdmissionUpdate struct {
	DiscountPaise int64      `json:"discount_paise" minimum:"0"`
	CounsellorID  *uuid.UUID `json:"counsellor_id,omitempty"`
	CommissionBP  int32      `json:"commission_bp" minimum:"0" maximum:"10000"`
	Notes         string     `json:"notes,omitempty" maxLength:"2000"`
}

type InstallmentsInput struct {
	Installments []InstallmentInput `json:"installments,omitempty" maxItems:"60"`
	Plan         *InstallmentPlan   `json:"plan,omitempty"`
}

type ReasonInput struct {
	Reason string `json:"reason" minLength:"2" maxLength:"500"`
}

type RefundInput struct {
	AmountPaise int64  `json:"amount_paise" minimum:"1"`
	Reason      string `json:"reason" minLength:"2" maxLength:"500"`
	Method      string `json:"method" enum:"upi,cash,bank,cheque,other"`
	Reference   string `json:"reference,omitempty" maxLength:"120"`
	RefundedOn  string `json:"refunded_on,omitempty" format:"date"`
}

type Admission struct {
	ID            uuid.UUID  `json:"id"`
	AdmissionNo   string     `json:"admission_no"`
	Status        string     `json:"status" enum:"pending_approval,active,completed,cancelled"`
	StudentID     uuid.UUID  `json:"student_id"`
	StudentName   string     `json:"student_name"`
	StudentEmail  string     `json:"student_email"`
	StudentPhone  string     `json:"student_phone"`
	StudentCode   string     `json:"student_code"`
	LeadID        *uuid.UUID `json:"lead_id"`
	CounsellorID  *uuid.UUID `json:"counsellor_id"`
	Counsellor    string     `json:"counsellor_name"`
	Courses       []string   `json:"courses"`
	GrossPaise    int64      `json:"gross_paise"`
	DiscountPaise int64      `json:"discount_paise"`
	NetPaise      int64      `json:"net_paise" doc:"Agreed fee incl. GST"`
	TaxablePaise  int64      `json:"taxable_paise"`
	GSTPaise      int64      `json:"gst_paise"`
	CommissionBP  int32      `json:"commission_bp"`
	PaidPaise     int64      `json:"paid_paise" doc:"Approved payments minus refunds"`
	PendingPaise  int64      `json:"pending_paise" doc:"Payments waiting for approval"`
	RefundedPaise int64      `json:"refunded_paise"`
	BalancePaise  int64      `json:"balance_paise"`
	NextDueDate   string     `json:"next_due_date"`
	Overdue       bool       `json:"overdue"`
	Notes         string     `json:"notes"`
	CreatedAt     time.Time  `json:"created_at"`
	ApprovedAt    *time.Time `json:"approved_at"`
}

type AdmissionCourse struct {
	CourseID    uuid.UUID  `json:"course_id"`
	CourseTitle string     `json:"course_title"`
	BatchID     *uuid.UUID `json:"batch_id"`
	BatchName   string     `json:"batch_name"`
	FeePaise    int64      `json:"fee_paise"`
	GSTBP       int32      `json:"gst_bp"`
}

type Installment struct {
	ID          uuid.UUID `json:"id"`
	Seq         int32     `json:"seq"`
	DueDate     string    `json:"due_date"`
	AmountPaise int64     `json:"amount_paise"`
	PaidPaise   int64     `json:"paid_paise"`
	Status      string    `json:"status" enum:"paid,partial,due,overdue,upcoming"`
}

type Payment struct {
	ID              uuid.UUID  `json:"id"`
	ReceiptNo       string     `json:"receipt_no"`
	AdmissionID     uuid.UUID  `json:"admission_id"`
	AdmissionNo     string     `json:"admission_no"`
	StudentID       uuid.UUID  `json:"student_id"`
	StudentName     string     `json:"student_name"`
	StudentPhone    string     `json:"student_phone"`
	CounsellorName  string     `json:"counsellor_name"`
	AmountPaise     int64      `json:"amount_paise"`
	Method          string     `json:"method"`
	Reference       string     `json:"reference"`
	PaidOn          string     `json:"paid_on"`
	ProofURL        string     `json:"proof_url"`
	ProofMime       string     `json:"proof_mime"`
	Status          string     `json:"status" enum:"pending,approved,rejected,void"`
	Source          string     `json:"source" enum:"admin,app,student"`
	SubmittedByName string     `json:"submitted_by_name"`
	ApprovedByName  string     `json:"approved_by_name"`
	ApprovedAt      *time.Time `json:"approved_at"`
	RejectionReason string     `json:"rejection_reason"`
	Note            string     `json:"note"`
	CreatedAt       time.Time  `json:"created_at"`
}

type Refund struct {
	ID            uuid.UUID `json:"id"`
	AmountPaise   int64     `json:"amount_paise"`
	Reason        string    `json:"reason"`
	Method        string    `json:"method"`
	Reference     string    `json:"reference"`
	RefundedOn    string    `json:"refunded_on"`
	CreatedByName string    `json:"created_by_name"`
	CreatedAt     time.Time `json:"created_at"`
}

type AdmissionDetail struct {
	Admission    Admission         `json:"admission"`
	CourseLines  []AdmissionCourse `json:"course_lines"`
	Installments []Installment     `json:"installments"`
	Payments     []Payment         `json:"payments"`
	Refunds      []Refund          `json:"refunds"`
	Commission   []CommissionEntry `json:"commission"`
}

type AdmissionFilter struct {
	PageQuery
	Q            string
	Status       string
	StudentID    *uuid.UUID
	CounsellorID *uuid.UUID
	CourseID     *uuid.UUID
	WithBalance  bool
	Overdue      bool
	From         *time.Time
	To           *time.Time
}

type PaymentFilter struct {
	PageQuery
	Q           string
	Status      string
	Method      string
	Source      string
	AdmissionID *uuid.UUID
	From        string
	To          string
}

// FeeQuote previews GST and totals before an admission is saved.
type FeeQuote struct {
	GrossPaise    int64             `json:"gross_paise"`
	DiscountPaise int64             `json:"discount_paise"`
	NetPaise      int64             `json:"net_paise"`
	TaxablePaise  int64             `json:"taxable_paise"`
	GSTPaise      int64             `json:"gst_paise"`
	Lines         []AdmissionCourse `json:"lines"`
	Installments  []InstallmentInput `json:"installments"`
}

type FeeQuoteInput struct {
	Courses       []FeeLineInput   `json:"courses" minItems:"1" maxItems:"20"`
	DiscountPaise int64            `json:"discount_paise" minimum:"0"`
	Plan          *InstallmentPlan `json:"plan,omitempty"`
}

// ───────────── Student portal ─────────────

type PayInfo struct {
	UPIID        string `json:"upi_id"`
	PayeeName    string `json:"payee_name"`
	QRImageURL   string `json:"qr_image_url"`
	BankDetails  string `json:"bank_details"`
	Instructions string `json:"instructions"`
}

type StudentFeeAccount struct {
	Admission    Admission     `json:"admission"`
	Installments []Installment `json:"installments"`
	Payments     []Payment     `json:"payments"`
}

type StudentFees struct {
	Accounts      []StudentFeeAccount `json:"accounts"`
	TotalPaise    int64               `json:"total_paise"`
	PaidPaise     int64               `json:"paid_paise"`
	BalancePaise  int64               `json:"balance_paise"`
	PendingPaise  int64               `json:"pending_paise"`
	NextDueDate   string              `json:"next_due_date"`
	NextDuePaise  int64               `json:"next_due_paise"`
	Overdue       bool                `json:"overdue"`
	Pay           PayInfo             `json:"pay"`
}

type StudentPaymentInput struct {
	AdmissionID   uuid.UUID `json:"admission_id"`
	AmountPaise   int64     `json:"amount_paise" minimum:"1"`
	Reference     string    `json:"reference,omitempty" maxLength:"120" doc:"UPI transaction id (UTR)"`
	PaidOn        string    `json:"paid_on,omitempty" format:"date"`
	ProofUploadID uuid.UUID `json:"proof_upload_id"`
	Note          string    `json:"note,omitempty" maxLength:"1000"`
}
