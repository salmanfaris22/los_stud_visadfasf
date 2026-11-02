package dto

import (
	"time"

	"github.com/google/uuid"
)

type LiveTarget struct {
	Type  string    `json:"type" enum:"batch,course,student"`
	ID    uuid.UUID `json:"id"`
	Label string    `json:"label,omitempty"`
}

type LiveSession struct {
	ID                uuid.UUID    `json:"id"`
	Title             string       `json:"title"`
	Description       string       `json:"description"`
	MeetURL           string       `json:"meet_url"`
	StartsAt          time.Time    `json:"starts_at"`
	EndsAt            time.Time    `json:"ends_at"`
	HostID            *uuid.UUID   `json:"host_id"`
	HostName          string       `json:"host_name"`
	RecordingURL      string       `json:"recording_url"`
	Status            string       `json:"status" enum:"scheduled,cancelled"`
	CalendarSynced    bool         `json:"calendar_synced"`
	LastSyncedAt      *time.Time   `json:"last_synced_at"`
	PresentCount      int32        `json:"present_count"`
	Attended          bool         `json:"attended"`
	GoogleCalendarURL string       `json:"google_calendar_url" doc:"Add-to-Google-Calendar link"`
	Targets           []LiveTarget `json:"targets"`
}

type LiveInput struct {
	Title       string       `json:"title" minLength:"3" maxLength:"200"`
	Description string       `json:"description,omitempty" maxLength:"5000"`
	MeetURL     string       `json:"meet_url" minLength:"10" maxLength:"500" doc:"Google Meet link (https://meet.google.com/...)"`
	StartsAt    time.Time    `json:"starts_at"`
	EndsAt      time.Time    `json:"ends_at"`
	HostID      *uuid.UUID   `json:"host_id,omitempty"`
	Status      string       `json:"status,omitempty" enum:"scheduled,cancelled"`
	Targets     []LiveTarget `json:"targets" minItems:"1" maxItems:"500" doc:"Who can see the session: batches, courses or individual students"`
}

type LiveFilter struct {
	PageQuery
	From     *time.Time
	To       *time.Time
	CourseID *uuid.UUID
}

type LiveRosterRow struct {
	StudentID       uuid.UUID  `json:"student_id"`
	Name            string     `json:"name"`
	Email           string     `json:"email"`
	StudentCode     string     `json:"student_code"`
	Marked          bool       `json:"marked"`
	Present         bool       `json:"present"`
	Source          string     `json:"source"`
	JoinedAt        *time.Time `json:"joined_at"`
	DurationSeconds int32      `json:"duration_seconds"`
}

type LiveDetail struct {
	Session LiveSession     `json:"session"`
	Roster  []LiveRosterRow `json:"roster"`
}

type LiveAttendanceMark struct {
	StudentID uuid.UUID `json:"student_id"`
	Present   bool      `json:"present"`
}

type LiveAttendanceInput struct {
	Records []LiveAttendanceMark `json:"records" maxItems:"5000"`
}

type RecordingInput struct {
	RecordingURL string `json:"recording_url" maxLength:"600" doc:"YouTube, Vimeo, Drive… link. Empty clears it."`
}

type SyncInput struct {
	Calendar   bool `json:"calendar" doc:"Create/update the Google Calendar event and email invites"`
	Attendance bool `json:"attendance" doc:"Pull Meet attendance (Google Workspace)"`
	Recording  bool `json:"recording" doc:"Attach the Meet recording from Drive (Google Workspace)"`
}

type SyncStep struct {
	Ran     bool   `json:"ran"`
	OK      bool   `json:"ok"`
	Message string `json:"message"`
}

type SyncResult struct {
	Calendar   SyncStep    `json:"calendar"`
	Attendance SyncStep    `json:"attendance"`
	Recording  SyncStep    `json:"recording"`
	Session    LiveSession `json:"session"`
}

type JoinResult struct {
	MeetURL string `json:"meet_url"`
}
