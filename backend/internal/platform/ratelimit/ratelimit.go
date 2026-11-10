// Package ratelimit counts calls per client IP in fixed time windows, in memory.
// The API runs as a single instance, so a process-local counter is enough.
package ratelimit

import (
	"sync"
	"time"
)

type entry struct {
	count int
	end   time.Time
}

// Limiter is safe for concurrent use.
type Limiter struct {
	mu      sync.Mutex
	entries map[string]*entry
	sweep   time.Time
}

func New() *Limiter { return &Limiter{entries: map[string]*entry{}} }

// Allow counts one call and reports whether the caller is still within limit calls per window
// for the bucket.
func (l *Limiter) Allow(bucket, ip string, limit int, window time.Duration) bool {
	now := time.Now()
	k := bucket + "|" + ip
	l.mu.Lock()
	defer l.mu.Unlock()
	if now.After(l.sweep) {
		l.sweep = now.Add(time.Minute)
		for key, e := range l.entries {
			if !now.Before(e.end) {
				delete(l.entries, key)
			}
		}
	}
	e := l.entries[k]
	if e == nil || !now.Before(e.end) {
		// Fixed windows aligned to the clock, like the old Redis counter.
		start := now.Truncate(window)
		e = &entry{end: start.Add(window)}
		l.entries[k] = e
	}
	e.count++
	return e.count <= limit
}
