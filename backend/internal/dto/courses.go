package dto

import (
	"time"

	"github.com/google/uuid"
)

type Course struct {
	ID           uuid.UUID `json:"id"`
	Slug         string    `json:"slug"`
	Title        string    `json:"title"`
	Subtitle     string    `json:"subtitle"`
	Description  string    `json:"description"`
	ThumbnailURL string    `json:"thumbnail_url"`
	Level        string    `json:"level"`
	Language     string    `json:"language"`
	Category     string    `json:"category"`
	Status       string    `json:"status"`
	IsPublic     bool      `json:"is_public"`
	PriceLabel   string    `json:"price_label"`
	FeePaise     int64     `json:"fee_paise" doc:"Course fee incl. GST, in paise"`
	GSTBP        int32     `json:"gst_bp" doc:"GST rate in basis points (1800 = 18%)"`
	WhatYouLearn []string  `json:"what_you_learn"`
	VideoCount   int32     `json:"video_count"`
	StudentCount int32     `json:"student_count"`
	Mentors      []Person  `json:"mentors"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type CourseInput struct {
	Title        string      `json:"title" minLength:"3" maxLength:"160"`
	Slug         string      `json:"slug,omitempty" maxLength:"90" pattern:"^[a-z0-9-]*$"`
	Subtitle     string      `json:"subtitle,omitempty" maxLength:"240"`
	Description  string      `json:"description,omitempty" maxLength:"20000"`
	ThumbnailURL string      `json:"thumbnail_url,omitempty" maxLength:"600"`
	Level        string      `json:"level,omitempty" enum:"beginner,intermediate,advanced,all"`
	Language     string      `json:"language,omitempty" maxLength:"40"`
	Category     string      `json:"category,omitempty" maxLength:"60"`
	Status       string      `json:"status,omitempty" enum:"draft,published,archived"`
	IsPublic     bool        `json:"is_public,omitempty" doc:"Show on the public website catalog"`
	PriceLabel   string      `json:"price_label,omitempty" maxLength:"40"`
	FeePaise     int64       `json:"fee_paise,omitempty" minimum:"0" doc:"Course fee incl. GST, in paise (used for admissions)"`
	GSTBP        *int32      `json:"gst_bp,omitempty" minimum:"0" maximum:"10000" doc:"GST rate in basis points; empty = default rate"`
	WhatYouLearn []string    `json:"what_you_learn,omitempty" maxItems:"20"`
	MentorIDs    []uuid.UUID `json:"mentor_ids,omitempty"`
}

type CourseFilter struct {
	PageQuery
	Q      string
	Status string
}

type CourseOption struct {
	ID       uuid.UUID `json:"id"`
	Title    string    `json:"title"`
	Status   string    `json:"status"`
	FeePaise int64     `json:"fee_paise"`
	GSTBP    int32     `json:"gst_bp"`
}

type Task struct {
	ID           uuid.UUID  `json:"id"`
	VideoID      uuid.UUID  `json:"video_id"`
	Position     int32      `json:"position"`
	Title        string     `json:"title"`
	Instructions string     `json:"instructions"`
	AllowedTypes []string   `json:"allowed_types"`
	MaxMarks     int32      `json:"max_marks"`
	PassMarks    int32      `json:"pass_marks"`
	DueAt        *time.Time `json:"due_at"`
	AllowLate    bool       `json:"allow_late"`
	MaxFiles     int32      `json:"max_files"`
	MaxFileMB    int32      `json:"max_file_mb"`
}

type TaskInput struct {
	Title        string     `json:"title" minLength:"2" maxLength:"200"`
	Instructions string     `json:"instructions,omitempty" maxLength:"20000"`
	AllowedTypes []string   `json:"allowed_types" minItems:"1" enum:"file,image,text,link,code,drive"`
	MaxMarks     int32      `json:"max_marks" minimum:"1" maximum:"1000"`
	PassMarks    int32      `json:"pass_marks,omitempty" minimum:"0" maximum:"1000"`
	DueAt        *time.Time `json:"due_at,omitempty"`
	AllowLate    bool       `json:"allow_late,omitempty"`
	MaxFiles     int32      `json:"max_files,omitempty" minimum:"0" maximum:"20"`
	MaxFileMB    int32      `json:"max_file_mb,omitempty" minimum:"0" maximum:"500"`
}

type Video struct {
	ID              uuid.UUID `json:"id"`
	CourseID        uuid.UUID `json:"course_id"`
	Position        int32     `json:"position"`
	Title           string    `json:"title"`
	Description     string    `json:"description"`
	Provider        string    `json:"provider" enum:"youtube,vimeo,bunny,cloudflare"`
	ProviderRef     string    `json:"provider_ref"`
	SourceURL       string    `json:"source_url"`
	EmbedURL        string    `json:"embed_url"`
	ThumbnailURL    string    `json:"thumbnail_url"`
	DurationSeconds int32     `json:"duration_seconds"`
	IsPreview       bool      `json:"is_preview"`
	Tasks           []Task    `json:"tasks"`
}

type VideoInput struct {
	Title           string `json:"title" minLength:"2" maxLength:"200"`
	Description     string `json:"description,omitempty" maxLength:"20000"`
	Provider        string `json:"provider" enum:"youtube,vimeo,bunny,cloudflare" doc:"Where the video is hosted"`
	URL             string `json:"url" minLength:"3" maxLength:"600" doc:"Video link or id from the chosen provider"`
	DurationSeconds int32  `json:"duration_seconds,omitempty" minimum:"0" maximum:"86400"`
	IsPreview       bool   `json:"is_preview,omitempty" doc:"Free preview on the public course page"`
}

type VideoLinkInput struct {
	Provider string `json:"provider" enum:"youtube,vimeo,bunny,cloudflare"`
	URL      string `json:"url" minLength:"3" maxLength:"600"`
}

type VideoLink struct {
	ProviderRef  string `json:"provider_ref"`
	EmbedURL     string `json:"embed_url"`
	ThumbnailURL string `json:"thumbnail_url"`
}
