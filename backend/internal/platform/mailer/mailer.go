// Package mailer sends transactional email (password reset, invites) over SMTP.
package mailer

import (
	"fmt"
	"log/slog"
	"net/smtp"
	"strings"
	"time"

	"github.com/lms/backend/internal/config"
)

type Mailer struct {
	cfg *config.Config
}

func New(cfg *config.Config) *Mailer { return &Mailer{cfg: cfg} }

// Send delivers an HTML email. Failures are logged and returned.
func (m *Mailer) Send(to, subject, html string) error {
	addr := fmt.Sprintf("%s:%d", m.cfg.SMTPHost, m.cfg.SMTPPort)
	var auth smtp.Auth
	if m.cfg.SMTPUser != "" {
		auth = smtp.PlainAuth("", m.cfg.SMTPUser, m.cfg.SMTPPass, m.cfg.SMTPHost)
	}
	var b strings.Builder
	fmt.Fprintf(&b, "From: %s\r\n", m.cfg.SMTPFrom)
	fmt.Fprintf(&b, "To: %s\r\n", to)
	fmt.Fprintf(&b, "Subject: %s\r\n", subject)
	fmt.Fprintf(&b, "Date: %s\r\n", time.Now().Format(time.RFC1123Z))
	b.WriteString("MIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n")
	b.WriteString(html)
	from := m.cfg.SMTPFrom
	if i := strings.Index(from, "<"); i >= 0 {
		from = strings.Trim(from[i:], "<>")
	}
	err := smtp.SendMail(addr, auth, from, []string{to}, []byte(b.String()))
	if err != nil {
		slog.Error("mail send failed", "to", to, "subject", subject, "err", err)
	}
	return err
}

// SendAsync sends without blocking the request.
func (m *Mailer) SendAsync(to, subject, html string) {
	go func() { _ = m.Send(to, subject, html) }()
}

// Layout wraps body HTML in a simple branded template.
func Layout(brand, title, body string) string {
	return fmt.Sprintf(`<!doctype html><html><body style="margin:0;background:#f4f4f7;font-family:Arial,sans-serif">
<table width="100%%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 12px">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;padding:32px">
<tr><td style="font-size:20px;font-weight:bold;color:#4f46e5;padding-bottom:16px">%s</td></tr>
<tr><td style="font-size:18px;font-weight:bold;color:#111;padding-bottom:12px">%s</td></tr>
<tr><td style="font-size:15px;line-height:1.6;color:#333">%s</td></tr>
</table></td></tr></table></body></html>`, brand, title, body)
}

// Button renders a call-to-action link styled as a button.
func Button(href, label string) string {
	return fmt.Sprintf(`<a href="%s" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">%s</a>`, href, label)
}
