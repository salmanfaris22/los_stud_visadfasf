package service

import (
	"context"
	"encoding/json"
	"log/slog"
	"regexp"
	"strings"
	"time"

	"github.com/lms/backend/internal/apperr"
	"github.com/lms/backend/internal/auth"
	"github.com/lms/backend/internal/dto"
	"github.com/lms/backend/internal/platform/secure"
	"github.com/lms/backend/internal/repository"
)

type Settings = dto.Settings

// SettingsService reads/writes institute settings (branding, Google, uploads, signup).
type SettingsService struct {
	deps  *Deps
	cache *ttlCache[*Settings]
	sales *ttlCache[*dto.SalesSettings]
	wa    *ttlCache[*WAConn]
	audit *AuditService
}

// Get returns defaults merged with stored rows, cached briefly.
func (s *SettingsService) Get(ctx context.Context) Settings {
	if v, ok := s.cache.Get("all"); ok {
		return *v
	}
	out := dto.DefaultSettings()
	rows, err := s.deps.Q.ListSettings(ctx)
	if err != nil {
		slog.Error("load settings", "err", err)
		return out
	}
	for _, r := range rows {
		var target any
		switch r.Key {
		case "branding":
			target = &out.Branding
		case "google":
			target = &out.Google
		case "uploads":
			target = &out.Uploads
		case "signup":
			target = &out.Signup
		default:
			continue
		}
		_ = json.Unmarshal(r.Value, target)
	}
	s.cache.Set("all", &out)
	return out
}

// View returns settings plus Google connection status for the admin page.
func (s *SettingsService) View(ctx context.Context) dto.SettingsView {
	v := dto.SettingsView{Settings: s.Get(ctx), Google: dto.GoogleStatus{Configured: s.deps.Google.Enabled()}}
	if t, err := s.deps.Q.GetGoogleToken(ctx, orgTokenOwner); err == nil {
		v.Google.Connected, v.Google.Email, v.Google.Scopes = true, t.Email, t.Scopes
	}
	return v
}

// Update stores all setting groups.
func (s *SettingsService) Update(ctx context.Context, actor *auth.Principal, in dto.Settings) (dto.SettingsView, error) {
	groups := map[string]any{"branding": in.Branding, "google": in.Google, "uploads": in.Uploads, "signup": in.Signup}
	for k, v := range groups {
		raw, _ := json.Marshal(v)
		if err := s.deps.Q.UpsertSetting(ctx, repository.UpsertSettingParams{Key: k, Value: raw}); err != nil {
			return dto.SettingsView{}, dbErr(err, "settings")
		}
	}
	s.cache.Clear()
	if s.audit != nil {
		s.audit.Log(ctx, actor, "update", "settings", "", in)
	}
	return s.View(ctx), nil
}

// ── Sales & accounts settings ──

// Sales returns business, payment, CRM and reminder settings (defaults merged, cached).
func (s *SettingsService) Sales(ctx context.Context) dto.SalesSettings {
	if v, ok := s.sales.Get("sales"); ok {
		return *v
	}
	out := dto.DefaultSalesSettings()
	rows, err := s.deps.Q.ListSettings(ctx)
	if err != nil {
		slog.Error("load sales settings", "err", err)
		return out
	}
	for _, r := range rows {
		var target any
		switch r.Key {
		case "business":
			target = &out.Business
		case "payments":
			target = &out.Payments
		case "crm":
			target = &out.CRM
		case "reminders":
			target = &out.Reminders
		default:
			continue
		}
		_ = json.Unmarshal(r.Value, target)
	}
	if out.CRM.WebhookToken == "" { // first use: create the secret for the generic lead webhook
		out.CRM.WebhookToken = secure.Token(24)
		raw, _ := json.Marshal(out.CRM)
		_ = s.deps.Q.UpsertSetting(ctx, repository.UpsertSettingParams{Key: "crm", Value: raw})
	}
	if out.Business.Timezone == "" {
		out.Business.Timezone = "Asia/Kolkata"
	}
	s.sales.Set("sales", &out)
	return out
}

// UpdateSales stores the sales settings. The webhook token is kept (rotate it separately).
func (s *SettingsService) UpdateSales(ctx context.Context, actor *auth.Principal, in dto.SalesSettings) (dto.SalesSettings, error) {
	cur := s.Sales(ctx)
	in.CRM.WebhookToken = cur.CRM.WebhookToken
	if _, err := time.LoadLocation(orDefault(in.Business.Timezone, "Asia/Kolkata")); err != nil {
		return dto.SalesSettings{}, apperr.Invalid("unknown time zone %q", in.Business.Timezone)
	}
	in.Business.GSTIN = strings.ToUpper(strings.TrimSpace(in.Business.GSTIN))
	if in.Business.GSTIN != "" && !gstinRe.MatchString(in.Business.GSTIN) {
		return dto.SalesSettings{}, apperr.Invalid("GSTIN should be 15 characters, like 32ABCDE1234F1Z5")
	}
	for k, v := range map[string]any{"business": in.Business, "payments": in.Payments, "crm": in.CRM, "reminders": in.Reminders} {
		raw, _ := json.Marshal(v)
		if err := s.deps.Q.UpsertSetting(ctx, repository.UpsertSettingParams{Key: k, Value: raw}); err != nil {
			return dto.SalesSettings{}, dbErr(err, "settings")
		}
	}
	s.sales.Clear()
	if s.audit != nil {
		s.audit.Log(ctx, actor, "update", "sales_settings", "", in)
	}
	return s.Sales(ctx), nil
}

// RotateWebhookToken issues a new secret for the generic lead webhook URL.
func (s *SettingsService) RotateWebhookToken(ctx context.Context, actor *auth.Principal) (dto.SalesSettings, error) {
	cur := s.Sales(ctx)
	cur.CRM.WebhookToken = secure.Token(24)
	raw, _ := json.Marshal(cur.CRM)
	if err := s.deps.Q.UpsertSetting(ctx, repository.UpsertSettingParams{Key: "crm", Value: raw}); err != nil {
		return dto.SalesSettings{}, dbErr(err, "settings")
	}
	s.sales.Clear()
	if s.audit != nil {
		s.audit.Log(ctx, actor, "rotate", "webhook_token", "", nil)
	}
	return s.Sales(ctx), nil
}

// Location is the institute's time zone (due dates, "today", month boundaries).
func (s *SettingsService) Location(ctx context.Context) *time.Location {
	loc, err := time.LoadLocation(s.Sales(ctx).Business.Timezone)
	if err != nil {
		return time.UTC
	}
	return loc
}

var gstinRe = regexp.MustCompile(`^[0-9]{2}[A-Z0-9]{10}[0-9A-Z]Z[0-9A-Z]$`)

// ── WhatsApp connection (secrets encrypted at rest) ──

type waStored struct {
	Enabled        bool    `json:"enabled"`
	PhoneNumberID  string  `json:"phone_number_id"`
	WABAID         string  `json:"waba_id"`
	VerifyToken    string  `json:"verify_token"`
	TokenEnc       []byte  `json:"token_enc,omitempty"`
	SecretEnc      []byte  `json:"secret_enc,omitempty"`
	WelcomeMessage string  `json:"welcome_message"`
	AwayMessage    string  `json:"away_message"`
	HoursStart     int32   `json:"hours_start"`
	HoursEnd       int32   `json:"hours_end"`
	Days           []int32 `json:"days"`
}

// WAConn is the decrypted WhatsApp configuration used by the service.
type WAConn struct {
	waStored
	Token     string
	AppSecret string
}

// Ready reports whether messages can be sent.
func (c WAConn) Ready() bool { return c.Enabled && c.Token != "" && c.PhoneNumberID != "" }

func (s *SettingsService) WhatsApp(ctx context.Context) WAConn {
	if v, ok := s.wa.Get("wa"); ok {
		return *v
	}
	c := WAConn{waStored: waStored{HoursStart: 9, HoursEnd: 19, Days: []int32{1, 2, 3, 4, 5, 6}}}
	if raw, err := s.deps.Q.GetSetting(ctx, "whatsapp"); err == nil {
		_ = json.Unmarshal(raw, &c.waStored)
		if len(c.TokenEnc) > 0 {
			if b, err := secure.Decrypt(s.deps.Cfg.EncryptionKey, c.TokenEnc); err == nil {
				c.Token = string(b)
			}
		}
		if len(c.SecretEnc) > 0 {
			if b, err := secure.Decrypt(s.deps.Cfg.EncryptionKey, c.SecretEnc); err == nil {
				c.AppSecret = string(b)
			}
		}
	}
	s.wa.Set("wa", &c)
	return c
}

func (s *SettingsService) WhatsAppView(ctx context.Context) dto.WAConfig {
	c := s.WhatsApp(ctx)
	days := c.Days
	if days == nil {
		days = []int32{}
	}
	return dto.WAConfig{Enabled: c.Enabled, PhoneNumberID: c.PhoneNumberID, WABAID: c.WABAID, VerifyToken: c.VerifyToken,
		TokenSet: c.Token != "", AppSecretSet: c.AppSecret != "", WelcomeMessage: c.WelcomeMessage, AwayMessage: c.AwayMessage,
		HoursStart: c.HoursStart, HoursEnd: c.HoursEnd, Days: days, WebhookURL: s.deps.Cfg.APIPublicURL + "/api/v1/webhooks/meta"}
}

func (s *SettingsService) UpdateWhatsApp(ctx context.Context, actor *auth.Principal, in dto.WAConfigInput) (dto.WAConfig, error) {
	cur := s.WhatsApp(ctx)
	st := waStored{Enabled: in.Enabled, PhoneNumberID: strings.TrimSpace(in.PhoneNumberID), WABAID: strings.TrimSpace(in.WABAID),
		VerifyToken: strings.TrimSpace(in.VerifyToken), TokenEnc: cur.TokenEnc, SecretEnc: cur.SecretEnc,
		WelcomeMessage: strings.TrimSpace(in.WelcomeMessage), AwayMessage: strings.TrimSpace(in.AwayMessage),
		HoursStart: in.HoursStart, HoursEnd: in.HoursEnd, Days: in.Days}
	if st.HoursEnd <= st.HoursStart {
		return dto.WAConfig{}, apperr.Invalid("office hours must end after they start")
	}
	if st.VerifyToken == "" {
		st.VerifyToken = secure.Token(16)
	}
	var err error
	if t := strings.TrimSpace(in.AccessToken); t != "" {
		if st.TokenEnc, err = secure.Encrypt(s.deps.Cfg.EncryptionKey, []byte(t)); err != nil {
			return dto.WAConfig{}, apperr.Internal(err)
		}
	}
	if t := strings.TrimSpace(in.AppSecret); t != "" {
		if st.SecretEnc, err = secure.Encrypt(s.deps.Cfg.EncryptionKey, []byte(t)); err != nil {
			return dto.WAConfig{}, apperr.Internal(err)
		}
	}
	if st.Enabled && (len(st.TokenEnc) == 0 || st.PhoneNumberID == "") {
		return dto.WAConfig{}, apperr.Invalid("add the phone number ID and access token before turning WhatsApp on")
	}
	raw, _ := json.Marshal(st)
	if err := s.deps.Q.UpsertSetting(ctx, repository.UpsertSettingParams{Key: "whatsapp", Value: raw}); err != nil {
		return dto.WAConfig{}, dbErr(err, "settings")
	}
	s.wa.Clear()
	if s.audit != nil {
		s.audit.Log(ctx, actor, "update", "whatsapp_settings", "", map[string]any{"enabled": st.Enabled, "phone_number_id": st.PhoneNumberID})
	}
	return s.WhatsAppView(ctx), nil
}
