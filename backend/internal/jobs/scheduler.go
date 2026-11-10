// Package jobs runs periodic background work inside the API process:
// live-session reminders every minute and token cleanup every hour.
package jobs

import (
	"context"
	"log/slog"
	"time"

	"github.com/lms/backend/internal/service"
)

// Run blocks until ctx is cancelled. A Postgres advisory lock keeps each job single-instance,
// so a second API process (or an overlapping run) skips the tick instead of doubling work.
func Run(ctx context.Context, s *service.Services, d *service.Deps) {
	minute := time.NewTicker(time.Minute)
	hour := time.NewTicker(time.Hour)
	defer minute.Stop()
	defer hour.Stop()
	tick := func(name string, _ time.Duration, fn func(context.Context) error) {
		if d.Pool != nil {
			conn, err := d.Pool.Acquire(ctx)
			if err != nil {
				return
			}
			defer conn.Release()
			var ok bool
			if err := conn.QueryRow(ctx, "SELECT pg_try_advisory_lock(hashtext($1))", "lms:job:"+name).Scan(&ok); err != nil || !ok {
				return
			}
			defer conn.Exec(context.WithoutCancel(ctx), "SELECT pg_advisory_unlock(hashtext($1))", "lms:job:"+name)
		}
		if err := fn(ctx); err != nil {
			slog.Error("job failed", "job", name, "err", err)
		}
	}
	reminders := func(ctx context.Context) error {
		n, err := s.Live.SendDueReminders(ctx)
		if n > 0 {
			slog.Info("live reminders sent", "sessions", n)
		}
		return err
	}
	tick("reminders", 50*time.Second, reminders)
	for {
		select {
		case <-ctx.Done():
			return
		case <-minute.C:
			tick("reminders", 50*time.Second, reminders)
		case <-hour.C:
			tick("cleanup", 55*time.Minute, s.Auth.Cleanup)
		}
	}
}
