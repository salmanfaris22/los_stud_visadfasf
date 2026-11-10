package dto

import (
	"time"

	"github.com/google/uuid"
)

// Server monitor (admin Server page). Sizes are bytes and rates bytes per second, sent as
// doubles because they pass the int32 range.

// ServerOverview is the top of the Server page: the machine now, API traffic for the period and the charts.
type ServerOverview struct {
	Period      string        `json:"period"`
	StepSeconds int32         `json:"step_seconds"` // width of one chart point
	System      SystemInfo    `json:"system"`
	API         APIInfo       `json:"api"`
	Traffic     TrafficStat   `json:"traffic"`    // whole period
	Recent      TrafficStat   `json:"recent"`     // last 5 minutes
	PerMinute   int32         `json:"per_minute"` // requests in the last whole minute
	Online      OnlineCount   `json:"online"`
	Database    DatabaseBrief `json:"database"`
	Points      []ServerPoint `json:"points"`
}

// SystemInfo is the latest sample of the machine the API runs on.
type SystemInfo struct {
	Host          string    `json:"host"`
	OS            string    `json:"os"`
	Arch          string    `json:"arch"`
	Cores         int32     `json:"cores"`
	BootTime      time.Time `json:"boot_time"`
	SampledAt     time.Time `json:"sampled_at"`
	CPUPct        float64   `json:"cpu_pct"`
	Load1         float64   `json:"load1"`
	Load5         float64   `json:"load5"`
	Load15        float64   `json:"load15"`
	MemTotalBytes float64   `json:"mem_total_bytes"`
	MemUsedBytes  float64   `json:"mem_used_bytes"`
	SwapTotal     float64   `json:"swap_total_bytes"`
	SwapUsed      float64   `json:"swap_used_bytes"`
	DiskTotal     float64   `json:"disk_total_bytes"`
	DiskUsed      float64   `json:"disk_used_bytes"`
	NetRxRate     float64   `json:"net_rx_rate"`
	NetTxRate     float64   `json:"net_tx_rate"`
}

// APIInfo is this API process.
type APIInfo struct {
	Version     string    `json:"version"` // git commit of the build
	GoVersion   string    `json:"go_version"`
	StartedAt   time.Time `json:"started_at"`
	RSSBytes    float64   `json:"rss_bytes"`
	HeapBytes   float64   `json:"heap_bytes"`
	Goroutines  int32     `json:"goroutines"`
	OpenStreams int32     `json:"open_streams"` // realtime streams = open browser tabs
}

// TrafficStat sums requests: count, errors and response times (ms).
type TrafficStat struct {
	Requests int32   `json:"requests"`
	Err4xx   int32   `json:"err_4xx"`
	Err5xx   int32   `json:"err_5xx"`
	AvgMs    float64 `json:"avg_ms"`
	P95Ms    float64 `json:"p95_ms"`
	MaxMs    float64 `json:"max_ms"`
}

// OnlineCount is how many users made a request in the last 5 minutes or have a tab open.
type OnlineCount struct {
	Total    int32 `json:"total"`
	Staff    int32 `json:"staff"`
	Students int32 `json:"students"`
}

// DatabaseBrief is the Postgres summary for the top cards.
type DatabaseBrief struct {
	Up          bool    `json:"up"`
	SizeBytes   float64 `json:"size_bytes"`
	Connections int32   `json:"connections"`
	PingMs      float64 `json:"ping_ms"`
}

// ServerPoint is one chart point. has_sample is false where the API was not running (no machine numbers).
type ServerPoint struct {
	At          time.Time `json:"at"`
	Requests    int32     `json:"requests"`
	Err4xx      int32     `json:"err_4xx"`
	Err5xx      int32     `json:"err_5xx"`
	AvgMs       float64   `json:"avg_ms"`
	P95Ms       float64   `json:"p95_ms"`
	HasSample   bool      `json:"has_sample"`
	CPUPct      float64   `json:"cpu_pct"`
	MemPct      float64   `json:"mem_pct"`
	SwapPct     float64   `json:"swap_pct"`
	Load1       float64   `json:"load1"`
	NetRxRate   float64   `json:"net_rx_rate"`
	NetTxRate   float64   `json:"net_tx_rate"`
	Online      int32     `json:"online"`
	DBConns     int32     `json:"db_conns"`
	OpenStreams int32     `json:"open_streams"`
}

// EndpointStat is one API endpoint (RPC or plain-HTTP route) over the period.
type EndpointStat struct {
	Procedure string  `json:"procedure"`
	Service   string  `json:"service"`
	Method    string  `json:"method"`
	Calls     int32   `json:"calls"`
	Err4xx    int32   `json:"err_4xx"`
	Err5xx    int32   `json:"err_5xx"`
	AvgMs     float64 `json:"avg_ms"`
	P95Ms     float64 `json:"p95_ms"`
	MaxMs     float64 `json:"max_ms"`
}

// RequestLog is one request in the live, slow or failed list.
type RequestLog struct {
	At        time.Time  `json:"at"`
	Procedure string     `json:"procedure"`
	Status    int32      `json:"status"`
	Code      string     `json:"code"`
	Ms        float64    `json:"ms"`
	UserID    *uuid.UUID `json:"user_id"`
	UserName  string     `json:"user_name"`
	IP        string     `json:"ip"`
}

// OnlineUser is a user active in the last 5 minutes.
type OnlineUser struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	Kind      string    `json:"kind"` // staff | student
	AvatarURL string    `json:"avatar_url"`
	LastSeen  time.Time `json:"last_seen"`
	Requests  int32     `json:"requests"`
	Tabs      int32     `json:"tabs"` // open realtime streams
	IP        string    `json:"ip"`
}

// DatabaseStats is the Postgres section of the Server page.
type DatabaseStats struct {
	Up             bool       `json:"up"`
	Name           string     `json:"name"`
	Version        string     `json:"version"`
	StartedAt      *time.Time `json:"started_at"`
	SizeBytes      float64    `json:"size_bytes"`
	CacheHitPct    float64    `json:"cache_hit_pct"`
	Commits        float64    `json:"commits"`
	Rollbacks      float64    `json:"rollbacks"`
	Deadlocks      float64    `json:"deadlocks"`
	TempBytes      float64    `json:"temp_bytes"`
	MaxConnections int32      `json:"max_connections"`
	Connections    int32      `json:"connections"`
	Pool           DBPool     `json:"pool"`
	Users          []DBUser   `json:"users"`
	Tables         []DBTable  `json:"tables"`
	Running        []DBQuery  `json:"running"`
}

// DBPool is the API's own connection pool.
type DBPool struct {
	Max        int32   `json:"max"`
	Total      int32   `json:"total"`
	Idle       int32   `json:"idle"`
	InUse      int32   `json:"in_use"`
	Acquires   float64 `json:"acquires"`
	WaitedMs   float64 `json:"waited_ms"` // total time spent waiting for a free connection
	EmptyWaits float64 `json:"empty_waits"`
}

// DBUser is a Postgres login role and its open connections (all databases).
type DBUser struct {
	Name        string `json:"name"`
	Superuser   bool   `json:"superuser"`
	Connections int32  `json:"connections"`
	Active      int32  `json:"active"`
	Idle        int32  `json:"idle"`
	IdleInTx    int32  `json:"idle_in_tx"`
}

// DBTable is one table of the app database.
type DBTable struct {
	Name       string     `json:"name"`
	Rows       float64    `json:"rows"`
	DeadRows   float64    `json:"dead_rows"`
	SizeBytes  float64    `json:"size_bytes"`
	SeqScans   float64    `json:"seq_scans"`
	IndexScans float64    `json:"index_scans"`
	LastVacuum *time.Time `json:"last_vacuum"`
}

// DBQuery is a statement running right now (other than this one).
type DBQuery struct {
	PID     int32   `json:"pid"`
	User    string  `json:"user"`
	App     string  `json:"app"`
	State   string  `json:"state"`
	Wait    string  `json:"wait"`
	Seconds float64 `json:"seconds"`
	Query   string  `json:"query"`
}
