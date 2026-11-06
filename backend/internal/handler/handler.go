// Package handler is the HTTP layer. Each file registers one area's endpoints: it parses
// path/query parameters, calls a service and maps service errors to HTTP status codes.
// No business rules live here.
package handler

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/lms/backend/internal/apperr"
	"github.com/lms/backend/internal/auth"
	"github.com/lms/backend/internal/config"
	"github.com/lms/backend/internal/dto"
	"github.com/lms/backend/internal/middleware"
	"github.com/lms/backend/internal/platform/realtime"
	"github.com/lms/backend/internal/service"
)

// Handler holds what every endpoint group needs.
type Handler struct {
	s       *service.Services
	g       *middleware.Guards
	cfg     *config.Config
	tokens  *auth.Tokens
	cookies auth.CookieFactory
	hub     *realtime.Hub
}

// Register mounts every endpoint group on the API (JSON) and router (redirects, files, WebSocket).
func Register(api huma.API, r chi.Router, s *service.Services, g *middleware.Guards, d *service.Deps) {
	h := &Handler{s: s, g: g, cfg: d.Cfg, tokens: d.Tokens, cookies: d.Cookies, hub: d.Hub}
	for _, register := range []func(huma.API){
		h.staffRoutes, h.studentRoutes, h.courseRoutes, h.batchRoutes, h.attendanceRoutes,
		h.uploadRoutes, h.submissionRoutes, h.certificateRoutes, h.liveRoutes, h.quizRoutes, h.commentRoutes,
		h.announcementRoutes, h.notificationRoutes, h.portalRoutes, h.siteRoutes, h.adminRoutes,
	} {
		register(api)
	}
	h.authRedirects(r)
	h.fileRoutes(r)
	h.wsRoutes(r)
	h.googleConnectRoutes(r)
}

// op describes an endpoint: id, method, path (without /api/v1), docs tag, summary and guards.
func op(id, method, path, tag, summary string, mw ...middleware.Fn) huma.Operation {
	return huma.Operation{OperationID: id, Method: method, Path: "/api/v1" + path, Tags: []string{tag}, Summary: summary, Middlewares: mw}
}

// fail converts service errors into HTTP errors.
func fail(err error) error {
	if err == nil {
		return nil
	}
	var se huma.StatusError
	if errors.As(err, &se) {
		return err
	}
	var ae *apperr.Error
	if errors.As(err, &ae) {
		switch ae.Kind {
		case apperr.KindInvalid:
			return huma.Error422UnprocessableEntity(ae.Message)
		case apperr.KindUnauthorized:
			return huma.Error401Unauthorized(ae.Message)
		case apperr.KindForbidden:
			return huma.Error403Forbidden(ae.Message)
		case apperr.KindNotFound:
			return huma.Error404NotFound(ae.Message)
		case apperr.KindConflict:
			return huma.Error409Conflict(ae.Message)
		case apperr.KindRateLimited:
			return huma.Error429TooManyRequests(ae.Message)
		case apperr.KindUnavailable:
			return huma.Error503ServiceUnavailable(ae.Message)
		}
	}
	slog.Error("request failed", "err", err)
	return huma.Error500InternalServerError("something went wrong, please try again")
}

// httpStatus maps an error for plain (non-JSON) handlers.
func httpStatus(err error) int {
	var se huma.StatusError
	if errors.As(fail(err), &se) {
		return se.GetStatus()
	}
	return http.StatusInternalServerError
}

func actor(ctx context.Context) *auth.Principal { return auth.FromContext(ctx) }

// parseID turns a path parameter into a UUID (invalid ids look like missing records).
func parseID(raw, what string) (uuid.UUID, error) {
	id, err := uuid.Parse(raw)
	if err != nil {
		return uuid.Nil, huma.Error404NotFound(what + " not found")
	}
	return id, nil
}

// optID parses an optional UUID query value.
func optID(raw string) (*uuid.UUID, error) {
	if raw == "" {
		return nil, nil
	}
	id, err := uuid.Parse(raw)
	if err != nil {
		return nil, huma.Error400BadRequest("invalid id: " + raw)
	}
	return &id, nil
}

// ── generic inputs / outputs ──

type Out[T any] struct{ Body T }

// ok wraps a service result.
func ok[T any](v T, err error) (*Out[T], error) {
	if err != nil {
		return nil, fail(err)
	}
	return &Out[T]{Body: v}, nil
}

// done answers 204 No Content.
func done(err error) (*struct{}, error) { return nil, fail(err) }

func ack(err error, msg string) (*Out[dto.OK], error) {
	return ok(dto.OK{OK: true, Message: msg}, err)
}

type FileOut struct {
	ContentType        string `header:"Content-Type"`
	ContentDisposition string `header:"Content-Disposition"`
	CacheControl       string `header:"Cache-Control"`
	Body               []byte
}

func file(f dto.File, err error) (*FileOut, error) {
	if err != nil {
		return nil, fail(err)
	}
	return &FileOut{ContentType: f.ContentType, ContentDisposition: fmt.Sprintf(`attachment; filename="%s"`, f.Name), CacheControl: "private, no-store", Body: f.Data}, nil
}

type noInput struct{}

type idPath struct {
	ID string `path:"id"`
}

type bodyIn[T any] struct {
	Body T
}

type idBody[T any] struct {
	ID   string `path:"id"`
	Body T
}

type pageIn struct {
	dto.PageQuery
}
