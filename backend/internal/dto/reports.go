package dto

import "github.com/google/uuid"

type ReportRange struct {
	From string `json:"from"`
	To   string `json:"to"`
}

type CollectionRow struct {
	Period     string `json:"period"`
	Payments   int32  `json:"payments"`
	TotalPaise int64  `json:"total_paise"`
	UPIPaise   int64  `json:"upi_paise"`
	CashPaise  int64  `json:"cash_paise"`
	BankPaise  int64  `json:"bank_paise"`
	OtherPaise int64  `json:"other_paise"`
}

type CollectionsReport struct {
	ReportRange
	Bucket       string          `json:"bucket" enum:"day,month"`
	Rows         []CollectionRow `json:"rows"`
	TotalPaise   int64           `json:"total_paise"`
	RefundsPaise int64           `json:"refunds_paise"`
	NetPaise     int64           `json:"net_paise"`
	PendingCount int32           `json:"pending_count"`
	PendingPaise int64           `json:"pending_paise"`
}

type DueRow struct {
	AdmissionID    uuid.UUID `json:"admission_id"`
	AdmissionNo    string    `json:"admission_no"`
	StudentName    string    `json:"student_name"`
	StudentPhone   string    `json:"student_phone"`
	CounsellorName string    `json:"counsellor_name"`
	NetPaise       int64     `json:"net_paise"`
	PaidPaise      int64     `json:"paid_paise"`
	BalancePaise   int64     `json:"balance_paise"`
	OverduePaise   int64     `json:"overdue_paise"`
	NextDueDate    string    `json:"next_due_date"`
	DaysOverdue    int       `json:"days_overdue"`
	Bucket         string    `json:"bucket" enum:"not_due,0-30,31-60,61-90,90+"`
}

type AgingBucket struct {
	Bucket       string `json:"bucket"`
	Admissions   int    `json:"admissions"`
	OverduePaise int64  `json:"overdue_paise"`
}

type DuesReport struct {
	Rows              []DueRow      `json:"rows"`
	Aging             []AgingBucket `json:"aging"`
	TotalBalancePaise int64         `json:"total_balance_paise"`
	TotalOverduePaise int64         `json:"total_overdue_paise"`
}

type CounsellorPerformance struct {
	CounsellorID       uuid.UUID `json:"counsellor_id"`
	CounsellorName     string    `json:"counsellor_name"`
	LeadsAssigned      int32     `json:"leads_assigned"`
	LeadsContacted     int32     `json:"leads_contacted"`
	AvgResponseMinutes float64   `json:"avg_response_minutes"`
	Calls              int32     `json:"calls"`
	Admissions         int32     `json:"admissions"`
	ConversionPct      float64   `json:"conversion_pct"`
	BookedPaise        int64     `json:"booked_paise"`
	CollectedPaise     int64     `json:"collected_paise"`
	CommissionPaise    int64     `json:"commission_paise"`
}

type PerformanceReport struct {
	ReportRange
	Rows []CounsellorPerformance `json:"rows"`
}

type FunnelStage struct {
	ID    uuid.UUID `json:"id"`
	Name  string    `json:"name"`
	Color string    `json:"color"`
	Kind  string    `json:"kind"`
	Total int32     `json:"total"`
}

type SourceRow struct {
	Source        string  `json:"source"`
	Total         int32   `json:"total"`
	Converted     int32   `json:"converted"`
	Lost          int32   `json:"lost"`
	ConversionPct float64 `json:"conversion_pct"`
}

type ReasonRow struct {
	Reason string `json:"reason"`
	Total  int32  `json:"total"`
}

type FunnelReport struct {
	ReportRange
	Stages      []FunnelStage `json:"stages"`
	Sources     []SourceRow   `json:"sources"`
	LostReasons []ReasonRow   `json:"lost_reasons"`
	Total       int32         `json:"total"`
	Converted   int32         `json:"converted"`
}

type GSTMonth struct {
	Month        string `json:"month"`
	Receipts     int32  `json:"receipts"`
	AmountPaise  int64  `json:"amount_paise"`
	TaxablePaise int64  `json:"taxable_paise"`
	GSTPaise     int64  `json:"gst_paise"`
	CGSTPaise    int64  `json:"cgst_paise"`
	SGSTPaise    int64  `json:"sgst_paise"`
}

type GSTReport struct {
	ReportRange
	GSTIN  string     `json:"gstin"`
	Months []GSTMonth `json:"months"`
	Totals GSTMonth   `json:"totals"`
}
