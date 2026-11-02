package handler

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/coder/websocket"
	"github.com/danielgtaylor/huma/v2"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/lms/backend/internal/dto"
	"github.com/lms/backend/internal/middleware"
)

type feedIn struct {
	UnreadOnly bool  `query:"unread_only"`
	Limit      int32 `query:"limit" default:"30" minimum:"1" maximum:"100"`
}

type readBody struct {
	IDs []uuid.UUID `json:"ids,omitempty" maxItems:"500" doc:"Empty marks everything read"`
}

func (h *Handler) notificationRoutes(api huma.API) {
	t, g := "Notifications", h.g
	huma.Register(api, op("list-notifications", http.MethodGet, "/notifications", t, "My notifications and unread count", g.Auth()), h.feed)
	huma.Register(api, op("read-notifications", http.MethodPost, "/notifications/read", t, "Mark notifications as read", g.Auth()), h.markRead)
	huma.Register(api, op("ws-ticket", http.MethodPost, "/ws/ticket", t, "One-time ticket to open the realtime WebSocket", g.Auth()), h.wsTicket)
}

func (h *Handler) feed(ctx context.Context, in *feedIn) (*Out[dto.NotificationFeed], error) {
	return ok(h.s.Notify.Feed(ctx, actor(ctx), in.UnreadOnly, in.Limit))
}

func (h *Handler) markRead(ctx context.Context, in *bodyIn[readBody]) (*Out[dto.OK], error) {
	return ack(h.s.Notify.MarkRead(ctx, actor(ctx), in.Body.IDs), "")
}

func (h *Handler) wsTicket(ctx context.Context, _ *noInput) (*Out[dto.WSTicket], error) {
	return ok(h.s.Notify.Ticket(ctx, actor(ctx)))
}

// wsRoutes upgrades /ws?ticket=… to a WebSocket that streams notification events.
func (h *Handler) wsRoutes(r chi.Router) {
	origins := middleware.OriginHosts(h.cfg.AdminAppURL, h.cfg.StudentAppURL)
	r.Get("/ws", func(w http.ResponseWriter, r *http.Request) {
		userID, err := h.s.Notify.RedeemTicket(r.Context(), r.URL.Query().Get("ticket"))
		if err != nil {
			http.Error(w, "invalid ticket", http.StatusUnauthorized)
			return
		}
		c, err := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: origins})
		if err != nil {
			slog.Debug("ws accept", "err", err)
			return
		}
		h.hub.Serve(r.Context(), userID, c)
	})
}
