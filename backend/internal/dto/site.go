package dto

import (
	"time"

	"github.com/google/uuid"
)

// SiteInfo is everything the public website needs to render the landing page.
type SiteInfo struct {
	Branding Branding                  `json:"branding"`
	Signup   bool                      `json:"signup"`
	Google   bool                      `json:"google"`
	Blocks   map[string]map[string]any `json:"blocks" doc:"CMS blocks by key (hero, stats, features, how, testimonials, faqs, cta, footer)"`
}

type PublicCourse struct {
	ID           uuid.UUID `json:"id"`
	Slug         string    `json:"slug"`
	Title        string    `json:"title"`
	Subtitle     string    `json:"subtitle"`
	ThumbnailURL string    `json:"thumbnail_url"`
	Level        string    `json:"level"`
	Language     string    `json:"language"`
	Category     string    `json:"category"`
	PriceLabel   string    `json:"price_label"`
	VideoCount   int32     `json:"video_count"`
	TotalSeconds int32     `json:"total_seconds"`
	StudentCount int32     `json:"student_count"`
}

type PublicLesson struct {
	ID              uuid.UUID `json:"id"`
	Title           string    `json:"title"`
	DurationSeconds int32     `json:"duration_seconds"`
	IsPreview       bool      `json:"is_preview"`
	EmbedURL        string    `json:"embed_url" doc:"Only set for free previews"`
	ThumbnailURL    string    `json:"thumbnail_url"`
	TaskCount       int       `json:"task_count"`
}

type PublicBatch struct {
	ID           uuid.UUID `json:"id"`
	Name         string    `json:"name"`
	StartDate    string    `json:"start_date"`
	EndDate      string    `json:"end_date"`
	Location     string    `json:"location"`
	ScheduleNote string    `json:"schedule_note"`
	Status       string    `json:"status"`
	TypeName     string    `json:"type_name"`
	IsOffline    bool      `json:"is_offline"`
}

type PublicCourseDetail struct {
	Course       PublicCourse   `json:"course"`
	Description  string         `json:"description"`
	WhatYouLearn []string       `json:"what_you_learn"`
	Lessons      []PublicLesson `json:"lessons"`
	Mentors      []Person       `json:"mentors"`
	Batches      []PublicBatch  `json:"batches"`
	TaskCount    int            `json:"task_count"`
}

type CMSBlock struct {
	Key       string         `json:"key"`
	Data      map[string]any `json:"data"`
	UpdatedAt time.Time      `json:"updated_at"`
}

type CMSInput struct {
	Data map[string]any `json:"data"`
}

type BlogPost struct {
	ID             uuid.UUID  `json:"id"`
	Slug           string     `json:"slug"`
	Title          string     `json:"title"`
	Excerpt        string     `json:"excerpt"`
	Content        string     `json:"content" doc:"Markdown"`
	CoverURL       string     `json:"cover_url"`
	Tags           []string   `json:"tags"`
	Status         string     `json:"status" enum:"draft,published"`
	PublishedAt    *time.Time `json:"published_at"`
	SeoTitle       string     `json:"seo_title"`
	SeoDescription string     `json:"seo_description"`
	AuthorName     string     `json:"author_name"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

type BlogInput struct {
	Title          string   `json:"title" minLength:"3" maxLength:"200"`
	Slug           string   `json:"slug,omitempty" maxLength:"90" pattern:"^[a-z0-9-]*$"`
	Excerpt        string   `json:"excerpt,omitempty" maxLength:"500"`
	Content        string   `json:"content,omitempty" maxLength:"200000"`
	CoverURL       string   `json:"cover_url,omitempty" maxLength:"600"`
	Tags           []string `json:"tags,omitempty" maxItems:"20"`
	Status         string   `json:"status" enum:"draft,published"`
	SeoTitle       string   `json:"seo_title,omitempty" maxLength:"200"`
	SeoDescription string   `json:"seo_description,omitempty" maxLength:"320"`
}

type BlogFilter struct {
	PageQuery
	Status string
	Q      string
}

type PublicPost struct {
	ID          uuid.UUID  `json:"id"`
	Slug        string     `json:"slug"`
	Title       string     `json:"title"`
	Excerpt     string     `json:"excerpt"`
	CoverURL    string     `json:"cover_url"`
	Tags        []string   `json:"tags"`
	PublishedAt *time.Time `json:"published_at"`
	AuthorName  string     `json:"author_name"`
}
