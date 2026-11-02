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
	"github.com/lms/backend/internal/middleware"
	"github.com/lms/backend/internal/platform/google"
	"github.com/lms/backend/internal/platform/secure"
)

type overviewIn struct {
	Days int `query:"days" default:"30" minimum:"7" maximum:"365"`
}

type auditIn struct {
	dto.PageQuery
	Entity  string `query:"entity" maxLength:"40"`
	Action  string `query:"action" maxLength:"40"`
	ActorID string `query:"actor_id"`
}

func (h *Handler) adminRoutes(api huma.API) {
	t, g := "Admin", h.g
	huma.Register(api, op("analytics-overview", http.MethodGet, "/analytics/overview", t, "Dashboard numbers and charts", g.Perm("analytics", "view")), h.overview)
	huma.Register(api, op("list-audit", http.MethodGet, "/audit", t, "Audit log", g.Perm("audit", "view")), h.audit)
	huma.Register(api, op("get-settings", http.MethodGet, "/settings", t, "Institute settings", g.Perm("settings", "view")), h.getSettings)
	huma.Register(api, op("update-settings", http.MethodPut, "/settings", t, "Update settings", g.Perm("settings", "edit")), h.updateSettings)
	huma.Register(api, op("google-disconnect", http.MethodDelete, "/settings/google", t, "Disconnect the institute Google account", g.Perm("settings", "edit")), h.googleDisconnect)
}

func (h *Handler) overview(ctx context.Context, in *overviewIn) (*Out[dto.Overview], error) {
	return ok(h.s.Analytics.Overview(ctx, in.Days))
}

func (h *Handler) audit(ctx context.Context, in *auditIn) (*Out[dto.List[dto.AuditEntry]], error) {
	aid, err := optID(in.ActorID)
	if err != nil {
		return nil, err
	}
	return ok(h.s.Audit.List(ctx, dto.AuditFilter{PageQuery: in.PageQuery, Entity: in.Entity, Action: in.Action, ActorID: aid}))
}

func (h *Handler) getSettings(ctx context.Context, _ *noInput) (*Out[dto.SettingsView], error) {
	return ok(h.s.Settings.View(ctx), nil)
}

func (h *Handler) updateSettings(ctx context.Context, in *bodyIn[dto.Settings]) (*Out[dto.SettingsView], error) {
	return ok(h.s.Settings.Update(ctx, actor(ctx), in.Body))
}

func (h *Handler) googleDisconnect(ctx context.Context, _ *noInput) (*struct{}, error) {
	return done(h.s.Settings.GoogleDisconnect(ctx, actor(ctx)))
}

// googleConnectRoutes are browser navigations from Settings → "Connect Google".
func (h *Handler) googleConnectRoutes(r chi.Router) {
	back := func(w http.ResponseWriter, r *http.Request, status string) {
		http.Redirect(w, r, h.cfg.AdminAppURL+"/settings?google="+url.QueryEscape(status), http.StatusFound)
	}
	r.Get("/api/v1/settings/google/connect", func(w http.ResponseWriter, r *http.Request) {
		p := middleware.PrincipalFromAnyCookie(r, h.tokens, h.s.Access, auth.AppAdmin)
		if p == nil || !p.Can("settings", "edit") {
			back(w, r, "You need the settings edit permission")
			return
		}
		link, err := h.s.Settings.GoogleConnectURL(r.Context(), h.cfg.JWTSecret, google.State{Purpose: "org", App: auth.AppAdmin, Nonce: p.ID.String() + "." + secure.Token(8), Exp: time.Now().Add(10 * time.Minute).Unix()})
		if err != nil {
			back(w, r, fail(err).Error())
			return
		}
		http.Redirect(w, r, link, http.StatusFound)
	})
	r.Get("/api/v1/settings/google/callback", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		if _, err := h.s.Auth.ParseGoogleState(q.Get("state"), "org"); err != nil || q.Get("error") != "" {
			back(w, r, "Google connection cancelled")
			return
		}
		p := middleware.PrincipalFromAnyCookie(r, h.tokens, h.s.Access, auth.AppAdmin)
		if p == nil || !p.Can("settings", "edit") {
			back(w, r, "Sign in to the admin portal first")
			return
		}
		if err := h.s.Settings.GoogleConnectFinish(r.Context(), p, q.Get("code")); err != nil {
			back(w, r, fail(err).Error())
			return
		}
		back(w, r, "connected")
	})
}
