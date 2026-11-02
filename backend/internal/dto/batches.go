package dto

import (
	"time"

	"github.com/google/uuid"
)

type BatchType struct {
	ID         uuid.UUID `json:"id"`
	Name       string    `json:"name"`
	IsOffline  bool      `json:"is_offline"`
	Color      string    `json:"color"`
	BatchCount int32     `json:"batch_count"`
}

type BatchTypeInput struct {
	Name      string `json:"name" minLength:"2" maxLength:"40"`
	IsOffline bool   `json:"is_offline,omitempty" doc:"Offline batches get class sessions and attendance"`
	Color     string `json:"color,omitempty" pattern:"^(#[0-9a-fA-F]{6})?$"`
}

type Batch struct {
	ID           uuid.UUID `json:"id"`
	CourseID     uuid.UUID `json:"course_id"`
	CourseTitle  string    `json:"course_title"`
	BatchTypeID  uuid.UUID `json:"batch_type_id"`
	TypeName     string    `json:"type_name"`
	TypeColor    string    `json:"type_color"`
	IsOffline    bool      `json:"is_offline"`
	Name         string    `json:"name"`
	StartDate    string    `json:"start_date"`
	EndDate      string    `json:"end_date"`
	Capacity     int32     `json:"capacity"`
	Location     string    `json:"location"`
	ScheduleNote string    `json:"schedule_note"`
	Status       string    `json:"status"`
	StudentCount int32     `json:"student_count"`
	CreatedAt    time.Time `json:"created_at"`
}

type BatchInput struct {
	CourseID     uuid.UUID   `json:"course_id"`
	BatchTypeID  uuid.UUID   `json:"batch_type_id"`
	Name         string      `json:"name" minLength:"2" maxLength:"120"`
	StartDate    string      `json:"start_date,omitempty" format:"date"`
	EndDate      string      `json:"end_date,omitempty" format:"date"`
	Capacity     int32       `json:"capacity,omitempty" minimum:"0" maximum:"100000"`
	Location     string      `json:"location,omitempty" maxLength:"300"`
	ScheduleNote string      `json:"schedule_note,omitempty" maxLength:"1000"`
	Status       string      `json:"status,omitempty" enum:"upcoming,running,completed,cancelled"`
	MentorIDs    []uuid.UUID `json:"mentor_ids,omitempty"`
}

type BatchFilter struct {
	PageQuery
	CourseID *uuid.UUID
	Status   string
	Q        string
}

type BatchOption struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	CourseID    uuid.UUID `json:"course_id"`
	CourseTitle string    `json:"course_title"`
}

type BatchStudent struct {
	ID               uuid.UUID `json:"id"`
	Name             string    `json:"name"`
	Email            string    `json:"email"`
	StudentCode      string    `json:"student_code"`
	AvatarURL        string    `json:"avatar_url"`
	EnrollmentID     uuid.UUID `json:"enrollment_id"`
	EnrollmentStatus string    `json:"enrollment_status"`
	TotalTasks       int32     `json:"total_tasks"`
	ApprovedTasks    int32     `json:"approved_tasks"`
	ProgressPct      int       `json:"progress_pct"`
}

type BatchDetail struct {
	Batch    Batch          `json:"batch"`
	Mentors  []Person       `json:"mentors"`
	Students []BatchStudent `json:"students"`
}

type ClassSession struct {
	ID           uuid.UUID  `json:"id"`
	BatchID      uuid.UUID  `json:"batch_id"`
	Title        string     `json:"title"`
	StartsAt     time.Time  `json:"starts_at"`
	EndsAt       time.Time  `json:"ends_at"`
	PresentCount int32      `json:"present_count"`
	QRActive     bool       `json:"qr_active"`
	QRExpiresAt  *time.Time `json:"qr_expires_at"`
}

type ClassInput struct {
	Title    string    `json:"title" minLength:"2" maxLength:"160"`
	StartsAt time.Time `json:"starts_at"`
	EndsAt   time.Time `json:"ends_at"`
}

type RosterRow struct {
	StudentID   uuid.UUID  `json:"student_id"`
	Name        string     `json:"name"`
	Email       string     `json:"email"`
	StudentCode string     `json:"student_code"`
	Status      string     `json:"status" doc:"present, absent, late, excused, or empty when not marked"`
	Source      string     `json:"source"`
	MarkedAt    *time.Time `json:"marked_at"`
}

type AttendanceMark struct {
	StudentID uuid.UUID `json:"student_id"`
	Status    string    `json:"status" enum:"present,absent,late,excused"`
}

type AttendanceInput struct {
	Records []AttendanceMark `json:"records" maxItems:"5000"`
}

type ClassQR struct {
	Token      string    `json:"token"`
	ExpiresAt  time.Time `json:"expires_at"`
	CheckinURL string    `json:"checkin_url"`
}

type CheckinInput struct {
	Token string `json:"token" minLength:"10" maxLength:"100"`
}

type CheckinResult struct {
	ClassTitle string `json:"class_title"`
	BatchName  string `json:"batch_name"`
	Status     string `json:"status"`
}

type MyClassAttendance struct {
	ClassID   uuid.UUID  `json:"class_id"`
	Title     string     `json:"title"`
	BatchName string     `json:"batch_name"`
	StartsAt  time.Time  `json:"starts_at"`
	Status    string     `json:"status"`
	MarkedAt  *time.Time `json:"marked_at"`
}
