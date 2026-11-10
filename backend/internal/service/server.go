package service

import (
	"context"
	"log/slog"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/lms/backend/internal/dto"
	"github.com/lms/backend/internal/platform/monitor"
)

// ServerService feeds the admin Server page. The recorder (platform/monitor) counts requests in
// memory; Run samples the machine every 10 s and once a minute writes the finished minutes, the
// slow / failed requests and one machine sample to Postgres. Rows older than 30 days are deleted.
//
// The queries are plain SQL rather than sqlc: they read Postgres' own statistics views and sum
// histogram arrays, which sqlc cannot type.
type ServerService struct{ base }

const (
	serverRetention = 30 * 24 * time.Hour
	onlineWindow    = 5 * time.Minute
)

// periods: how far back, and how wide one chart point is.
var serverPeriods = map[string]struct{ span, step time.Duration }{
	"1h":  {time.Hour, time.Minute},
	"24h": {24 * time.Hour, 15 * time.Minute},
	"7d":  {7 * 24 * time.Hour, time.Hour},
	"30d": {30 * 24 * time.Hour, 6 * time.Hour},
}

func period(p string) (string, time.Duration, time.Duration) {
	if v, ok := serverPeriods[p]; ok {
		return p, v.span, v.step
	}
	v := serverPeriods["24h"]
	return "24h", v.span, v.step
}

// bin is the start of the chart point holding t (same as Postgres date_bin with the Unix epoch).
func bin(t time.Time, step time.Duration) time.Time {
	s := int64(step / time.Second)
	return time.Unix(t.Unix()/s*s, 0).UTC()
}

// ── background ──

// Run samples the machine every 10 s and flushes once a minute until ctx ends.
func (s *ServerService) Run(ctx context.Context) {
	rec := s.Monitor
	rec.Sample(ctx)
	t := time.NewTicker(monitor.SampleEvery)
	defer t.Stop()
	lastFlush := time.Now().Truncate(time.Minute)
	lastClean := time.Time{}
	for {
		select {
		case <-ctx.Done():
			// write what is left (the current minute too) so a restart loses nothing
			done, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
			s.Flush(done, time.Now().Add(time.Minute))
			cancel()
			return
		case now := <-t.C:
			rec.Sample(ctx)
			if m := now.Truncate(time.Minute); m.After(lastFlush) {
				lastFlush = m
				fctx, cancel := context.WithTimeout(ctx, 20*time.Second)
				s.Flush(fctx, m)
				if now.Sub(lastClean) >= time.Hour {
					lastClean = now
					s.cleanup(fctx)
				}
				cancel()
			}
		}
	}
}

// Flush writes the minutes that ended before `before`, the slow / failed requests and one machine
// sample. What cannot be written goes back into the recorder for the next try.
func (s *ServerService) Flush(ctx context.Context, before time.Time) {
	if s.Pool == nil {
		return
	}
	rec := s.Monitor
	stats, notable, dropped := rec.Drain(before)
	if dropped > 0 {
		slog.Warn("server monitor dropped slow/failed requests", "count", dropped)
	}
	if err := s.writeRequests(ctx, stats, notable); err != nil {
		slog.Error("server monitor flush", "err", err)
		rec.Restore(stats, notable)
		return
	}
	if sys, ok := rec.MinuteSample(); ok {
		if err := s.writeSample(ctx, sys, before.Truncate(time.Minute).Add(-time.Minute)); err != nil {
			slog.Error("server monitor sample", "err", err)
		}
	}
}

func (s *ServerService) writeRequests(ctx context.Context, stats []monitor.Stat, notable []monitor.Request) error {
	if len(stats) == 0 && len(notable) == 0 {
		return nil
	}
	b := &pgx.Batch{}
	for _, st := range stats {
		b.Queue(`INSERT INTO server_request_stats (minute, procedure, count, err_4xx, err_5xx, sum_ms, max_ms, buckets)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, st.Minute, st.Procedure, st.Count, st.Err4xx, st.Err5xx, st.SumMs, st.MaxMs, st.Buckets)
	}
	for _, r := range notable {
		// the user may have been deleted since: keep the row, drop the link
		b.Queue(`INSERT INTO server_slow_requests (at, procedure, status, code, ms, user_id, ip)
			VALUES ($1, $2, $3, $4, $5, (SELECT id FROM users WHERE id = $6), $7)`, r.At, r.Procedure, r.Status, r.Code, r.Ms, r.UserID, r.IP)
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := tx.SendBatch(ctx, b).Close(); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *ServerService) writeSample(ctx context.Context, sys monitor.System, at time.Time) error {
	var size int64
	var conns int32
	if err := s.Pool.QueryRow(ctx, `SELECT pg_database_size(current_database()),
		(SELECT count(*)::int FROM pg_stat_activity WHERE datname = current_database())`).Scan(&size, &conns); err != nil {
		return err
	}
	online := len(s.Monitor.Online(onlineWindow))
	_, err := s.Pool.Exec(ctx, `INSERT INTO server_samples (at, host, cpu_pct, load1, mem_total, mem_used, swap_total, swap_used,
		disk_total, disk_used, net_rx, net_tx, proc_rss, go_heap, goroutines, open_streams, online_users, db_size, db_conns)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
		ON CONFLICT (at, host) DO NOTHING`,
		at, sys.Host, sys.CPUPct, sys.Load1, int64(sys.MemTotal), int64(sys.MemUsed), int64(sys.SwapTotal), int64(sys.SwapUsed),
		int64(sys.DiskTotal), int64(sys.DiskUsed), int64(sys.NetRx), int64(sys.NetTx), int64(sys.ProcRSS), int64(sys.GoHeap),
		sys.Goroutines, s.Monitor.OpenStreams(), online, size, conns)
	return err
}

func (s *ServerService) cleanup(ctx context.Context) {
	cut := time.Now().Add(-serverRetention)
	for _, q := range []string{
		`DELETE FROM server_request_stats WHERE minute < $1`,
		`DELETE FROM server_samples WHERE at < $1`,
		`DELETE FROM server_slow_requests WHERE at < $1`,
	} {
		if _, err := s.Pool.Exec(ctx, q, cut); err != nil {
			slog.Error("server monitor cleanup", "err", err)
		}
	}
}

// ── reads ──

// requestStats sums the stored minutes since `from` (plus the ones still in memory) per key: a
// chart point or an endpoint. keyExpr is the SQL for the key; its parameters start at $2.
func (s *ServerService) requestStats(ctx context.Context, from time.Time, keyExpr string, keyArgs []any, key func(monitor.Stat) string) (map[string]*monitor.Stat, error) {
	args := append([]any{from}, keyArgs...)
	out := map[string]*monitor.Stat{}
	get := func(k string) *monitor.Stat {
		st := out[k]
		if st == nil {
			st = &monitor.Stat{Procedure: k, Buckets: make([]int32, len(monitor.Bounds)+1)}
			out[k] = st
		}
		return st
	}
	if s.Pool != nil {
		rows, err := s.Pool.Query(ctx, `SELECT `+keyExpr+` AS k, sum(count)::int, sum(err_4xx)::int, sum(err_5xx)::int, sum(sum_ms), max(max_ms)
			FROM server_request_stats WHERE minute >= $1 GROUP BY 1`, args...)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var k string
			var c monitor.Stat
			if err := rows.Scan(&k, &c.Count, &c.Err4xx, &c.Err5xx, &c.SumMs, &c.MaxMs); err != nil {
				rows.Close()
				return nil, err
			}
			st := get(k)
			st.Count, st.Err4xx, st.Err5xx, st.SumMs, st.MaxMs = c.Count, c.Err4xx, c.Err5xx, c.SumMs, c.MaxMs
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, err
		}
		rows, err = s.Pool.Query(ctx, `SELECT `+keyExpr+` AS k, u.idx::int, sum(u.v)::int
			FROM server_request_stats, unnest(buckets) WITH ORDINALITY AS u(v, idx) WHERE minute >= $1 GROUP BY 1, 2`, args...)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var k string
			var idx, n int32
			if err := rows.Scan(&k, &idx, &n); err != nil {
				rows.Close()
				return nil, err
			}
			if st := get(k); idx >= 1 && int(idx) <= len(st.Buckets) {
				st.Buckets[idx-1] += n
			}
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, err
		}
	}
	for _, p := range s.Monitor.Pending() {
		if !p.Minute.Before(from) {
			get(key(p)).Merge(p)
		}
	}
	return out, nil
}

func traffic(st monitor.Stat) dto.TrafficStat {
	return dto.TrafficStat{Requests: st.Count, Err4xx: st.Err4xx, Err5xx: st.Err5xx, AvgMs: round1(st.AvgMs()), P95Ms: round1(st.P95()), MaxMs: round1(st.MaxMs)}
}

func round1(f float64) float64 { return float64(int64(f*10+0.5)) / 10 }

// Overview: the machine now, the API, traffic for the period and its chart points.
func (s *ServerService) Overview(ctx context.Context, p string) (dto.ServerOverview, error) {
	p, span, step := period(p)
	stepSec := int64(step / time.Second)
	now := time.Now()
	last := bin(now, step)
	first := last.Add(-span + step)
	binExpr := `to_char(date_bin($2::int * interval '1 second', minute, TIMESTAMPTZ 'epoch') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS')`
	keyOf := func(t time.Time) string { return t.UTC().Format("2006-01-02T15:04:05") }
	bins, err := s.requestStats(ctx, first, binExpr, []any{stepSec}, func(st monitor.Stat) string { return keyOf(bin(st.Minute, step)) })
	if err != nil {
		return dto.ServerOverview{}, dbErr(err, "server stats")
	}

	type sample struct {
		cpu, mem, swap, load, rx, tx float64
		online, conns, streams       int32
	}
	samples := map[string]sample{}
	if s.Pool != nil {
		rows, err := s.Pool.Query(ctx, `SELECT to_char(date_bin($2::int * interval '1 second', at, TIMESTAMPTZ 'epoch') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS'),
			avg(cpu_pct)::float8, coalesce(avg(mem_used::float8 / nullif(mem_total, 0)) * 100, 0), coalesce(avg(swap_used::float8 / nullif(swap_total, 0)) * 100, 0),
			avg(load1)::float8, avg(net_rx)::float8, avg(net_tx)::float8, max(online_users), max(db_conns), max(open_streams)
			FROM server_samples WHERE at >= $1 GROUP BY 1`, first, stepSec)
		if err != nil {
			return dto.ServerOverview{}, dbErr(err, "server samples")
		}
		for rows.Next() {
			var k string
			var v sample
			if err := rows.Scan(&k, &v.cpu, &v.mem, &v.swap, &v.load, &v.rx, &v.tx, &v.online, &v.conns, &v.streams); err != nil {
				rows.Close()
				return dto.ServerOverview{}, dbErr(err, "server samples")
			}
			samples[k] = v
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return dto.ServerOverview{}, dbErr(err, "server samples")
		}
	}

	total := monitor.Stat{Buckets: make([]int32, len(monitor.Bounds)+1)}
	points := make([]dto.ServerPoint, 0, int(span/step))
	for t := first; !t.After(last); t = t.Add(step) {
		k := keyOf(t)
		pt := dto.ServerPoint{At: t}
		if st := bins[k]; st != nil {
			total.Merge(*st)
			tr := traffic(*st)
			pt.Requests, pt.Err4xx, pt.Err5xx, pt.AvgMs, pt.P95Ms = tr.Requests, tr.Err4xx, tr.Err5xx, tr.AvgMs, tr.P95Ms
		}
		if v, ok := samples[k]; ok {
			pt.HasSample = true
			pt.CPUPct, pt.MemPct, pt.SwapPct, pt.Load1 = round1(v.cpu), round1(v.mem), round1(v.swap), round1(v.load)
			pt.NetRxRate, pt.NetTxRate, pt.Online, pt.DBConns, pt.OpenStreams = v.rx, v.tx, v.online, v.conns, v.streams
		}
		points = append(points, pt)
	}

	rec := s.Monitor
	sys := rec.System()
	out := dto.ServerOverview{
		Period: p, StepSeconds: int32(stepSec), Points: points,
		System: dto.SystemInfo{Host: sys.Host, OS: sys.OS, Arch: sys.Arch, Cores: int32(sys.Cores), BootTime: sys.BootTime, SampledAt: sys.At,
			CPUPct: round1(sys.CPUPct), Load1: sys.Load1, Load5: sys.Load5, Load15: sys.Load15,
			MemTotalBytes: sys.MemTotal, MemUsedBytes: sys.MemUsed, SwapTotal: sys.SwapTotal, SwapUsed: sys.SwapUsed,
			DiskTotal: sys.DiskTotal, DiskUsed: sys.DiskUsed, NetRxRate: sys.NetRx, NetTxRate: sys.NetTx},
		API: dto.APIInfo{Version: sys.Version, GoVersion: sys.GoVersion, StartedAt: rec.Started(), RSSBytes: sys.ProcRSS, HeapBytes: sys.GoHeap,
			Goroutines: int32(sys.Goroutines), OpenStreams: int32(rec.OpenStreams())},
		Traffic:   traffic(total),
		Recent:    traffic(rec.Live(5)),
		PerMinute: rec.LastMinute(),
	}
	for _, u := range rec.Online(onlineWindow) {
		out.Online.Total++
		if u.Staff {
			out.Online.Staff++
		} else {
			out.Online.Students++
		}
	}
	out.Database = s.brief(ctx)
	return out, nil
}

func (s *ServerService) brief(ctx context.Context) dto.DatabaseBrief {
	var b dto.DatabaseBrief
	if s.Pool == nil {
		return b
	}
	start := time.Now()
	if err := s.Pool.Ping(ctx); err != nil {
		return b
	}
	b.Up, b.PingMs = true, round1(float64(time.Since(start).Microseconds())/1000)
	var size int64
	if err := s.Pool.QueryRow(ctx, `SELECT pg_database_size(current_database()),
		(SELECT count(*)::int FROM pg_stat_activity WHERE datname = current_database())`).Scan(&size, &b.Connections); err == nil {
		b.SizeBytes = float64(size)
	}
	return b
}

// Endpoints: calls, errors and timings per endpoint over the period, sorted busy | slow | errors.
func (s *ServerService) Endpoints(ctx context.Context, p, sortBy string) ([]dto.EndpointStat, error) {
	_, span, _ := period(p)
	from := time.Now().Add(-span).Truncate(time.Minute)
	stats, err := s.requestStats(ctx, from, `procedure`, nil, func(st monitor.Stat) string { return st.Procedure })
	if err != nil {
		return nil, dbErr(err, "server stats")
	}
	out := make([]dto.EndpointStat, 0, len(stats))
	for proc, st := range stats {
		svc, method := splitProcedure(proc)
		out = append(out, dto.EndpointStat{Procedure: proc, Service: svc, Method: method, Calls: st.Count, Err4xx: st.Err4xx, Err5xx: st.Err5xx,
			AvgMs: round1(st.AvgMs()), P95Ms: round1(st.P95()), MaxMs: round1(st.MaxMs)})
	}
	sort.Slice(out, func(i, j int) bool {
		a, b := out[i], out[j]
		switch sortBy {
		case "slow":
			if a.P95Ms != b.P95Ms {
				return a.P95Ms > b.P95Ms
			}
		case "errors":
			if a.Err5xx != b.Err5xx {
				return a.Err5xx > b.Err5xx
			}
			if a.Err4xx != b.Err4xx {
				return a.Err4xx > b.Err4xx
			}
		}
		if a.Calls != b.Calls {
			return a.Calls > b.Calls
		}
		return a.Procedure < b.Procedure
	})
	return out, nil
}

// splitProcedure: "/lms.v1.AuthService/Login" -> ("AuthService", "Login"); HTTP routes -> ("HTTP", "GET /files/{id}").
func splitProcedure(p string) (string, string) {
	if strings.HasPrefix(p, "/") {
		svc, method, _ := strings.Cut(strings.TrimPrefix(p, "/"), "/")
		return strings.TrimPrefix(svc, "lms.v1."), method
	}
	return "HTTP", p
}

// Requests: the latest requests (live, from memory) or the slow / failed ones of the last 30 days.
func (s *ServerService) Requests(ctx context.Context, kind string, limit int) ([]dto.RequestLog, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var reqs []monitor.Request
	switch kind {
	case "slow", "failed":
		keep := monitor.Request.Slow
		where := `ms >= 1000`
		if kind == "failed" {
			keep, where = monitor.Request.Failed, `status >= 500`
		}
		for _, r := range s.Monitor.PendingNotable() {
			if keep(r) {
				reqs = append(reqs, r)
			}
		}
		if s.Pool != nil {
			rows, err := s.Pool.Query(ctx, `SELECT at, procedure, status, code, ms, user_id, ip FROM server_slow_requests WHERE `+where+` ORDER BY at DESC LIMIT $1`, limit)
			if err != nil {
				return nil, dbErr(err, "slow requests")
			}
			for rows.Next() {
				var r monitor.Request
				if err := rows.Scan(&r.At, &r.Procedure, &r.Status, &r.Code, &r.Ms, &r.UserID, &r.IP); err != nil {
					rows.Close()
					return nil, dbErr(err, "slow requests")
				}
				reqs = append(reqs, r)
			}
			rows.Close()
			if err := rows.Err(); err != nil {
				return nil, dbErr(err, "slow requests")
			}
		}
		sort.SliceStable(reqs, func(i, j int) bool { return reqs[i].At.After(reqs[j].At) })
		if len(reqs) > limit {
			reqs = reqs[:limit]
		}
	default:
		reqs = s.Monitor.Recent(limit, nil)
	}
	ids := make([]uuid.UUID, 0, len(reqs))
	for _, r := range reqs {
		if r.UserID != nil {
			ids = append(ids, *r.UserID)
		}
	}
	users, err := s.userBriefs(ctx, ids)
	if err != nil {
		return nil, err
	}
	out := make([]dto.RequestLog, 0, len(reqs))
	for _, r := range reqs {
		l := dto.RequestLog{At: r.At, Procedure: r.Procedure, Status: int32(r.Status), Code: r.Code, Ms: round1(r.Ms), UserID: r.UserID, IP: r.IP}
		if r.UserID != nil {
			l.UserName = users[*r.UserID].Name
		}
		out = append(out, l)
	}
	return out, nil
}

// Online: users who made a request in the last 5 minutes or have a tab open.
func (s *ServerService) Online(ctx context.Context) ([]dto.OnlineUser, error) {
	seen := s.Monitor.Online(onlineWindow)
	ids := make([]uuid.UUID, len(seen))
	for i, u := range seen {
		ids[i] = u.UserID
	}
	users, err := s.userBriefs(ctx, ids)
	if err != nil {
		return nil, err
	}
	out := make([]dto.OnlineUser, 0, len(seen))
	for _, u := range seen {
		b, ok := users[u.UserID]
		if !ok {
			continue // deleted since
		}
		out = append(out, dto.OnlineUser{ID: u.UserID, Name: b.Name, Email: b.Email, Kind: b.Kind, AvatarURL: b.Avatar,
			LastSeen: u.LastSeen, Requests: int32(u.Requests), Tabs: int32(u.Streams), IP: u.IP})
	}
	return out, nil
}

type userBrief struct{ Name, Email, Kind, Avatar string }

func (s *ServerService) userBriefs(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]userBrief, error) {
	out := map[uuid.UUID]userBrief{}
	if len(ids) == 0 || s.Pool == nil {
		return out, nil
	}
	rows, err := s.Pool.Query(ctx, `SELECT id, name, email, kind, coalesce(avatar_url, '') FROM users WHERE id = ANY($1)`, ids)
	if err != nil {
		return nil, dbErr(err, "users")
	}
	defer rows.Close()
	for rows.Next() {
		var id uuid.UUID
		var b userBrief
		if err := rows.Scan(&id, &b.Name, &b.Email, &b.Kind, &b.Avatar); err != nil {
			return nil, dbErr(err, "users")
		}
		out[id] = b
	}
	return out, rows.Err()
}

// Database: Postgres version, size, cache hit rate, connections per login role, biggest tables
// and the statements running now.
func (s *ServerService) Database(ctx context.Context) (dto.DatabaseStats, error) {
	var d dto.DatabaseStats
	if s.Pool == nil || s.Pool.Ping(ctx) != nil {
		return d, nil
	}
	d.Up = true
	ps := s.Pool.Stat()
	d.Pool = dto.DBPool{Max: ps.MaxConns(), Total: ps.TotalConns(), Idle: ps.IdleConns(), InUse: ps.AcquiredConns(),
		Acquires: float64(ps.AcquireCount()), WaitedMs: round1(float64(ps.AcquireDuration().Microseconds()) / 1000), EmptyWaits: float64(ps.EmptyAcquireCount())}

	var size, hit, read, commits, rollbacks, deadlocks, temp int64
	err := s.Pool.QueryRow(ctx, `SELECT current_database(), current_setting('server_version'), pg_postmaster_start_time(),
		pg_database_size(current_database()), current_setting('max_connections')::int,
		(SELECT count(*)::int FROM pg_stat_activity WHERE backend_type = 'client backend'),
		blks_hit, blks_read, xact_commit, xact_rollback, deadlocks, temp_bytes
		FROM pg_stat_database WHERE datname = current_database()`).
		Scan(&d.Name, &d.Version, &d.StartedAt, &size, &d.MaxConnections, &d.Connections, &hit, &read, &commits, &rollbacks, &deadlocks, &temp)
	if err != nil {
		return d, dbErr(err, "database stats")
	}
	d.SizeBytes, d.Commits, d.Rollbacks, d.Deadlocks, d.TempBytes = float64(size), float64(commits), float64(rollbacks), float64(deadlocks), float64(temp)
	if hit+read > 0 {
		d.CacheHitPct = round1(float64(hit) * 100 / float64(hit+read))
	}

	d.Users = []dto.DBUser{}
	rows, err := s.Pool.Query(ctx, `SELECT r.rolname, r.rolsuper, count(a.pid)::int,
		(count(*) FILTER (WHERE a.state = 'active'))::int, (count(*) FILTER (WHERE a.state = 'idle'))::int,
		(count(*) FILTER (WHERE a.state LIKE 'idle in transaction%'))::int
		FROM pg_roles r LEFT JOIN pg_stat_activity a ON a.usename = r.rolname AND a.backend_type = 'client backend'
		WHERE r.rolcanlogin GROUP BY r.rolname, r.rolsuper ORDER BY 3 DESC, 1`)
	if err != nil {
		return d, dbErr(err, "database users")
	}
	for rows.Next() {
		var u dto.DBUser
		if err := rows.Scan(&u.Name, &u.Superuser, &u.Connections, &u.Active, &u.Idle, &u.IdleInTx); err != nil {
			rows.Close()
			return d, dbErr(err, "database users")
		}
		d.Users = append(d.Users, u)
	}
	rows.Close()

	d.Tables = []dto.DBTable{}
	rows, err = s.Pool.Query(ctx, `SELECT relname, n_live_tup, n_dead_tup, pg_total_relation_size(relid), seq_scan, coalesce(idx_scan, 0),
		greatest(last_vacuum, last_autovacuum)
		FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC, relname LIMIT 15`)
	if err != nil {
		return d, dbErr(err, "database tables")
	}
	for rows.Next() {
		var t dto.DBTable
		var live, dead, tsize, seq, idx int64
		if err := rows.Scan(&t.Name, &live, &dead, &tsize, &seq, &idx, &t.LastVacuum); err != nil {
			rows.Close()
			return d, dbErr(err, "database tables")
		}
		t.Rows, t.DeadRows, t.SizeBytes, t.SeqScans, t.IndexScans = float64(live), float64(dead), float64(tsize), float64(seq), float64(idx)
		d.Tables = append(d.Tables, t)
	}
	rows.Close()

	d.Running = []dto.DBQuery{}
	rows, err = s.Pool.Query(ctx, `SELECT pid, coalesce(usename, ''), coalesce(application_name, ''), coalesce(state, ''),
		coalesce(wait_event_type || ': ' || wait_event, ''), coalesce(extract(epoch FROM now() - query_start), 0)::float8, left(coalesce(query, ''), 300)
		FROM pg_stat_activity WHERE backend_type = 'client backend' AND pid <> pg_backend_pid() AND state IS DISTINCT FROM 'idle'
		ORDER BY query_start NULLS LAST LIMIT 20`)
	if err != nil {
		return d, dbErr(err, "running queries")
	}
	for rows.Next() {
		var q dto.DBQuery
		if err := rows.Scan(&q.PID, &q.User, &q.App, &q.State, &q.Wait, &q.Seconds, &q.Query); err != nil {
			rows.Close()
			return d, dbErr(err, "running queries")
		}
		q.Seconds = round1(q.Seconds)
		d.Running = append(d.Running, q)
	}
	rows.Close()
	return d, nil
}
