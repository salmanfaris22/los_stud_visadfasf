// Package server wires infrastructure, services, middleware and handlers into one http.Handler.
package server

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humachi"
	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"

	"github.com/lms/backend/internal/handler"
	"github.com/lms/backend/internal/middleware"
	"github.com/lms/backend/internal/service"
)

type App struct {
	Router   http.Handler
	API      huma.API
	Services *service.Services
}

// New builds the HTTP application. Deps may have nil infrastructure (used for OpenAPI generation).
func New(d *service.Deps) *App {
	huma.DefaultArrayNullable = false
	svcs := service.New(d)

	r := chi.NewMux()
	r.Use(chimw.RequestID)
	if d.Cfg.TrustProxy {
		r.Use(chimw.RealIP)
	}
	r.Use(chimw.Recoverer, middleware.SecurityHeaders, middleware.Logger,
		middleware.CORS(d.Cfg.AdminAppURL, d.Cfg.StudentAppURL),
		middleware.Authenticate(d.Tokens, svcs.Access),
		chimw.Compress(5, "application/json", "text/csv", "text/calendar"))
	r.Get("/healthz", health(d))

	cfg := huma.DefaultConfig("LMS API", "1.0.0")
	cfg.CreateHooks = nil // no $schema links in responses
	cfg.Info.Description = "Learning management API: courses → videos → tasks, students, batches, live sessions, quizzes, certificates and the public website. " +
		"Auth uses httpOnly cookies; send `X-LMS-App: admin|student` on every request."
	cfg.Components.SecuritySchemes = map[string]*huma.SecurityScheme{
		"cookie": {Type: "apiKey", In: "cookie", Name: "lms_admin_at"},
		"bearer": {Type: "http", Scheme: "bearer", BearerFormat: "JWT"},
	}
	api := humachi.New(r, cfg)

	guards := middleware.NewGuards(api, d.Redis)
	handler.Register(api, r, svcs, guards, d)
	return &App{Router: r, API: api, Services: svcs}
}

// health reports dependency status (used by Docker / load balancers).
func health(d *service.Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		res := map[string]string{"status": "ok", "db": "ok", "redis": "ok", "storage": "ok"}
		code := http.StatusOK
		if d.Pool == nil || d.Pool.Ping(ctx) != nil {
			res["db"], res["status"], code = "down", "degraded", http.StatusServiceUnavailable
		}
		if d.Redis == nil || d.Redis.Ping(ctx).Err() != nil {
			res["redis"], res["status"] = "down", "degraded"
		}
		if d.Store == nil || d.Store.Ping(ctx) != nil {
			res["storage"], res["status"] = "down", "degraded"
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(code)
		_ = json.NewEncoder(w).Encode(res)
	}
}
