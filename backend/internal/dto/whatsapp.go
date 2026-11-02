package dto

import (
	"time"

	"github.com/google/uuid"
)

// WAConfig is the WhatsApp Cloud API connection (secrets are never returned).
type WAConfig struct {
	Enabled        bool    `json:"enabled"`
	PhoneNumberID  string  `json:"phone_number_id"`
	WABAID         string  `json:"waba_id"`
	VerifyToken    string  `json:"verify_token"`
	TokenSet       bool    `json:"token_set"`
	AppSecretSet   bool    `json:"app_secret_set"`
	WelcomeMessage string  `json:"welcome_message"`
	AwayMessage    string  `json:"away_message"`
	HoursStart     int32   `json:"hours_start" doc:"Office hours start (0-23)"`
	HoursEnd       int32   `json:"hours_end" doc:"Office hours end (1-24)"`
	Days           []int32 `json:"days" doc:"Working days, 0 = Sunday"`
	WebhookURL     string  `json:"webhook_url"`
}

type WAConfigInput struct {
	Enabled        bool    `json:"enabled"`
	PhoneNumberID  string  `json:"phone_number_id" maxLength:"40"`
	WABAID         string  `json:"waba_id" maxLength:"40"`
	VerifyToken    string  `json:"verify_token" maxLength:"120"`
	AccessToken    string  `json:"access_token,omitempty" maxLength:"1000" doc:"Leave empty to keep the saved token"`
	AppSecret      string  `json:"app_secret,omitempty" maxLength:"200" doc:"Leave empty to keep the saved secret"`
	WelcomeMessage string  `json:"welcome_message,omitempty" maxLength:"1000"`
	AwayMessage    string  `json:"away_message,omitempty" maxLength:"1000"`
	HoursStart     int32   `json:"hours_start" minimum:"0" maximum:"23"`
	HoursEnd       int32   `json:"hours_end" minimum:"1" maximum:"24"`
	Days           []int32 `json:"days" maxItems:"7"`
}

type WAContact struct {
	ID            uuid.UUID  `json:"id"`
	WaID          string     `json:"wa_id"`
	ProfileName   string     `json:"profile_name"`
	DisplayName   string     `json:"display_name"`
	LeadID        *uuid.UUID `json:"lead_id"`
	LeadName      string     `json:"lead_name"`
	OwnerID       *uuid.UUID `json:"owner_id"`
	OwnerName     string     `json:"owner_name"`
	StudentID     *uuid.UUID `json:"student_id"`
	StudentName   string     `json:"student_name"`
	LastInboundAt *time.Time `json:"last_inbound_at"`
	LastMessageAt *time.Time `json:"last_message_at"`
	Unread        int32      `json:"unread"`
	LastBody      string     `json:"last_body"`
	LastKind      string     `json:"last_kind"`
	LastDirection string     `json:"last_direction"`
	CanReply      bool       `json:"can_reply" doc:"Inside the 24-hour window; otherwise send a template"`
}

type WAMessage struct {
	ID           uuid.UUID `json:"id"`
	Direction    string    `json:"direction" enum:"in,out"`
	Kind         string    `json:"kind"`
	Body         string    `json:"body"`
	MediaURL     string    `json:"media_url"`
	MediaMime    string    `json:"media_mime"`
	MediaName    string    `json:"media_name"`
	TemplateName string    `json:"template_name"`
	Status       string    `json:"status"`
	Error        string    `json:"error"`
	SentByName   string    `json:"sent_by_name"`
	CreatedAt    time.Time `json:"created_at"`
}

type WAThread struct {
	Contact  WAContact   `json:"contact"`
	Messages []WAMessage `json:"messages" doc:"Oldest first"`
}

type WATemplateSend struct {
	Name     string   `json:"name" minLength:"1" maxLength:"120"`
	Language string   `json:"language" minLength:"2" maxLength:"10"`
	Params   []string `json:"params,omitempty" maxItems:"10"`
}

type WASendInput struct {
	Text     string          `json:"text,omitempty" maxLength:"4096"`
	Template *WATemplateSend `json:"template,omitempty"`
	UploadID *uuid.UUID      `json:"upload_id,omitempty" doc:"Image or document uploaded with purpose whatsapp"`
	Caption  string          `json:"caption,omitempty" maxLength:"1000"`
}

type WATemplate struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	Language  string    `json:"language"`
	Category  string    `json:"category"`
	Status    string    `json:"status"`
	Body      string    `json:"body"`
	Variables int32     `json:"variables"`
	SyncedAt  time.Time `json:"synced_at"`
}

type WAQuickReply struct {
	ID       uuid.UUID `json:"id"`
	Shortcut string    `json:"shortcut"`
	Body     string    `json:"body"`
}

type WAQuickReplyInput struct {
	Shortcut string `json:"shortcut" minLength:"1" maxLength:"40"`
	Body     string `json:"body" minLength:"1" maxLength:"4096"`
}

type BroadcastAudience struct {
	StageIDs         []uuid.UUID `json:"stage_ids,omitempty" doc:"Leads in these stages"`
	Sources          []string    `json:"sources,omitempty" doc:"Leads from these sources"`
	CourseIDs        []uuid.UUID `json:"course_ids,omitempty" doc:"Leads interested in these courses"`
	Leads            bool        `json:"leads,omitempty" doc:"Include leads (filtered by the fields above)"`
	Students         bool        `json:"students,omitempty" doc:"Include students"`
	StudentCourseIDs []uuid.UUID `json:"student_course_ids,omitempty"`
	StudentBatchIDs  []uuid.UUID `json:"student_batch_ids,omitempty"`
	Phones           []string    `json:"phones,omitempty" maxItems:"5000" doc:"Extra numbers"`
}

type WABroadcastInput struct {
	Name         string            `json:"name" minLength:"2" maxLength:"120"`
	TemplateName string            `json:"template_name" minLength:"1" maxLength:"120"`
	Language     string            `json:"language" minLength:"2" maxLength:"10"`
	Variables    []string          `json:"variables,omitempty" maxItems:"10" doc:"Template params; {{name}} is replaced with the recipient name"`
	Audience     BroadcastAudience `json:"audience"`
}

type WABroadcast struct {
	ID            uuid.UUID         `json:"id"`
	Name          string            `json:"name"`
	TemplateName  string            `json:"template_name"`
	Language      string            `json:"language"`
	Variables     []string          `json:"variables"`
	Audience      BroadcastAudience `json:"audience"`
	Status        string            `json:"status" enum:"queued,sending,done,failed"`
	Total         int32             `json:"total"`
	Sent          int32             `json:"sent"`
	Failed        int32             `json:"failed"`
	CreatedByName string            `json:"created_by_name"`
	CreatedAt     time.Time         `json:"created_at"`
	FinishedAt    *time.Time        `json:"finished_at"`
}
