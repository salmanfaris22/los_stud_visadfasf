// Package monitor records how the API is doing, in memory and cheaply:
//
//   - every request's time and result, summed per minute and endpoint until the server service
//     flushes them to Postgres (Drain), plus the last 200 requests;
//   - the slow (>= 1 s) and failed (5xx) requests, kept until the next flush;
//   - who made a request in the last minutes (online users) and how many realtime streams are open;
//   - samples of the machine every few seconds (see system.go).
//
// It knows nothing about HTTP or gRPC: the rpc interceptor and the HTTP middleware call Record.
package monitor

import (
	"math"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
)

// Bounds are the upper limits (ms) of the latency histogram buckets; one more bucket holds the rest.
var Bounds = []float64{5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000}

// SlowMs is the time from which a request is kept in the slow list.
const SlowMs = 1000

const (
	recentSize = 200
	notableCap = 2000             // slow / failed requests waiting for a flush
	liveWindow = 60 * time.Minute // in-memory totals kept for the "now" numbers
)

// Request is one finished request.
type Request struct {
	At        time.Time
	Procedure string // "/lms.v1.AuthService/Login" or an HTTP route pattern like "GET /files/{id}"
	Status    int    // HTTP status (gRPC codes mapped the way Connect maps them)
	Code      string // gRPC code name when it failed, else ""
	Ms        float64
	UserID    *uuid.UUID
	Staff     bool
	IP        string
}

func (r Request) Slow() bool   { return r.Ms >= SlowMs }
func (r Request) Failed() bool { return r.Status >= 500 }

// Stat sums the requests of one minute (and one endpoint, or all of them).
type Stat struct {
	Minute    time.Time
	Procedure string
	Count     int32
	Err4xx    int32
	Err5xx    int32
	SumMs     float64
	MaxMs     float64
	Buckets   []int32 // len(Bounds)+1
}

func newStat(minute time.Time, procedure string) *Stat {
	return &Stat{Minute: minute, Procedure: procedure, Buckets: make([]int32, len(Bounds)+1)}
}

func (s *Stat) add(r Request) {
	s.Count++
	switch {
	case r.Status >= 500:
		s.Err5xx++
	case r.Status >= 400:
		s.Err4xx++
	}
	s.SumMs += r.Ms
	s.MaxMs = math.Max(s.MaxMs, r.Ms)
	s.Buckets[Bucket(r.Ms)]++
}

// Merge adds o into s (same shape histograms).
func (s *Stat) Merge(o Stat) {
	s.Count += o.Count
	s.Err4xx += o.Err4xx
	s.Err5xx += o.Err5xx
	s.SumMs += o.SumMs
	s.MaxMs = math.Max(s.MaxMs, o.MaxMs)
	if len(s.Buckets) < len(o.Buckets) {
		s.Buckets = append(s.Buckets, make([]int32, len(o.Buckets)-len(s.Buckets))...)
	}
	for i, n := range o.Buckets {
		s.Buckets[i] += n
	}
}

// AvgMs is the mean response time.
func (s Stat) AvgMs() float64 {
	if s.Count == 0 {
		return 0
	}
	return s.SumMs / float64(s.Count)
}

// P95 is the 95th percentile response time, read from the histogram.
func (s Stat) P95() float64 { return Percentile(s.Buckets, 0.95, s.MaxMs) }

// Bucket returns the histogram bucket for a response time.
func Bucket(ms float64) int {
	return sort.SearchFloat64s(Bounds, ms)
}

// Percentile estimates the q-th percentile from a histogram: it finds the bucket that holds it and
// interpolates inside that bucket. The result never exceeds max (the slowest request seen).
func Percentile(buckets []int32, q, max float64) float64 {
	var total int64
	for _, n := range buckets {
		total += int64(n)
	}
	if total == 0 {
		return 0
	}
	rank := q * float64(total)
	var cum float64
	for i, n := range buckets {
		if n == 0 {
			continue
		}
		if cum+float64(n) >= rank {
			lo := 0.0
			if i > 0 {
				lo = Bounds[i-1]
			}
			hi := max
			if i < len(Bounds) {
				hi = math.Min(Bounds[i], max)
			}
			if hi < lo {
				return hi
			}
			return lo + (hi-lo)*(rank-cum)/float64(n)
		}
		cum += float64(n)
	}
	return max
}

// Seen is a user who made a request recently.
type Seen struct {
	UserID   uuid.UUID
	Staff    bool
	IP       string
	LastSeen time.Time
	Requests int
	Streams  int // open realtime streams (tabs); online while > 0
}

type statKey struct {
	minute    int64
	procedure string
}

// Recorder is safe for concurrent use. The zero value is not; use New.
type Recorder struct {
	mu      sync.Mutex
	stats   map[statKey]*Stat // per minute + endpoint, until drained
	totals  map[int64]*Stat   // per minute, all endpoints, last hour (never drained)
	recent  []Request         // ring buffer
	head    int
	notable []Request
	dropped int
	online  map[uuid.UUID]*Seen
	streams atomic.Int64
	started time.Time

	sys system
}

func New() *Recorder {
	r := &Recorder{
		stats:   map[statKey]*Stat{},
		totals:  map[int64]*Stat{},
		recent:  make([]Request, 0, recentSize),
		online:  map[uuid.UUID]*Seen{},
		started: time.Now(),
	}
	r.sys.init()
	return r
}

// Started is when this API process started.
func (r *Recorder) Started() time.Time { return r.started }

// Record adds one finished request.
func (r *Recorder) Record(req Request) {
	if r == nil {
		return
	}
	if req.At.IsZero() {
		req.At = time.Now()
	}
	minute := req.At.Truncate(time.Minute)
	m := minute.Unix()
	r.mu.Lock()
	defer r.mu.Unlock()

	k := statKey{m, req.Procedure}
	s := r.stats[k]
	if s == nil {
		s = newStat(minute, req.Procedure)
		r.stats[k] = s
	}
	s.add(req)

	t := r.totals[m]
	if t == nil {
		t = newStat(minute, "")
		r.totals[m] = t
		cut := minute.Add(-liveWindow).Unix()
		for km := range r.totals {
			if km < cut {
				delete(r.totals, km)
			}
		}
	}
	t.add(req)

	if len(r.recent) < recentSize {
		r.recent = append(r.recent, req)
	} else {
		r.recent[r.head] = req
		r.head = (r.head + 1) % recentSize
	}

	if req.Slow() || req.Failed() {
		if len(r.notable) < notableCap {
			r.notable = append(r.notable, req)
		} else {
			r.dropped++
		}
	}

	if req.UserID != nil {
		r.touch(*req.UserID, req.Staff, req.IP, req.At, 1, 0)
	}
}

func (r *Recorder) touch(id uuid.UUID, staff bool, ip string, at time.Time, requests, streams int) {
	u := r.online[id]
	if u == nil {
		u = &Seen{UserID: id}
		r.online[id] = u
	}
	u.Staff, u.LastSeen, u.Requests, u.Streams = staff, at, u.Requests+requests, max(0, u.Streams+streams)
	if ip != "" {
		u.IP = ip
	}
}

// StreamOpened counts an open realtime stream (an open browser tab) until the returned func runs.
// The user counts as online while the stream is open.
func (r *Recorder) StreamOpened(userID *uuid.UUID, staff bool, ip string) func() {
	if r == nil {
		return func() {}
	}
	r.streams.Add(1)
	if userID != nil {
		r.mu.Lock()
		r.touch(*userID, staff, ip, time.Now(), 0, 1)
		r.mu.Unlock()
	}
	return func() {
		r.streams.Add(-1)
		if userID != nil {
			r.mu.Lock()
			r.touch(*userID, staff, ip, time.Now(), 0, -1)
			r.mu.Unlock()
		}
	}
}

// OpenStreams is the number of realtime streams open right now.
func (r *Recorder) OpenStreams() int { return int(r.streams.Load()) }

// Drain removes and returns the per-endpoint minutes that ended before `before`, and every
// slow / failed request recorded so far (with how many were dropped because the buffer was full).
func (r *Recorder) Drain(before time.Time) (stats []Stat, notable []Request, dropped int) {
	cut := before.Truncate(time.Minute).Unix()
	r.mu.Lock()
	defer r.mu.Unlock()
	for k, s := range r.stats {
		if k.minute < cut {
			stats = append(stats, *s)
			delete(r.stats, k)
		}
	}
	notable, dropped = r.notable, r.dropped
	r.notable, r.dropped = nil, 0
	return stats, notable, dropped
}

// Restore puts back what a failed flush could not write, so the next flush tries again.
func (r *Recorder) Restore(stats []Stat, notable []Request) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, s := range stats {
		k := statKey{s.Minute.Unix(), s.Procedure}
		if cur := r.stats[k]; cur != nil {
			cur.Merge(s)
		} else {
			c := s
			r.stats[k] = &c
		}
	}
	if room := notableCap - len(r.notable); room > 0 {
		if len(notable) > room {
			notable = notable[:room]
		}
		r.notable = append(r.notable, notable...)
	}
}

// Pending returns copies of the per-endpoint minutes not flushed yet.
func (r *Recorder) Pending() []Stat {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]Stat, 0, len(r.stats))
	for _, s := range r.stats {
		c := *s
		c.Buckets = append([]int32(nil), s.Buckets...)
		out = append(out, c)
	}
	return out
}

// PendingNotable returns the slow / failed requests not flushed yet.
func (r *Recorder) PendingNotable() []Request {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]Request(nil), r.notable...)
}

// Live sums the last `minutes` whole minutes plus the current one (all endpoints).
func (r *Recorder) Live(minutes int) Stat {
	now := time.Now().Truncate(time.Minute)
	from := now.Add(-time.Duration(minutes) * time.Minute).Unix()
	out := *newStat(now, "")
	r.mu.Lock()
	defer r.mu.Unlock()
	for m, s := range r.totals {
		if m >= from {
			out.Merge(*s)
		}
	}
	return out
}

// LastMinute is the request count of the last whole minute.
func (r *Recorder) LastMinute() int32 {
	m := time.Now().Truncate(time.Minute).Add(-time.Minute).Unix()
	r.mu.Lock()
	defer r.mu.Unlock()
	if s := r.totals[m]; s != nil {
		return s.Count
	}
	return 0
}

// Recent returns up to n requests, newest first, that match keep (nil keeps all).
func (r *Recorder) Recent(n int, keep func(Request) bool) []Request {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]Request, 0, n)
	size := len(r.recent)
	for i := 0; i < size && len(out) < n; i++ {
		// newest is just before head once the ring is full, else at the end
		idx := (r.head - 1 - i + size) % size
		if size < recentSize {
			idx = size - 1 - i
		}
		if keep == nil || keep(r.recent[idx]) {
			out = append(out, r.recent[idx])
		}
	}
	return out
}

// Online returns the users seen within the window, most recent first. Older entries are forgotten.
func (r *Recorder) Online(within time.Duration) []Seen {
	cut := time.Now().Add(-within)
	r.mu.Lock()
	defer r.mu.Unlock()
	out := []Seen{}
	for id, u := range r.online {
		if u.Streams == 0 && u.LastSeen.Before(cut.Add(-time.Hour)) {
			delete(r.online, id)
			continue
		}
		if u.Streams > 0 || !u.LastSeen.Before(cut) {
			out = append(out, *u)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].LastSeen.After(out[j].LastSeen) })
	return out
}
