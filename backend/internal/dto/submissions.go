package dto

import (
	"time"

	"github.com/google/uuid"
)

type SubmissionItem struct {
	ID        uuid.UUID  `json:"id"`
	Kind      string     `json:"kind" enum:"file,image,text,link,code,drive"`
	Content   string     `json:"content"`
	Language  string     `json:"language"`
	UploadID  *uuid.UUID `json:"upload_id"`
	FileName  string     `json:"file_name"`
	Mime      string     `json:"mime"`
	SizeBytes int64      `json:"size_bytes"`
	URL       string     `json:"url"`
}

type SubmissionItemInput struct {
	Kind     string     `json:"kind" enum:"file,image,text,link,code,drive"`
	Content  string     `json:"content,omitempty" maxLength:"50000" doc:"Text, code, or the link URL"`
	Language string     `json:"language,omitempty" maxLength:"30" doc:"Code language, e.g. go, js"`
	UploadID *uuid.UUID `json:"upload_id,omitempty" doc:"For file and image items"`
}

type SubmissionInput struct {
	Items []SubmissionItemInput `json:"items" minItems:"1" maxItems:"30"`
}

// Submission is one attempt with its items.
type Submission struct {
	ID           uuid.UUID        `json:"id"`
	Attempt      int32            `json:"attempt"`
	Status       string           `json:"status" enum:"pending,approved,rejected,resubmit"`
	Marks        *int32           `json:"marks"`
	Feedback     string           `json:"feedback"`
	IsLate       bool             `json:"is_late"`
	ReviewerName string           `json:"reviewer_name"`
	ReviewedAt   *time.Time       `json:"reviewed_at"`
	CreatedAt    time.Time        `json:"created_at"`
	Items        []SubmissionItem `json:"items"`
}

// SubmissionRow is one line of the review queue.
type SubmissionRow struct {
	ID           uuid.UUID  `json:"id"`
	TaskID       uuid.UUID  `json:"task_id"`
	TaskTitle    string     `json:"task_title"`
	VideoTitle   string     `json:"video_title"`
	CourseID     uuid.UUID  `json:"course_id"`
	CourseTitle  string     `json:"course_title"`
	StudentID    uuid.UUID  `json:"student_id"`
	StudentName  string     `json:"student_name"`
	StudentEmail string     `json:"student_email"`
	StudentCode  string     `json:"student_code"`
	Attempt      int32      `json:"attempt"`
	Status       string     `json:"status"`
	Marks        *int32     `json:"marks"`
	MaxMarks     int32      `json:"max_marks"`
	IsLate       bool       `json:"is_late"`
	CreatedAt    time.Time  `json:"created_at"`
	ReviewedAt   *time.Time `json:"reviewed_at"`
}

type SubmissionFilter struct {
	PageQuery
	Status    string
	CourseID  *uuid.UUID
	TaskID    *uuid.UUID
	StudentID *uuid.UUID
	BatchID   *uuid.UUID
	Q         string
}

type Attachment struct {
	ID       uuid.UUID `json:"id"`
	FileName string    `json:"file_name"`
	Mime     string    `json:"mime"`
	URL      string    `json:"url"`
}

type ThreadComment struct {
	ID           uuid.UUID   `json:"id"`
	AuthorID     uuid.UUID   `json:"author_id"`
	AuthorName   string      `json:"author_name"`
	AuthorAvatar string      `json:"author_avatar"`
	AuthorKind   string      `json:"author_kind"`
	Body         string      `json:"body"`
	Attachment   *Attachment `json:"attachment"`
	CreatedAt    time.Time   `json:"created_at"`
}

type CommentInput struct {
	Body     string     `json:"body" minLength:"1" maxLength:"5000"`
	UploadID *uuid.UUID `json:"upload_id,omitempty"`
}

type ReviewInput struct {
	Status   string `json:"status" enum:"approved,rejected,resubmit"`
	Marks    *int32 `json:"marks,omitempty" minimum:"0" maximum:"1000"`
	Feedback string `json:"feedback,omitempty" maxLength:"10000"`
}

type TaskBrief struct {
	ID           uuid.UUID  `json:"id"`
	Title        string     `json:"title"`
	Instructions string     `json:"instructions"`
	AllowedTypes []string   `json:"allowed_types"`
	MaxMarks     int32      `json:"max_marks"`
	PassMarks    int32      `json:"pass_marks"`
	DueAt        *time.Time `json:"due_at"`
	VideoID      uuid.UUID  `json:"video_id"`
	VideoTitle   string     `json:"video_title"`
	CourseID     uuid.UUID  `json:"course_id"`
	CourseTitle  string     `json:"course_title"`
}

type SubmissionDetail struct {
	Task     TaskBrief       `json:"task"`
	Student  Person          `json:"student"`
	Current  Submission      `json:"current"`
	History  []Submission    `json:"history"`
	Comments []ThreadComment `json:"comments"`
}
