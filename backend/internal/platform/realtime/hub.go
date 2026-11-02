// Package realtime pushes JSON events to connected browsers over WebSocket.
// Events fan out across API instances through Redis pub/sub.
package realtime

import (
	"context"
	"encoding/json"
	"log/slog"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

const channel = "lms:realtime"

type Event struct {
	Type string `json:"type"`
	Data any    `json:"data"`
}

type envelope struct {
	UserID uuid.UUID       `json:"user_id"`
	Event  json.RawMessage `json:"event"`
}

type Hub struct {
	mu    sync.RWMutex
	conns map[uuid.UUID]map[*websocket.Conn]struct{}
	rdb   *redis.Client
}

func NewHub(rdb *redis.Client) *Hub {
	return &Hub{conns: map[uuid.UUID]map[*websocket.Conn]struct{}{}, rdb: rdb}
}

// Run subscribes to Redis and delivers events to local connections until ctx ends.
func (h *Hub) Run(ctx context.Context) {
	if h.rdb == nil {
		return
	}
	sub := h.rdb.Subscribe(ctx, channel)
	defer sub.Close()
	ch := sub.Channel()
	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}
			var env envelope
			if err := json.Unmarshal([]byte(msg.Payload), &env); err == nil {
				h.deliver(env.UserID, env.Event)
			}
		}
	}
}

// Publish sends an event to every open connection of a user (on any instance).
func (h *Hub) Publish(ctx context.Context, userID uuid.UUID, ev Event) {
	raw, err := json.Marshal(ev)
	if err != nil {
		return
	}
	if h.rdb != nil {
		payload, _ := json.Marshal(envelope{UserID: userID, Event: raw})
		if err := h.rdb.Publish(ctx, channel, payload).Err(); err == nil {
			return
		}
	}
	h.deliver(userID, raw)
}

func (h *Hub) deliver(userID uuid.UUID, raw []byte) {
	h.mu.RLock()
	set := h.conns[userID]
	conns := make([]*websocket.Conn, 0, len(set))
	for c := range set {
		conns = append(conns, c)
	}
	h.mu.RUnlock()
	for _, c := range conns {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		if err := c.Write(ctx, websocket.MessageText, raw); err != nil {
			h.remove(userID, c)
		}
		cancel()
	}
}

func (h *Hub) add(userID uuid.UUID, c *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.conns[userID] == nil {
		h.conns[userID] = map[*websocket.Conn]struct{}{}
	}
	h.conns[userID][c] = struct{}{}
}

func (h *Hub) remove(userID uuid.UUID, c *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.conns[userID], c)
	if len(h.conns[userID]) == 0 {
		delete(h.conns, userID)
	}
}

// Serve keeps an accepted connection open: it pings periodically and discards client messages.
func (h *Hub) Serve(ctx context.Context, userID uuid.UUID, c *websocket.Conn) {
	h.add(userID, c)
	defer func() {
		h.remove(userID, c)
		_ = c.CloseNow()
	}()
	ctx = c.CloseRead(ctx)
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	hello, _ := json.Marshal(Event{Type: "hello", Data: map[string]string{"user_id": userID.String()}})
	_ = c.Write(ctx, websocket.MessageText, hello)
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			pctx, cancel := context.WithTimeout(ctx, 10*time.Second)
			err := c.Ping(pctx)
			cancel()
			if err != nil {
				slog.Debug("ws ping failed", "user", userID, "err", err)
				return
			}
		}
	}
}
