package middleware

import (
	"log/slog"
	"net/http"
	"net/url"
	"time"

	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

// CORS allows the two frontends (and credentials) to call the API directly.
func CORS(origins ...string) func(http.Handler) http.Handler {
	return cors.Handler(cors.Options{
		AllowedOrigins: origins,
		AllowedMethods: []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders: []string{"Content-Type", "Authorization", "X-LMS-App",
			// Connect / gRPC-Web request headers.
			"Connect-Protocol-Version", "Connect-Timeout-Ms", "Connect-Content-Encoding", "Connect-Accept-Encoding",
			"Grpc-Timeout", "X-Grpc-Web", "X-User-Agent"},
		ExposedHeaders: []string{"Content-Disposition", "Retry-After",
			"Grpc-Status", "Grpc-Message", "Grpc-Status-Details-Bin", "Connect-Content-Encoding", "Connect-Accept-Encoding"},
		AllowCredentials: true,
		MaxAge:           600,
	})
}

// OriginHosts converts app URLs into WebSocket origin patterns ("localhost:3000").
func OriginHosts(urls ...string) []string {
	out := []string{}
	for _, u := range urls {
		if p, err := url.Parse(u); err == nil && p.Host != "" {
			out = append(out, p.Host)
		}
	}
	return out
}

// SecurityHeaders adds conservative headers to every API response.
func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
		next.ServeHTTP(w, r)
	})
}

// Logger writes one structured log line per request.
func Logger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		next.ServeHTTP(ww, r)
		if r.URL.Path == "/healthz" {
			return
		}
		lvl := slog.LevelInfo
		if ww.Status() >= 500 {
			lvl = slog.LevelError
		}
		slog.Log(r.Context(), lvl, "http", "method", r.Method, "path", r.URL.Path, "status", ww.Status(),
			"ms", time.Since(start).Milliseconds(), "bytes", ww.BytesWritten(), "req_id", middleware.GetReqID(r.Context()))
	})
}
