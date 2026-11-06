package handler

import (
	"net/http"
	"net/url"

	"github.com/go-chi/chi/v5"

	"github.com/lms/backend/internal/auth"
	"github.com/lms/backend/internal/dto"
)

// sessionCookies converts a service session into the two auth cookies.
func (h *Handler) sessionCookies(s dto.Session) []http.Cookie {
	return h.cookies.Session(s.App, s.AccessToken, s.RefreshToken, h.tokens.TTL(), h.cfg.RefreshTTL)
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
