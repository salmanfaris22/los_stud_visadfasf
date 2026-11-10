// Package realtime delivers events to signed-in users while they have the app open.
// Each open NotificationService.Subscribe stream is a subscriber; events go to every stream
// of the user, inside this API process (the API runs as a single instance).
package realtime

import (
	"context"
	"sync"

	"github.com/google/uuid"
)

// Event is one realtime message, e.g. {type: "notification", data: {...}}.
type Event struct {
	Type string `json:"type"`
	Data any    `json:"data"`
}

// Hub keeps the open streams of every user.
type Hub struct {
	mu   sync.RWMutex
	subs map[uuid.UUID]map[chan Event]struct{}
}

func NewHub() *Hub {
	return &Hub{subs: map[uuid.UUID]map[chan Event]struct{}{}}
}

// Subscribe registers a stream for a user. Call the returned func when the stream ends.
func (h *Hub) Subscribe(userID uuid.UUID) (<-chan Event, func()) {
	ch := make(chan Event, 32)
	h.mu.Lock()
	if h.subs[userID] == nil {
		h.subs[userID] = map[chan Event]struct{}{}
	}
	h.subs[userID][ch] = struct{}{}
	h.mu.Unlock()
	return ch, func() {
		h.mu.Lock()
		delete(h.subs[userID], ch)
		if len(h.subs[userID]) == 0 {
			delete(h.subs, userID)
		}
		h.mu.Unlock()
	}
}

// Publish sends an event to every open stream of a user. A stream that is not keeping up
// misses the event rather than blocking the caller.
func (h *Hub) Publish(_ context.Context, userID uuid.UUID, ev Event) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for ch := range h.subs[userID] {
		select {
		case ch <- ev:
		default:
		}
	}
}

// Streams is the number of open streams (shown on the admin Server page).
func (h *Hub) Streams() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	n := 0
	for _, set := range h.subs {
		n += len(set)
	}
	return n
}
