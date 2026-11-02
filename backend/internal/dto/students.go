package dto

import (
	"time"

	"github.com/google/uuid"
)

type Student struct {
	ID          uuid.UUID  `json:"id"`
	Name        string     `json:"name"`
	Email       string     `json:"email"`
	Phone       string     `json:"phone"`
	AvatarURL   string     `json:"avatar_url"`
	Status      string     `json:"status"`
	StudentCode string     `json:"student_code"`
	CourseCount int32      `json:"course_count"`
	LastLoginAt *time.Time `json:"last_login_at"`
	CreatedAt   time.Time  `json:"created_at"`
}

type Enrollment struct {
	ID              uuid.UUID  `json:"id"`
	CourseID        uuid.UUID  `json:"course_id"`
	CourseTitle     string     `json:"course_title"`
	CourseSlug      string     `json:"course_slug"`
	CourseThumbnail string     `json:"course_thumbnail"`
	BatchID         *uuid.UUID `json:"batch_id"`
	BatchName       string     `json:"batch_name"`
	Status          string     `json:"status"`
	EnrolledAt      time.Time  `json:"enrolled_at"`
	CompletedAt     *time.Time `json:"completed_at"`
	TotalTasks      int32      `json:"total_tasks"`
	ApprovedTasks   int32      `json:"approved_tasks"`
	ProgressPct     int        `json:"progress_pct"`
}

type StudentDetail struct {
	Student     Student      `json:"student"`
	Bio         string       `json:"bio"`
	Enrollments []Enrollment `json:"enrollments"`
}

type EnrollInput struct {
	CourseID uuid.UUID  `json:"course_id"`
	BatchID  *uuid.UUID `json:"batch_id,omitempty"`
}

type StudentInput struct {
	Name        string        `json:"name" minLength:"2" maxLength:"120"`
	Email       string        `json:"email" format:"email" maxLength:"200"`
	Phone       string        `json:"phone,omitempty" maxLength:"30"`
	Password    string        `json:"password,omitempty" maxLength:"200" doc:"Leave empty to email an invite link"`
	Status      string        `json:"status,omitempty" enum:"active,disabled"`
	Enrollments []EnrollInput `json:"enrollments,omitempty" doc:"Courses to assign right away"`
}

type EnrollmentUpdate struct {
	BatchID *uuid.UUID `json:"batch_id,omitempty"`
	Status  string     `json:"status" enum:"active,completed,suspended"`
}

type StudentFilter struct {
	PageQuery
	Q        string
	Status   string
	CourseID *uuid.UUID
	BatchID  *uuid.UUID
}

type ImportInput struct {
	CSV         string     `json:"csv" minLength:"5" maxLength:"3000000" doc:"CSV text with header: name,email,phone,password"`
	CourseID    *uuid.UUID `json:"course_id,omitempty"`
	BatchID     *uuid.UUID `json:"batch_id,omitempty"`
	SendInvites bool       `json:"send_invites,omitempty"`
}

type ImportResult struct {
	Created int      `json:"created"`
	Skipped int      `json:"skipped"`
	Errors  []string `json:"errors"`
}
