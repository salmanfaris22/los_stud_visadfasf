package dto

import (
	"time"

	"github.com/google/uuid"
)

type Branding struct {
	Name         string `json:"name" minLength:"1" maxLength:"60"`
	Tagline      string `json:"tagline" maxLength:"160"`
	LogoURL      string `json:"logo_url" maxLength:"600"`
	PrimaryColor string `json:"primary_color" pattern:"^#[0-9a-fA-F]{6}$"`
	SupportEmail string `json:"support_email" maxLength:"200"`
}

type GoogleSettings struct {
	CalendarSync     bool `json:"calendar_sync" doc:"Push live sessions to Google Calendar and email invites"`
	WorkspaceEnabled bool `json:"workspace_enabled" doc:"Use Workspace APIs for Meet attendance and recordings"`
}

type UploadSettings struct {
	MaxImageMB int `json:"max_image_mb" minimum:"1" maximum:"50"`
	MaxFileMB  int `json:"max_file_mb" minimum:"1" maximum:"500"`
}

type SignupSettings struct {
	Enabled bool `json:"enabled" doc:"Allow students to sign up on the website"`
}

type Settings struct {
	Branding Branding       `json:"branding"`
	Google   GoogleSettings `json:"google"`
	Uploads  UploadSettings `json:"uploads"`
	Signup   SignupSettings `json:"signup"`
}

func DefaultSettings() Settings {
	return Settings{
		Branding: Branding{Name: "LMS", Tagline: "Learn by doing", PrimaryColor: "#6366f1", SupportEmail: "support@lms.local"},
		Google:   GoogleSettings{CalendarSync: true},
		Uploads:  UploadSettings{MaxImageMB: 2, MaxFileMB: 25},
		Signup:   SignupSettings{Enabled: true},
	}
}

type GoogleStatus struct {
	Configured bool   `json:"configured" doc:"GOOGLE_CLIENT_ID/SECRET are set on the server"`
	Connected  bool   `json:"connected"`
	Email      string `json:"email"`
	Scopes     string `json:"scopes"`
}

type SettingsView struct {
	Settings Settings     `json:"settings"`
	Google   GoogleStatus `json:"google_status"`
}

type AuditFilter struct {
	PageQuery
	Entity  string
	Action  string
	ActorID *uuid.UUID
}

type AuditEntry struct {
	ID         int64           `json:"id"`
	ActorID    *uuid.UUID      `json:"actor_id"`
	ActorName  string          `json:"actor_name"`
	ActorEmail string          `json:"actor_email"`
	Action     string          `json:"action"`
	Entity     string          `json:"entity"`
	EntityID   string          `json:"entity_id"`
	Data       any             `json:"data"`
	IP         string          `json:"ip"`
	CreatedAt  time.Time       `json:"created_at"`
}

type Counts struct {
	Students            int32 `json:"students"`
	ActiveStudents      int32 `json:"active_students"`
	Staff               int32 `json:"staff"`
	PublishedCourses    int32 `json:"published_courses"`
	ActiveBatches       int32 `json:"active_batches"`
	PendingReviews      int32 `json:"pending_reviews"`
	ApprovedSubmissions int32 `json:"approved_submissions"`
	ReviewedSubmissions int32 `json:"reviewed_submissions"`
	UpcomingLive        int32 `json:"upcoming_live"`
	NewLeads            int32 `json:"new_leads"`
	Certificates        int32 `json:"certificates"`
}

type DayPoint struct {
	Day       string `json:"day"`
	Submitted int32  `json:"submitted"`
	Approved  int32  `json:"approved"`
}

type CourseStat struct {
	ID          uuid.UUID `json:"id"`
	Title       string    `json:"title"`
	Students    int32     `json:"students"`
	AvgProgress int       `json:"avg_progress"`
	Completed   int32     `json:"completed"`
}

type AttendanceStat struct {
	LiveSessions30d   int32 `json:"live_sessions_30d"`
	LivePresent30d    int32 `json:"live_present_30d"`
	OfflinePresent30d int32 `json:"offline_present_30d"`
	OfflineMarked30d  int32 `json:"offline_marked_30d"`
	OfflineRatePct    int   `json:"offline_rate_pct"`
}

type Overview struct {
	Counts       Counts         `json:"counts"`
	ApprovalRate int            `json:"approval_rate"`
	Daily        []DayPoint     `json:"daily"`
	Courses      []CourseStat   `json:"courses"`
	Attendance   AttendanceStat `json:"attendance"`
}
