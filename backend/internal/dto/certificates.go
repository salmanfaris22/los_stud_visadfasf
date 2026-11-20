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

// CertificateField is one item drawn on a certificate template. Positions and sizes are millimetres
// from the top-left of an A4 landscape page (297 x 210); text placeholders are filled in per certificate.
type CertificateField struct {
	ID         string  `json:"id" minLength:"1" maxLength:"40"`
	Kind       string  `json:"kind" enum:"text,qr,image"`
	Label      string  `json:"label,omitempty" maxLength:"60" doc:"Name shown in the template editor"`
	Text       string  `json:"text,omitempty" maxLength:"2000" doc:"Text with {student} {course} {course_text} {year} {date} {code} {verify_url}; **bold** marks bold words"`
	Src        string  `json:"src,omitempty" maxLength:"600" doc:"Image URL (image fields)"`
	X          float64 `json:"x" minimum:"-50" maximum:"297"`
	Y          float64 `json:"y" minimum:"-50" maximum:"210"`
	W          float64 `json:"w" minimum:"1" maximum:"297" doc:"Box width; the QR code size"`
	Font       string  `json:"font,omitempty" enum:"sans,sans-light,sans-medium,sans-semibold,sans-bold,sans-extrabold,script"`
	Size       float64 `json:"size,omitempty" minimum:"0" maximum:"200" doc:"Font size in points"`
	Color      string  `json:"color,omitempty" pattern:"^#[0-9a-fA-F]{6}$"`
	Align      string  `json:"align,omitempty" enum:"left,center,right"`
	Spacing    float64 `json:"spacing,omitempty" minimum:"-5" maximum:"20" doc:"Letter spacing in mm"`
	LineHeight float64 `json:"line_height,omitempty" minimum:"0" maximum:"5" doc:"Line height as a multiple of the font size"`
	Uppercase  bool    `json:"uppercase,omitempty"`
	Fit        bool    `json:"fit,omitempty" doc:"Shrink the text so it stays on one line"`
}

// CertificateTemplate is a reusable certificate design: a background image plus fields.
type CertificateTemplate struct {
	ID            uuid.UUID          `json:"id"`
	Name          string             `json:"name"`
	BackgroundURL string             `json:"background_url"`
	Fields        []CertificateField `json:"fields"`
	IsDefault     bool               `json:"is_default"`
	CourseCount   int32              `json:"course_count" doc:"Courses that use this template"`
	CreatedAt     time.Time          `json:"created_at"`
	UpdatedAt     time.Time          `json:"updated_at"`
}

type CertificateTemplateInput struct {
	Name          string             `json:"name" minLength:"1" maxLength:"120"`
	BackgroundURL string             `json:"background_url,omitempty" maxLength:"600"`
	Fields        []CertificateField `json:"fields,omitempty" maxItems:"40"`
	IsDefault     bool               `json:"is_default,omitempty" doc:"Make this the default template"`
}

type CertificateTemplateOption struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	IsDefault bool      `json:"is_default"`
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
