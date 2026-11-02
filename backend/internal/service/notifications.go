package service

import (
	"context"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/lms/backend/internal/apperr"
	"github.com/lms/backend/internal/auth"
	"github.com/lms/backend/internal/dto"
	"github.com/lms/backend/internal/platform/realtime"
	"github.com/lms/backend/internal/platform/secure"
	"github.com/lms/backend/internal/repository"
)

// NotificationService stores in-app notifications, pushes them over WebSocket and issues
// one-time WebSocket tickets.
type NotificationService struct{ deps *Deps }

func toNotification(n repository.Notification) dto.Notification {
	return dto.Notification{ID: n.ID, Kind: n.Kind, Title: n.Title, Body: n.Body, Link: n.Link, ReadAt: n.ReadAt, CreatedAt: n.CreatedAt}
}

// Send notifies users (duplicates removed). Failures are logged, never returned.
func (s *NotificationService) Send(ctx context.Context, userIDs []uuid.UUID, kind, title, body, link string) {
	if len(userIDs) == 0 {
		return
	}
	seen := map[uuid.UUID]bool{}
	ids := make([]uuid.UUID, 0, len(userIDs))
	for _, id := range userIDs {
		if id != uuid.Nil && !seen[id] {
			seen[id] = true
			ids = append(ids, id)
		}
	}
	rows, err := s.deps.Q.CreateNotifications(ctx, repository.CreateNotificationsParams{Kind: kind, Title: title, Body: body, Link: link, UserIds: ids})
	if err != nil {
		slog.Error("notify failed", "kind", kind, "err", err)
		return
	}
	if s.deps.Hub == nil {
		return
	}
	for _, n := range rows {
		s.deps.Hub.Publish(ctx, n.UserID, realtime.Event{Type: "notification", Data: toNotification(n)})
	}
}

func (s *NotificationService) Feed(ctx context.Context, actor *auth.Principal, unreadOnly bool, limit int32) (dto.NotificationFeed, error) {
	rows, err := s.deps.Q.ListNotifications(ctx, repository.ListNotificationsParams{UserID: actor.ID, UnreadOnly: unreadOnly, Lim: limit})
	if err != nil {
		return dto.NotificationFeed{}, dbErr(err, "notifications")
	}
	unread, err := s.deps.Q.CountUnreadNotifications(ctx, actor.ID)
	if err != nil {
		return dto.NotificationFeed{}, dbErr(err, "notifications")
	}
	out := dto.NotificationFeed{Items: make([]dto.Notification, 0, len(rows)), Unread: unread}
	for _, n := range rows {
		out.Items = append(out.Items, toNotification(n))
	}
	return out, nil
}

// MarkRead marks the given notifications (or all when ids is empty) as read.
func (s *NotificationService) MarkRead(ctx context.Context, actor *auth.Principal, ids []uuid.UUID) error {
	if ids == nil {
		ids = []uuid.UUID{}
	}
	return dbErr(s.deps.Q.MarkNotificationsRead(ctx, repository.MarkNotificationsReadParams{UserID: actor.ID, Ids: ids}), "notifications")
}

// Ticket creates a 60-second single-use token for opening the WebSocket.
func (s *NotificationService) Ticket(ctx context.Context, actor *auth.Principal) (dto.WSTicket, error) {
	if s.deps.Redis == nil {
		return dto.WSTicket{}, apperr.Unavailable("realtime is not available")
	}
	t := secure.Token(24)
	if err := s.deps.Redis.Set(ctx, "wst:"+t, actor.ID.String(), time.Minute).Err(); err != nil {
		return dto.WSTicket{}, apperr.Unavailable("realtime is not available")
	}
	ws := strings.Replace(strings.Replace(s.deps.Cfg.APIPublicURL, "https://", "wss://", 1), "http://", "ws://", 1)
	return dto.WSTicket{Ticket: t, URL: ws + "/ws?ticket=" + t}, nil
}

// RedeemTicket consumes a ticket and returns its user id.
func (s *NotificationService) RedeemTicket(ctx context.Context, ticket string) (uuid.UUID, error) {
	if s.deps.Redis == nil || ticket == "" {
		return uuid.Nil, apperr.Unauthorized("invalid ticket")
	}
	v, err := s.deps.Redis.GetDel(ctx, "wst:"+ticket).Result()
	if err != nil {
		return uuid.Nil, apperr.Unauthorized("invalid ticket")
	}
	return uuid.Parse(v)
}
