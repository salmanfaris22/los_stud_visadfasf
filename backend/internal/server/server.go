// Package server wires infrastructure, services, middleware and the API into one http.Handler.
package server

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"

	"github.com/lms/backend/internal/httpx"
	"github.com/lms/backend/internal/middleware"
	"github.com/lms/backend/internal/rpc"
	"github.com/lms/backend/internal/service"
)

type App struct {
	Router   http.Handler
	Services *service.Services
}

// New builds the HTTP application. It panics when the gRPC API is misconfigured (an RPC
// without an access rule).
func New(d *service.Deps) *App {
	svcs := service.New(d)
	rpcHandler, err := rpc.Handler(svcs, d)
	if err != nil {
		panic(err)
	}

	root := chi.NewMux()
	root.Use(chimw.RequestID)
	if d.Cfg.TrustProxy {
		root.Use(chimw.RealIP)
	}
	root.Use(chimw.Recoverer, middleware.SecurityHeaders, middleware.Logger,
		middleware.CORS(d.Cfg.AdminAppURL, d.Cfg.StudentAppURL),
		middleware.Authenticate(d.Tokens, svcs.Access))

	// gRPC / gRPC-Web / Connect. Native gRPC clients call /lms.v1.<Service>/<Method>; the web
	// apps proxy /rpc/* here (the refresh cookie is scoped to that path). Connect negotiates its
	// own compression.
	api := streams(rpcHandler)
	root.Handle("/lms.v1.*", api)
	root.Handle("/grpc.*", api)
	root.Handle("/rpc/*", http.StripPrefix("/rpc", api))

	// Plain HTTP: health, Google redirects and file links.
	root.Get("/healthz", health(d))
	httpx.Register(root, svcs, d)
	return &App{Router: root, Services: svcs}
}

// streams prepares long-lived streams (realtime events): no server read/write timeouts, and
// headers that stop proxies from compressing or buffering them (Next.js gzips proxied responses
// unless they say no-transform; nginx buffers unless X-Accel-Buffering is no).
func streams(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/lms.v1.NotificationService/Subscribe") {
			rc := http.NewResponseController(w)
			_ = rc.SetWriteDeadline(time.Time{})
			_ = rc.SetReadDeadline(time.Time{})
			w.Header().Set("Cache-Control", "no-cache, no-transform")
			w.Header().Set("X-Accel-Buffering", "no")
		}
		next.ServeHTTP(w, r)
	})
}

// health reports dependency status (used by load balancers and the deploy script).
func health(d *service.Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		res := map[string]string{"status": "ok", "db": "ok", "storage": "ok"}
		code := http.StatusOK
		if d.Pool == nil || d.Pool.Ping(ctx) != nil {
			res["db"], res["status"], code = "down", "degraded", http.StatusServiceUnavailable
		}
		if d.Store == nil || d.Store.Ping(ctx) != nil {
			res["storage"], res["status"] = "down", "degraded"
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(code)
		_ = json.NewEncoder(w).Encode(res)
	}
}
