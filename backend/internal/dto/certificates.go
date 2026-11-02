package dto

import (
	"time"

	"github.com/google/uuid"
)

type Certificate struct {
	ID              uuid.UUID  `json:"id"`
	Code            string     `json:"code"`
	StudentID       uuid.UUID  `json:"student_id"`
	StudentName     string     `json:"student_name"`
	StudentEmail    string     `json:"student_email"`
	CourseID        uuid.UUID  `json:"course_id"`
	CourseTitle     string     `json:"course_title"`
	CourseThumbnail string     `json:"course_thumbnail"`
	IssuedAt        time.Time  `json:"issued_at"`
	RevokedAt       *time.Time `json:"revoked_at"`
	VerifyURL       string     `json:"verify_url"`
}

type CertificateInput struct {
	StudentID uuid.UUID `json:"student_id"`
	CourseID  uuid.UUID `json:"course_id"`
}

type CertificateFilter struct {
	PageQuery
	CourseID *uuid.UUID
	Q        string
}

type CertificateVerification struct {
	Valid       bool      `json:"valid"`
	Code        string    `json:"code"`
	StudentName string    `json:"student_name"`
	CourseTitle string    `json:"course_title"`
	IssuedAt    time.Time `json:"issued_at"`
	Issuer      string    `json:"issuer"`
}
