package monitor

import (
	"context"
	"os"
	"runtime"
	"runtime/debug"
	"sync"
	"time"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/load"
	"github.com/shirou/gopsutil/v4/mem"
	gnet "github.com/shirou/gopsutil/v4/net"
	"github.com/shirou/gopsutil/v4/process"
)

// SampleEvery is how often the machine is sampled (Sample is called by the server service).
const SampleEvery = 10 * time.Second

// System is one sample of the machine and this API process. Sizes are bytes; network is bytes/s.
type System struct {
	At         time.Time
	Host       string
	OS         string // "ubuntu 26.04 (linux 6.17…)"
	Arch       string
	Cores      int
	BootTime   time.Time
	CPUPct     float64
	Load1      float64
	Load5      float64
	Load15     float64
	MemTotal   float64
	MemUsed    float64
	SwapTotal  float64
	SwapUsed   float64
	DiskTotal  float64
	DiskUsed   float64
	NetRx      float64
	NetTx      float64
	ProcRSS    float64
	GoHeap     float64
	Goroutines int
	GoVersion  string
	Version    string // git commit of the API build (or "dev")
}

type system struct {
	mu      sync.Mutex
	static  System // host, os, cores, boot, versions: read once
	latest  System
	cpuSum  float64 // CPU samples since the last MinuteSample, for the minute average
	cpuN    int
	netAt   time.Time
	netRx   uint64
	netTx   uint64
	proc    *process.Process
	sampled bool
}

func (s *system) init() {
	st := System{Arch: runtime.GOARCH, Cores: runtime.NumCPU(), GoVersion: runtime.Version(), Version: buildVersion()}
	if hi, err := host.Info(); err == nil {
		st.Host = hi.Hostname
		st.OS = hi.Platform + " " + hi.PlatformVersion + " (" + hi.OS + " " + hi.KernelVersion + ")"
		st.BootTime = time.Unix(int64(hi.BootTime), 0)
	}
	if st.Host == "" {
		st.Host, _ = os.Hostname()
	}
	if n, err := cpu.Counts(true); err == nil && n > 0 {
		st.Cores = n
	}
	s.static = st
	s.latest = st
	s.proc, _ = process.NewProcess(int32(os.Getpid()))
	_, _ = cpu.Percent(0, false) // prime: the next call measures from here
}

// buildVersion is the git commit the binary was built from (go build embeds it), short form.
func buildVersion() string {
	bi, ok := debug.ReadBuildInfo()
	if !ok {
		return "dev"
	}
	rev, dirty := "", false
	for _, s := range bi.Settings {
		switch s.Key {
		case "vcs.revision":
			rev = s.Value
		case "vcs.modified":
			dirty = s.Value == "true"
		}
	}
	if rev == "" {
		return "dev"
	}
	if len(rev) > 7 {
		rev = rev[:7]
	}
	if dirty {
		rev += "+changes"
	}
	return rev
}

// Sample reads the machine now. Errors leave that part at zero (some numbers are not
// available on every OS).
func (r *Recorder) Sample(ctx context.Context) System {
	s := &r.sys
	out := s.static
	out.At = time.Now()
	if v, err := cpu.PercentWithContext(ctx, 0, false); err == nil && len(v) > 0 {
		out.CPUPct = v[0]
	}
	if l, err := load.AvgWithContext(ctx); err == nil {
		out.Load1, out.Load5, out.Load15 = l.Load1, l.Load5, l.Load15
	}
	if m, err := mem.VirtualMemoryWithContext(ctx); err == nil {
		out.MemTotal, out.MemUsed = float64(m.Total), float64(m.Total-m.Available)
	}
	if sw, err := mem.SwapMemoryWithContext(ctx); err == nil {
		out.SwapTotal, out.SwapUsed = float64(sw.Total), float64(sw.Used)
	}
	if d, err := disk.UsageWithContext(ctx, "/"); err == nil {
		out.DiskTotal, out.DiskUsed = float64(d.Total), float64(d.Used)
	}
	var rx, tx uint64
	if io, err := gnet.IOCountersWithContext(ctx, false); err == nil && len(io) > 0 {
		rx, tx = io[0].BytesRecv, io[0].BytesSent
	}
	if s.proc != nil {
		if mi, err := s.proc.MemoryInfoWithContext(ctx); err == nil {
			out.ProcRSS = float64(mi.RSS)
		}
	}
	var ms runtime.MemStats
	runtime.ReadMemStats(&ms)
	out.GoHeap = float64(ms.HeapAlloc)
	out.Goroutines = runtime.NumGoroutine()

	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.netAt.IsZero() && rx >= s.netRx && tx >= s.netTx {
		if secs := out.At.Sub(s.netAt).Seconds(); secs > 0 {
			out.NetRx = float64(rx-s.netRx) / secs
			out.NetTx = float64(tx-s.netTx) / secs
		}
	}
	s.netAt, s.netRx, s.netTx = out.At, rx, tx
	s.cpuSum += out.CPUPct
	s.cpuN++
	s.latest = out
	s.sampled = true
	return out
}

// System is the latest sample (static fields only until the first Sample).
func (r *Recorder) System() System {
	r.sys.mu.Lock()
	defer r.sys.mu.Unlock()
	return r.sys.latest
}

// MinuteSample is the latest sample with CPU averaged over the samples since the last call.
func (r *Recorder) MinuteSample() (System, bool) {
	r.sys.mu.Lock()
	defer r.sys.mu.Unlock()
	out := r.sys.latest
	if r.sys.cpuN > 0 {
		out.CPUPct = r.sys.cpuSum / float64(r.sys.cpuN)
	}
	r.sys.cpuSum, r.sys.cpuN = 0, 0
	return out, r.sys.sampled
}
