package handler

import (
	"context"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/lms/backend/internal/auth"
	"github.com/lms/backend/internal/dto"
	"github.com/lms/backend/internal/middleware"
)

func (h *Handler) uploadRoutes(api huma.API) {
	t, g := "Uploads", h.g
	huma.Register(api, op("presign-upload", http.MethodPost, "/uploads/presign", t, "Get a URL to upload a file straight to storage", g.Auth(), g.RateLimit("upload", 60, time.Minute)), h.presign)
	huma.Register(api, op("complete-upload", http.MethodPost, "/uploads/{id}/complete", t, "Confirm an upload finished", g.Auth()), h.completeUpload)
}

func (h *Handler) presign(ctx context.Context, in *bodyIn[dto.PresignInput]) (*Out[dto.Presigned], error) {
	return ok(h.s.Uploads.Presign(ctx, actor(ctx), in.Body))
}

func (h *Handler) completeUpload(ctx context.Context, in *idPath) (*Out[dto.Upload], error) {
	id, err := parseID(in.ID, "upload")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Uploads.Complete(ctx, actor(ctx), id))
}

// fileRoutes serves /api/v1/files/{id}: an access-checked redirect to a short-lived signed URL.
func (h *Handler) fileRoutes(r chi.Router) {
	r.Get("/api/v1/files/{id}", func(w http.ResponseWriter, r *http.Request) {
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
			http.Error(w, fail(err).Error(), httpStatus(err))
			return
		}
		if public {
			w.Header().Set("Cache-Control", "public, max-age=3600")
		} else {
			w.Header().Set("Cache-Control", "private, no-store")
		}
		http.Redirect(w, r, link, http.StatusFound)
	})
}
