package handler

import (
	"context"
	"net/http"
	"net/url"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/go-chi/chi/v5"

	"github.com/lms/backend/internal/auth"
	"github.com/lms/backend/internal/dto"
)

type sessionOut struct {
	SetCookie []http.Cookie `header:"Set-Cookie"`
	Body      dto.Me
}

type logoutOut struct {
	SetCookie []http.Cookie `header:"Set-Cookie"`
	Body      dto.OK
}

func (h *Handler) authRoutes(api huma.API) {
	t, g := "Auth", h.g
	huma.Register(api, op("auth-providers", http.MethodGet, "/auth/providers", t, "Available sign-in options"), h.providers)
	huma.Register(api, op("auth-login", http.MethodPost, "/auth/login", t, "Sign in with email and password", g.RateLimit("login", 20, time.Minute)), h.login)
	huma.Register(api, op("auth-register", http.MethodPost, "/auth/register", t, "Student self sign-up", g.RateLimit("register", 10, time.Hour)), h.register)
	huma.Register(api, op("auth-refresh", http.MethodPost, "/auth/refresh", t, "Rotate the refresh token", g.RateLimit("refresh", 120, time.Minute)), h.refresh)
	huma.Register(api, op("auth-logout", http.MethodPost, "/auth/logout", t, "Sign out"), h.logout)
	huma.Register(api, op("auth-me", http.MethodGet, "/auth/me", t, "Current user", g.Auth()), h.me)
	huma.Register(api, op("auth-update-profile", http.MethodPut, "/auth/me", t, "Update own profile", g.Auth()), h.updateProfile)
	huma.Register(api, op("auth-change-password", http.MethodPost, "/auth/change-password", t, "Change own password", g.Auth()), h.changePassword)
	huma.Register(api, op("auth-forgot", http.MethodPost, "/auth/forgot", t, "Email a password reset link", g.RateLimit("forgot", 5, 15*time.Minute)), h.forgot)
	huma.Register(api, op("auth-reset", http.MethodPost, "/auth/reset", t, "Set a new password with a reset token", g.RateLimit("reset", 10, 15*time.Minute)), h.reset)
}

// sessionCookies converts a service session into the two auth cookies.
func (h *Handler) sessionCookies(s dto.Session) []http.Cookie {
	return []http.Cookie{
		h.cookies.Make(auth.AccessCookieName(s.App), s.AccessToken, "/", h.tokens.TTL()),
		h.cookies.Make(auth.RefreshCookieName(s.App), s.RefreshToken, auth.RefreshCookiePath, h.cfg.RefreshTTL),
	}
}

func (h *Handler) session(s dto.Session, err error) (*sessionOut, error) {
	if err != nil {
		return nil, fail(err)
	}
	return &sessionOut{SetCookie: h.sessionCookies(s), Body: s.User}, nil
}

func (h *Handler) providers(ctx context.Context, _ *noInput) (*Out[dto.Providers], error) {
	return ok(h.s.Auth.Providers(ctx), nil)
}

func (h *Handler) login(ctx context.Context, in *bodyIn[dto.LoginInput]) (*sessionOut, error) {
	return h.session(h.s.Auth.Login(ctx, auth.MetaFrom(ctx).App, in.Body))
}

func (h *Handler) register(ctx context.Context, in *bodyIn[dto.RegisterInput]) (*sessionOut, error) {
	return h.session(h.s.Auth.Register(ctx, auth.MetaFrom(ctx).App, in.Body))
}

func (h *Handler) refresh(ctx context.Context, _ *noInput) (*sessionOut, error) {
	m := auth.MetaFrom(ctx)
	return h.session(h.s.Auth.Refresh(ctx, m.App, m.Cookie(auth.RefreshCookieName(m.App))))
}

func (h *Handler) logout(ctx context.Context, _ *noInput) (*logoutOut, error) {
	m := auth.MetaFrom(ctx)
	h.s.Auth.Logout(ctx, m.Cookie(auth.RefreshCookieName(m.App)))
	return &logoutOut{SetCookie: []http.Cookie{
		h.cookies.Make(auth.AccessCookieName(m.App), "", "/", -1),
		h.cookies.Make(auth.RefreshCookieName(m.App), "", auth.RefreshCookiePath, -1),
	}, Body: dto.OK{OK: true}}, nil
}

func (h *Handler) me(ctx context.Context, _ *noInput) (*Out[dto.Me], error) {
	return ok(h.s.Auth.Me(ctx, actor(ctx)))
}

func (h *Handler) updateProfile(ctx context.Context, in *bodyIn[dto.ProfileInput]) (*Out[dto.Me], error) {
	return ok(h.s.Auth.UpdateProfile(ctx, actor(ctx), in.Body))
}

func (h *Handler) changePassword(ctx context.Context, in *bodyIn[dto.ChangePasswordInput]) (*Out[dto.OK], error) {
	return ack(h.s.Auth.ChangePassword(ctx, actor(ctx), in.Body), "password changed")
}

func (h *Handler) forgot(ctx context.Context, in *bodyIn[dto.ForgotInput]) (*Out[dto.OK], error) {
	return ack(h.s.Auth.Forgot(ctx, auth.MetaFrom(ctx).App, in.Body.Email), "if the email exists, a reset link has been sent")
}

func (h *Handler) reset(ctx context.Context, in *bodyIn[dto.ResetInput]) (*Out[dto.OK], error) {
	return ack(h.s.Auth.Reset(ctx, in.Body), "password updated, sign in with the new password")
}

// ── Google sign-in redirects (browser navigations, not JSON) ──

func (h *Handler) authRedirects(r chi.Router) {
	r.Get("/api/v1/auth/google/start", func(w http.ResponseWriter, r *http.Request) {
		app := r.URL.Query().Get("app")
		if app != auth.AppAdmin {
			app = auth.AppStudent
		}
		link, err := h.s.Auth.GoogleLoginURL(app)
		if err != nil {
			http.Redirect(w, r, h.s.Auth.AppURL(app)+"/login?error="+url.QueryEscape(err.Error()), http.StatusFound)
			return
		}
		http.Redirect(w, r, link, http.StatusFound)
	})
	r.Get("/api/v1/auth/google/callback", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		st, err := h.s.Auth.ParseGoogleState(q.Get("state"), "login")
		if err != nil {
			http.Redirect(w, r, h.cfg.StudentAppURL+"/login?error="+url.QueryEscape("Google sign-in failed, try again"), http.StatusFound)
			return
		}
		back := h.s.Auth.AppURL(st.App)
		if q.Get("error") != "" {
			http.Redirect(w, r, back+"/login?error="+url.QueryEscape("Google sign-in was cancelled"), http.StatusFound)
			return
		}
		sess, err := h.s.Auth.GoogleLogin(r.Context(), st.App, q.Get("code"))
		if err != nil {
			http.Redirect(w, r, back+"/login?error="+url.QueryEscape(fail(err).Error()), http.StatusFound)
			return
		}
		for _, c := range h.sessionCookies(sess) {
			c := c
			http.SetCookie(w, &c)
		}
		dest := "/learn"
		if st.App == auth.AppAdmin {
			dest = "/dashboard"
		}
		http.Redirect(w, r, back+dest, http.StatusFound)
	})
}
