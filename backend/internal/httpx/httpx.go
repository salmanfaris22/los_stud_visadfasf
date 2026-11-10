// Package httpx holds the few routes that must stay plain HTTP: browser redirects for Google
// sign-in and Google connect (their paths are registered in Google Cloud Console) and file
// downloads used by <img src> and "open in new tab" links. Everything else is gRPC (internal/rpc).
package httpx

import (
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/lms/backend/internal/apperr"
	"github.com/lms/backend/internal/auth"
	"github.com/lms/backend/internal/config"
	"github.com/lms/backend/internal/middleware"
	"github.com/lms/backend/internal/platform/google"
	"github.com/lms/backend/internal/platform/secure"
	"github.com/lms/backend/internal/service"
)

type routes struct {
	s       *service.Services
	cfg     *config.Config
	tokens  *auth.Tokens
	cookies auth.CookieFactory
}

// Register mounts the plain-HTTP routes.
func Register(r chi.Router, s *service.Services, d *service.Deps) {
	h := &routes{s: s, cfg: d.Cfg, tokens: d.Tokens, cookies: d.Cookies}
	r.Get("/api/v1/auth/google/start", h.googleStart)
	r.Get("/api/v1/auth/google/callback", h.googleCallback)
	r.Get("/api/v1/settings/google/connect", h.googleConnect)
	r.Get("/api/v1/settings/google/callback", h.googleConnectCallback)
	r.Get("/api/v1/files/{id}", h.file)
}

// message is the user-facing text of a service error.
func message(err error) string {
	var ae *apperr.Error
	if errors.As(err, &ae) && ae.Kind != apperr.KindInternal {
		return ae.Message
	}
	slog.Error("request failed", "err", err)
	return "something went wrong, please try again"
}

func status(err error) int {
	switch apperr.KindOf(err) {
	case apperr.KindInvalid:
		return http.StatusUnprocessableEntity
	case apperr.KindUnauthorized:
		return http.StatusUnauthorized
	case apperr.KindForbidden:
		return http.StatusForbidden
	case apperr.KindNotFound:
		return http.StatusNotFound
	case apperr.KindConflict:
		return http.StatusConflict
	case apperr.KindRateLimited:
		return http.StatusTooManyRequests
	case apperr.KindUnavailable:
		return http.StatusServiceUnavailable
	}
	return http.StatusInternalServerError
}

// ── Google sign-in ──

func (h *routes) googleStart(w http.ResponseWriter, r *http.Request) {
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
}

func (h *routes) googleCallback(w http.ResponseWriter, r *http.Request) {
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
		http.Redirect(w, r, back+"/login?error="+url.QueryEscape(message(err)), http.StatusFound)
		return
	}
	for _, c := range h.cookies.Session(sess.App, sess.AccessToken, sess.RefreshToken, h.tokens.TTL(), h.cfg.RefreshTTL) {
		http.SetCookie(w, &c)
	}
	dest := "/learn"
	if st.App == auth.AppAdmin {
		dest = "/dashboard"
	}
	http.Redirect(w, r, back+dest, http.StatusFound)
}

// ── Settings → "Connect Google" ──

func (h *routes) settingsBack(w http.ResponseWriter, r *http.Request, status string) {
	http.Redirect(w, r, h.cfg.AdminAppURL+"/settings?google="+url.QueryEscape(status), http.StatusFound)
}

func (h *routes) googleConnect(w http.ResponseWriter, r *http.Request) {
	p := middleware.PrincipalFromAnyCookie(r, h.tokens, h.s.Access, auth.AppAdmin)
	if p == nil || !p.Can("settings", "edit") {
		h.settingsBack(w, r, "You need the settings edit permission")
		return
	}
	link, err := h.s.Settings.GoogleConnectURL(r.Context(), h.cfg.JWTSecret, google.State{Purpose: "org", App: auth.AppAdmin, Nonce: p.ID.String() + "." + secure.Token(8), Exp: time.Now().Add(10 * time.Minute).Unix()})
	if err != nil {
		h.settingsBack(w, r, message(err))
		return
	}
	http.Redirect(w, r, link, http.StatusFound)
}

func (h *routes) googleConnectCallback(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	if _, err := h.s.Auth.ParseGoogleState(q.Get("state"), "org"); err != nil || q.Get("error") != "" {
		h.settingsBack(w, r, "Google connection cancelled")
		return
	}
	p := middleware.PrincipalFromAnyCookie(r, h.tokens, h.s.Access, auth.AppAdmin)
	if p == nil || !p.Can("settings", "edit") {
		h.settingsBack(w, r, "Sign in to the admin portal first")
		return
	}
	if err := h.s.Settings.GoogleConnectFinish(r.Context(), p, q.Get("code")); err != nil {
		h.settingsBack(w, r, message(err))
		return
	}
	h.settingsBack(w, r, "connected")
}

// ── files ──

// file is an access-checked redirect to a short-lived signed storage URL.
func (h *routes) file(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.NotFound(w, r)
		return
	}
	p := auth.FromContext(r.Context())
	if p == nil { // links opened in a new tab carry cookies but not the X-LMS-App header
		p = middleware.PrincipalFromAnyCookie(r, h.tokens, h.s.Access, "")
	}
	link, public, err := h.s.Uploads.DownloadURL(r.Context(), p, id, r.URL.Query().Get("download") == "1")
	if err != nil {
		http.Error(w, message(err), status(err))
		return
	}
	if public {
		w.Header().Set("Cache-Control", "public, max-age=3600")
	} else {
		w.Header().Set("Cache-Control", "private, no-store")
	}
	http.Redirect(w, r, link, http.StatusFound)
}
