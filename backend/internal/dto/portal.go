package dto

import (
	"time"

	"github.com/google/uuid"
)

type MyCourse struct {
	EnrollmentID  uuid.UUID  `json:"enrollment_id"`
	CourseID      uuid.UUID  `json:"course_id"`
	Slug          string     `json:"slug"`
	Title         string     `json:"title"`
	Subtitle      string     `json:"subtitle"`
	ThumbnailURL  string     `json:"thumbnail_url"`
	CoverURL      string     `json:"cover_url" doc:"Course thumbnail, or the first lesson's video thumbnail when the course has none"`
	PreviewURL    string     `json:"preview_url" doc:"Muted autoplay embed of the first lesson, for hover previews"`
	Level         string     `json:"level"`
	Category      string     `json:"category"`
	BatchID       *uuid.UUID `json:"batch_id"`
	BatchName     string     `json:"batch_name"`
	Status        string     `json:"status"`
	EnrolledAt    time.Time  `json:"enrolled_at"`
	VideoCount    int32      `json:"video_count"`
	TotalTasks    int32      `json:"total_tasks"`
	ApprovedTasks int32      `json:"approved_tasks"`
	ProgressPct   int        `json:"progress_pct"`
}

type MyTask struct {
	ID           uuid.UUID  `json:"id"`
	Title        string     `json:"title"`
	DueAt        *time.Time `json:"due_at"`
	MaxMarks     int32      `json:"max_marks"`
	AllowedTypes []string   `json:"allowed_types"`
	VideoID      uuid.UUID  `json:"video_id"`
	VideoTitle   string     `json:"video_title"`
	CourseID     uuid.UUID  `json:"course_id"`
	CourseTitle  string     `json:"course_title"`
	Status       string     `json:"status" enum:"todo,pending,approved,rejected,resubmit"`
	SubmissionID *uuid.UUID `json:"submission_id"`
	Marks        *int32     `json:"marks"`
	Attempt      int32      `json:"attempt"`
	SubmittedAt  *time.Time `json:"submitted_at"`
	IsOverdue    bool       `json:"is_overdue"`
}

type DashboardStats struct {
	Courses      int `json:"courses"`
	ToDo         int `json:"to_do" doc:"Tasks not submitted yet or sent back"`
	InReview     int `json:"in_review"`
	Approved     int `json:"approved"`
	UpcomingLive int `json:"upcoming_live"`
	Certificates int `json:"certificates"`
}

type Dashboard struct {
	Stats         DashboardStats `json:"stats"`
	Courses       []MyCourse     `json:"courses"`
	NextTasks     []MyTask       `json:"next_tasks"`
	UpcomingLive  []LiveSession  `json:"upcoming_live"`
	Announcements []Announcement `json:"announcements"`
}

type PlaylistItem struct {
	ID              uuid.UUID `json:"id"`
	Title           string    `json:"title"`
	Position        int32     `json:"position"`
	DurationSeconds int32     `json:"duration_seconds"`
	ThumbnailURL    string    `json:"thumbnail_url"`
	Provider        string    `json:"provider"`
	TaskCount       int32     `json:"task_count"`
	ApprovedCount   int32     `json:"approved_count"`
	Done            bool      `json:"done" doc:"All tasks of the video approved"`
}

type MyCourseDetail struct {
	Course       MyCourse       `json:"course"`
	Description  string         `json:"description"`
	WhatYouLearn []string       `json:"what_you_learn"`
	Mentors      []Person       `json:"mentors"`
	Playlist     []PlaylistItem `json:"playlist"`
}

type WatchPage struct {
	Video       Video          `json:"video"`
	CourseID    uuid.UUID      `json:"course_id"`
	CourseTitle string         `json:"course_title"`
	ProgressPct int            `json:"progress_pct"`
	Playlist    []PlaylistItem `json:"playlist"`
	Tasks       []MyTask       `json:"tasks"`
	Quizzes     []MyQuiz       `json:"quizzes"`
	PrevID      *uuid.UUID     `json:"prev_id"`
	NextID      *uuid.UUID     `json:"next_id"`
}

type TaskRules struct {
	MaxFiles   int32 `json:"max_files"`
	MaxFileMB  int32 `json:"max_file_mb"`
	MaxImageMB int   `json:"max_image_mb"`
	AllowLate  bool  `json:"allow_late"`
}

type TaskPage struct {
	Task      TaskBrief       `json:"task"`
	Rules     TaskRules       `json:"rules"`
	Status    string          `json:"status" enum:"todo,pending,approved,rejected,resubmit"`
	CanSubmit bool            `json:"can_submit"`
	Reason    string          `json:"reason" doc:"Why submitting is blocked"`
	IsOverdue bool            `json:"is_overdue"`
	Attempts  []Submission    `json:"attempts"`
	Comments  []ThreadComment `json:"comments"`
}
