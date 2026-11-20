package httpx

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/lms/backend/internal/service/certart"
)

// certificateArt serves the built-in certificate images (public: they are part of the design, not user data).
func certificateArt(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	b, ok := certart.Art(name)
	if !ok {
		http.NotFound(w, r)
		return
	}
	ct := "image/png"
	if strings.HasSuffix(name, ".jpg") {
		ct = "image/jpeg"
	}
	w.Header().Set("Content-Type", ct)
	w.Header().Set("Cache-Control", "public, max-age=86400")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	_, _ = w.Write(b)
}
