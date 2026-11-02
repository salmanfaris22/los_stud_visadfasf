package dto

import (
	"time"

	"github.com/google/uuid"
)

type VideoComment struct {
	ID           uuid.UUID      `json:"id"`
	VideoID      uuid.UUID      `json:"video_id"`
	ParentID     *uuid.UUID     `json:"parent_id"`
	AuthorID     uuid.UUID      `json:"author_id"`
	AuthorName   string         `json:"author_name"`
	AuthorAvatar string         `json:"author_avatar"`
	AuthorKind   string         `json:"author_kind"`
	Body         string         `json:"body"`
	Pinned       bool           `json:"pinned"`
	CreatedAt    time.Time      `json:"created_at"`
	Replies      []VideoComment `json:"replies"`
}

type VideoCommentInput struct {
	Body     string     `json:"body" minLength:"1" maxLength:"5000"`
	ParentID *uuid.UUID `json:"parent_id,omitempty"`
}

type ModerationComment struct {
	ID          uuid.UUID  `json:"id"`
	VideoID     uuid.UUID  `json:"video_id"`
	VideoTitle  string     `json:"video_title"`
	CourseID    uuid.UUID  `json:"course_id"`
	CourseTitle string     `json:"course_title"`
	ParentID    *uuid.UUID `json:"parent_id"`
	AuthorName  string     `json:"author_name"`
	AuthorKind  string     `json:"author_kind"`
	Body        string     `json:"body"`
	Pinned      bool       `json:"pinned"`
	CreatedAt   time.Time  `json:"created_at"`
}

type Announcement struct {
	ID          uuid.UUID  `json:"id"`
	Title       string     `json:"title"`
	Body        string     `json:"body"`
	TargetType  string     `json:"target_type" enum:"all,course,batch"`
	TargetID    *uuid.UUID `json:"target_id"`
	TargetLabel string     `json:"target_label"`
	Pinned      bool       `json:"pinned"`
	AuthorName  string     `json:"author_name"`
	CreatedAt   time.Time  `json:"created_at"`
}

type AnnouncementInput struct {
	Title      string     `json:"title" minLength:"2" maxLength:"200"`
	Body       string     `json:"body" minLength:"1" maxLength:"20000"`
	TargetType string     `json:"target_type" enum:"all,course,batch"`
	TargetID   *uuid.UUID `json:"target_id,omitempty"`
	Pinned     bool       `json:"pinned,omitempty"`
}
