package dto

import (
	"time"

	"github.com/google/uuid"
)

// CourseVersion is one built version of a course curriculum.
type CourseVersion struct {
	ID            uuid.UUID `json:"id"`
	Number        int32     `json:"number"`
	Note          string    `json:"note"`
	CreatedAt     time.Time `json:"created_at"`
	CreatedByName string    `json:"created_by_name"`
	StudentCount  int32     `json:"student_count"`
	VideoCount    int32     `json:"video_count"`
	TaskCount     int32     `json:"task_count"`
	QuizCount     int32     `json:"quiz_count"`
}

// VersionChanges is the difference between the working copy and the latest version.
type VersionChanges struct {
	AddedVideos    int32 `json:"added_videos"`
	RemovedVideos  int32 `json:"removed_videos"`
	AddedTasks     int32 `json:"added_tasks"`
	RemovedTasks   int32 `json:"removed_tasks"`
	AddedQuizzes   int32 `json:"added_quizzes"`
	RemovedQuizzes int32 `json:"removed_quizzes"`
	Reordered      bool  `json:"reordered"`
}

// VersionSummary is what the admin "Build update" dialog shows.
type VersionSummary struct {
	Versions   []CourseVersion `json:"versions"` // newest first
	HasChanges bool            `json:"has_changes"`
	Changes    VersionChanges  `json:"changes"`
}

// VersionStudent is one enrolled student and the version they are on.
type VersionStudent struct {
	EnrollmentID  uuid.UUID  `json:"enrollment_id"`
	StudentID     uuid.UUID  `json:"student_id"`
	Name          string     `json:"name"`
	Email         string     `json:"email"`
	StudentCode   string     `json:"student_code"`
	BatchID       *uuid.UUID `json:"batch_id"`
	BatchName     string     `json:"batch_name"`
	VersionID     *uuid.UUID `json:"version_id"`
	VersionNumber int32      `json:"version_number"`
	ProgressPct   int        `json:"progress_pct"`
}
