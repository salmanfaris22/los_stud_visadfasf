package service

import (
	"sync"
	"time"
)

const (
	principalTTL = 30 * time.Second
	settingsTTL  = 30 * time.Second
)

// ttlCache is a small in-process cache with per-entry expiry.
type ttlCache[V any] struct {
	mu  sync.RWMutex
	ttl time.Duration
	m   map[string]ttlEntry[V]
}

type ttlEntry[V any] struct {
	v   V
	exp time.Time
}

func newTTLCache[V any](ttl time.Duration) *ttlCache[V] {
	return &ttlCache[V]{ttl: ttl, m: map[string]ttlEntry[V]{}}
}

func (c *ttlCache[V]) Get(k string) (V, bool) {
	c.mu.RLock()
	e, ok := c.m[k]
	c.mu.RUnlock()
	if !ok || time.Now().After(e.exp) {
		var zero V
		return zero, false
	}
	return e.v, true
}

func (c *ttlCache[V]) Set(k string, v V) {
	c.mu.Lock()
	c.m[k] = ttlEntry[V]{v: v, exp: time.Now().Add(c.ttl)}
	c.mu.Unlock()
}

func (c *ttlCache[V]) Delete(k string) {
	c.mu.Lock()
	delete(c.m, k)
	c.mu.Unlock()
}

func (c *ttlCache[V]) Clear() {
	c.mu.Lock()
	c.m = map[string]ttlEntry[V]{}
	c.mu.Unlock()
}
