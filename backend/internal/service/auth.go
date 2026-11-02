package service

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/lms/backend/internal/apperr"
	"github.com/lms/backend/internal/auth"
	"github.com/lms/backend/internal/dto"
	"github.com/lms/backend/internal/platform/google"
	"github.com/lms/backend/internal/platform/mailer"
	"github.com/lms/backend/internal/platform/secure"
	"github.com/lms/backend/internal/repository"
)

// AuthService handles sign-in, sessions (refresh-token rotation), profile and password reset.
type AuthService struct{ base }

// dummyHash keeps login timing similar when the email does not exist.
const dummyHash = "$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0c2FsdA$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2g"

func (s *AuthService) Providers(ctx context.Context) dto.Providers {
	return dto.Providers{Google: s.Google.Enabled(), Signup: s.settings.Get(ctx).Signup.Enabled}
}

func (s *AuthService) Login(ctx context.Context, app string, in dto.LoginInput) (dto.Session, error) {
	u, err := s.Q.GetUserByEmail(ctx, in.Email)
	if err != nil || u.PasswordHash == nil || !secure.VerifyPassword(in.Password, *u.PasswordHash) {
		if err != nil {
			secure.VerifyPassword(in.Password, dummyHash)
		}
		return dto.Session{}, apperr.Unauthorized("wrong email or password")
	}
	if err := checkPortal(u, app); err != nil {
		return dto.Session{}, err
	}
	return s.startSession(ctx, u, app)
}

func checkPortal(u repository.User, app string) error {
	if u.Status != "active" {
		return apperr.Forbidden("your account is disabled, contact the admin")
	}
	if u.Kind != auth.KindForApp(app) {
		if u.Kind == auth.KindStaff {
			return apperr.Forbidden("staff accounts sign in on the admin portal")
		}
		return apperr.Forbidden("student accounts sign in on the student portal")
	}
	return nil
}

func (s *AuthService) Register(ctx context.Context, app string, in dto.RegisterInput) (dto.Session, error) {
	if app != auth.AppStudent || !s.settings.Get(ctx).Signup.Enabled {
		return dto.Session{}, apperr.Forbidden("sign-up is closed, ask the admin to create your account")
	}
	hash, err := secure.HashPassword(in.Password)
	if err != nil {
		return dto.Session{}, apperr.Internal(err)
	}
	u, err := s.Q.CreateUser(ctx, repository.CreateUserParams{Kind: auth.KindStudent, Email: strings.TrimSpace(in.Email), PasswordHash: &hash,
		Name: strings.TrimSpace(in.Name), Phone: optStr(in.Phone), Status: "active"})
	if err != nil {
		return dto.Session{}, dbErr(err, "an account with this email")
	}
	s.audit.Log(ctx, nil, "register", "student", u.ID, map[string]string{"email": u.Email})
	return s.startSession(ctx, u, auth.AppStudent)
}

// startSession issues a new access token and refresh token for the user.
func (s *AuthService) startSession(ctx context.Context, u repository.User, app string) (dto.Session, error) {
	meta := auth.MetaFrom(ctx)
	access, err := s.Tokens.Issue(u.ID, u.Kind, app)
	if err != nil {
		return dto.Session{}, apperr.Internal(err)
	}
	refresh := secure.Token(32)
	ua := meta.UserAgent
	if len(ua) > 300 {
		ua = ua[:300]
	}
	if _, err := s.Q.CreateRefreshToken(ctx, repository.CreateRefreshTokenParams{UserID: u.ID, TokenHash: secure.HashToken(refresh), App: app,
		UserAgent: ua, Ip: meta.IP, ExpiresAt: time.Now().Add(s.Cfg.RefreshTTL)}); err != nil {
		return dto.Session{}, dbErr(err, "session")
	}
	_ = s.Q.TouchLogin(ctx, u.ID)
	me, err := s.me(ctx, u, app)
	if err != nil {
		return dto.Session{}, err
	}
	return dto.Session{User: me, App: app, AccessToken: access, RefreshToken: refresh}, nil
}

// Refresh rotates the refresh token. Reusing an old token ends every session of the user.
func (s *AuthService) Refresh(ctx context.Context, app, refreshToken string) (dto.Session, error) {
	expired := apperr.Unauthorized("session expired, sign in again")
	if refreshToken == "" {
		return dto.Session{}, expired
	}
	rt, err := s.Q.GetRefreshToken(ctx, secure.HashToken(refreshToken))
	if err != nil {
		return dto.Session{}, expired
	}
	if rt.RevokedAt != nil {
		_ = s.Q.RevokeAllUserTokens(ctx, rt.UserID)
		slog.Warn("refresh token reuse detected", "user", rt.UserID)
		return dto.Session{}, expired
	}
	if time.Now().After(rt.ExpiresAt) || rt.App != app {
		return dto.Session{}, expired
	}
	u, err := s.Q.GetUserByID(ctx, rt.UserID)
	if err != nil || u.Status != "active" {
		return dto.Session{}, apperr.Unauthorized("account unavailable")
	}
	if err := s.Q.RevokeRefreshToken(ctx, rt.ID); err != nil {
		return dto.Session{}, dbErr(err, "session")
	}
	s.access.Invalidate(&u.ID)
	return s.startSession(ctx, u, app)
}

func (s *AuthService) Logout(ctx context.Context, refreshToken string) {
	if refreshToken == "" {
		return
	}
	if rt, err := s.Q.GetRefreshToken(ctx, secure.HashToken(refreshToken)); err == nil {
		_ = s.Q.RevokeRefreshToken(ctx, rt.ID)
	}
}

func (s *AuthService) me(ctx context.Context, u repository.User, app string) (dto.Me, error) {
	p, err := s.access.Load(ctx, u.ID, app)
	if err != nil {
		return dto.Me{}, apperr.Unauthorized("account unavailable")
	}
	return dto.Me{ID: u.ID, Kind: u.Kind, Name: u.Name, Email: u.Email, Phone: str(u.Phone), AvatarURL: str(u.AvatarUrl), Bio: str(u.Bio),
		StudentCode: str(u.StudentCode), IsSuperAdmin: u.IsSuperAdmin, Scoped: p.Scoped && !p.Super, Permissions: p.PermissionList(), App: app}, nil
}

func (s *AuthService) Me(ctx context.Context, actor *auth.Principal) (dto.Me, error) {
	u, err := s.Q.GetUserByID(ctx, actor.ID)
	if err != nil {
		return dto.Me{}, dbErr(err, "user")
	}
	return s.me(ctx, u, actor.App)
}

func (s *AuthService) UpdateProfile(ctx context.Context, actor *auth.Principal, in dto.ProfileInput) (dto.Me, error) {
	u, err := s.Q.UpdateOwnProfile(ctx, repository.UpdateOwnProfileParams{ID: actor.ID, Name: strings.TrimSpace(in.Name), Phone: optStr(in.Phone),
		AvatarUrl: optStr(in.AvatarURL), Bio: optStr(in.Bio)})
	if err != nil {
		return dto.Me{}, dbErr(err, "user")
	}
	s.access.Invalidate(&actor.ID)
	return s.me(ctx, u, actor.App)
}

func (s *AuthService) ChangePassword(ctx context.Context, actor *auth.Principal, in dto.ChangePasswordInput) error {
	u, err := s.Q.GetUserByID(ctx, actor.ID)
	if err != nil {
		return dbErr(err, "user")
	}
	if u.PasswordHash != nil && !secure.VerifyPassword(in.CurrentPassword, *u.PasswordHash) {
		return apperr.Invalid("current password is wrong")
	}
	hash, err := secure.HashPassword(in.NewPassword)
	if err != nil {
		return apperr.Internal(err)
	}
	if err := s.Q.SetUserPassword(ctx, repository.SetUserPasswordParams{ID: actor.ID, PasswordHash: &hash}); err != nil {
		return dbErr(err, "user")
	}
	s.audit.Log(ctx, actor, "change_password", "user", actor.ID, nil)
	return nil
}

// Forgot emails a one-hour reset link. It never reveals whether the email exists.
func (s *AuthService) Forgot(ctx context.Context, app, email string) error {
	u, err := s.Q.GetUserByEmail(ctx, email)
	if err != nil || u.Status != "active" {
		return nil
	}
	token := secure.Token(32)
	if err := s.Q.CreatePasswordReset(ctx, repository.CreatePasswordResetParams{TokenHash: secure.HashToken(token), UserID: u.ID, ExpiresAt: time.Now().Add(time.Hour)}); err != nil {
		return dbErr(err, "reset")
	}
	base := s.Cfg.StudentAppURL
	if u.Kind == auth.KindStaff || app == auth.AppAdmin {
		base = s.Cfg.AdminAppURL
	}
	link := fmt.Sprintf("%s/reset-password?token=%s", base, url.QueryEscape(token))
	brand := s.settings.Get(ctx).Branding.Name
	s.Mail.SendAsync(u.Email, brand+" password reset", mailer.Layout(brand, "Reset your password", fmt.Sprintf(
		`Hi %s,<br><br>Click the button below to choose a new password. The link works for 1 hour.<br><br>%s<br><br>If you did not ask for this, ignore this email.`,
		u.Name, mailer.Button(link, "Reset password"))))
	return nil
}

func (s *AuthService) Reset(ctx context.Context, in dto.ResetInput) error {
	pr, err := s.Q.GetPasswordReset(ctx, secure.HashToken(in.Token))
	if err != nil || pr.UsedAt != nil || time.Now().After(pr.ExpiresAt) {
		return apperr.Invalid("this reset link is invalid or expired")
	}
	hash, err := secure.HashPassword(in.Password)
	if err != nil {
		return apperr.Internal(err)
	}
	return dbErr(s.tx(ctx, func(q *repository.Queries) error {
		if err := q.SetUserPassword(ctx, repository.SetUserPasswordParams{ID: pr.UserID, PasswordHash: &hash}); err != nil {
			return err
		}
		if err := q.UsePasswordReset(ctx, pr.TokenHash); err != nil {
			return err
		}
		return q.RevokeAllUserTokens(ctx, pr.UserID)
	}), "reset")
}

// Cleanup removes long-expired refresh tokens (run by the scheduler).
func (s *AuthService) Cleanup(ctx context.Context) error { return s.Q.DeleteExpiredTokens(ctx) }

// ── Google sign-in ──

// AppURL returns the frontend base URL for a portal.
func (s *AuthService) AppURL(app string) string {
	if app == auth.AppAdmin {
		return s.Cfg.AdminAppURL
	}
	return s.Cfg.StudentAppURL
}

// GoogleLoginURL returns the Google consent URL for a portal.
func (s *AuthService) GoogleLoginURL(app string) (string, error) {
	if !s.Google.Enabled() {
		return "", apperr.Unavailable("Google sign-in is not configured")
	}
	st := google.SignState(s.Cfg.JWTSecret, google.State{Purpose: "login", App: app, Nonce: secure.Token(12), Exp: time.Now().Add(10 * time.Minute).Unix()})
	return s.Google.LoginConfig().AuthCodeURL(st), nil
}

// ParseGoogleState validates the OAuth state and returns the portal it was started from.
func (s *AuthService) ParseGoogleState(raw, purpose string) (google.State, error) {
	st, err := google.ParseState(s.Cfg.JWTSecret, raw)
	if err != nil || st.Purpose != purpose {
		return st, apperr.Invalid("Google sign-in failed, try again")
	}
	return st, nil
}

// GoogleLogin finishes the OAuth flow: finds/links/creates the user and starts a session.
func (s *AuthService) GoogleLogin(ctx context.Context, app, code string) (dto.Session, error) {
	cfg := s.Google.LoginConfig()
	tok, err := cfg.Exchange(ctx, code)
	if err != nil {
		return dto.Session{}, apperr.Invalid("Google sign-in failed, try again")
	}
	info, err := google.FetchUserInfo(ctx, cfg.Client(ctx, tok))
	if err != nil || info.Email == "" || !info.EmailVerified {
		return dto.Session{}, apperr.Invalid("your Google email is not verified")
	}
	u, err := s.Q.GetUserByGoogleID(ctx, &info.Sub)
	if errors.Is(err, pgx.ErrNoRows) {
		u, err = s.Q.GetUserByEmail(ctx, info.Email)
		if errors.Is(err, pgx.ErrNoRows) {
			if app != auth.AppStudent || !s.settings.Get(ctx).Signup.Enabled {
				return dto.Session{}, apperr.NotFound("an account for " + info.Email)
			}
			u, err = s.Q.CreateUser(ctx, repository.CreateUserParams{Kind: auth.KindStudent, Email: info.Email, Name: orDefault(info.Name, info.Email), Status: "active"})
		}
		if err == nil {
			err = s.Q.LinkGoogle(ctx, repository.LinkGoogleParams{ID: u.ID, GoogleID: &info.Sub, AvatarUrl: optStr(info.Picture)})
		}
	}
	if err != nil {
		return dto.Session{}, dbErr(err, "user")
	}
	if err := checkPortal(u, app); err != nil {
		return dto.Session{}, err
	}
	return s.startSession(ctx, u, app)
}

// sendInvite emails a 72-hour "set your password" link (used for staff and students).
func (b base) sendInvite(ctx context.Context, u repository.User, appURL string) {
	token := secure.Token(32)
	if err := b.Q.CreatePasswordReset(ctx, repository.CreatePasswordResetParams{TokenHash: secure.HashToken(token), UserID: u.ID, ExpiresAt: time.Now().Add(72 * time.Hour)}); err != nil {
		slog.Error("invite token", "err", err)
		return
	}
	brand := b.settings.Get(ctx).Branding.Name
	link := fmt.Sprintf("%s/reset-password?invite=1&token=%s", appURL, url.QueryEscape(token))
	b.Mail.SendAsync(u.Email, "You're invited to "+brand, mailer.Layout(brand, "Welcome, "+u.Name, fmt.Sprintf(
		`An account was created for you on %s.<br><br>Your login email is <b>%s</b>. Set your password with the button below (valid for 3 days).<br><br>%s`,
		brand, u.Email, mailer.Button(link, "Set my password"))))
}
