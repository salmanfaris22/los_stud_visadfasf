package monitor

import (
	"context"
	"math"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestPercentile(t *testing.T) {
	b := make([]int32, len(Bounds)+1)
	if got := Percentile(b, 0.95, 0); got != 0 {
		t.Fatalf("empty = %v", got)
	}
	// 100 requests: 90 under 5 ms, 10 between 100 and 250 ms
	b[Bucket(3)] = 90
	b[Bucket(180)] = 10
	p := Percentile(b, 0.95, 240)
	if p < 100 || p > 240 {
		t.Fatalf("p95 = %v, want inside the 100-240 ms bucket", p)
	}
	// never above the slowest request
	if p := Percentile(b, 0.99, 120); p > 120 {
		t.Fatalf("p99 = %v above max 120", p)
	}
	if Bucket(5) != 0 || Bucket(5.1) != 1 || Bucket(99999) != len(Bounds) {
		t.Fatal("bucket bounds")
	}
}

func TestRecordDrainRestore(t *testing.T) {
	r := New()
	id := uuid.New()
	old := time.Now().Add(-2 * time.Minute)
	r.Record(Request{At: old, Procedure: "/lms.v1.A/B", Status: 200, Ms: 12, UserID: &id})
	r.Record(Request{At: old, Procedure: "/lms.v1.A/B", Status: 500, Code: "internal", Ms: 1500})
	r.Record(Request{Procedure: "/lms.v1.A/C", Status: 404, Ms: 3}) // current minute: stays

	stats, notable, _ := r.Drain(time.Now())
	if len(stats) != 1 || stats[0].Count != 2 || stats[0].Err5xx != 1 || stats[0].MaxMs != 1500 {
		t.Fatalf("drained %+v", stats)
	}
	if len(notable) != 1 || !notable[0].Failed() || !notable[0].Slow() {
		t.Fatalf("notable %+v", notable)
	}
	if len(r.Pending()) != 1 {
		t.Fatalf("pending %d, want the current minute only", len(r.Pending()))
	}
	r.Restore(stats, notable)
	if len(r.Pending()) != 2 || len(r.PendingNotable()) != 1 {
		t.Fatal("restore lost data")
	}
	if live := r.Live(5); live.Count != 3 || math.Abs(live.SumMs-1515) > 1e-9 {
		t.Fatalf("live %+v", live)
	}
	if got := r.Online(5 * time.Minute); len(got) != 1 || got[0].UserID != id || got[0].Requests != 1 {
		t.Fatalf("online %+v", got)
	}
}

func TestRecentNewestFirst(t *testing.T) {
	r := New()
	for i := 0; i < recentSize+5; i++ {
		r.Record(Request{Procedure: "p", Status: 200 + i})
	}
	got := r.Recent(3, nil)
	if len(got) != 3 || got[0].Status != 200+recentSize+4 || got[2].Status != 200+recentSize+2 {
		t.Fatalf("recent %+v", got)
	}
	if n := len(r.Recent(1000, nil)); n != recentSize {
		t.Fatalf("ring holds %d", n)
	}
}

func TestStreamsKeepUserOnline(t *testing.T) {
	r := New()
	id := uuid.New()
	done := r.StreamOpened(&id, false, "1.2.3.4")
	r.mu.Lock()
	r.online[id].LastSeen = time.Now().Add(-30 * time.Minute) // quiet for a long time, tab still open
	r.mu.Unlock()
	if len(r.Online(5*time.Minute)) != 1 || r.OpenStreams() != 1 {
		t.Fatal("user with an open tab should be online")
	}
	done()
	if r.OpenStreams() != 0 {
		t.Fatal("stream not closed")
	}
}

func TestSample(t *testing.T) {
	r := New()
	s := r.Sample(context.Background())
	if s.Host == "" || s.Cores < 1 || s.MemTotal <= 0 || s.DiskTotal <= 0 || s.Goroutines < 1 {
		t.Fatalf("sample %+v", s)
	}
	if m, ok := r.MinuteSample(); !ok || m.Host != s.Host {
		t.Fatal("minute sample")
	}
}
