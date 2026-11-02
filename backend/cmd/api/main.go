// Command api runs the LMS HTTP server (REST + WebSocket + background jobs).
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	dbfiles "github.com/lms/backend/db"
	"github.com/lms/backend/internal/auth"
	"github.com/lms/backend/internal/config"
	"github.com/lms/backend/internal/jobs"
	"github.com/lms/backend/internal/platform/google"
	"github.com/lms/backend/internal/platform/mailer"
	"github.com/lms/backend/internal/platform/realtime"
	"github.com/lms/backend/internal/platform/storage"
	"github.com/lms/backend/internal/repository"
	"github.com/lms/backend/internal/server"
	"github.com/lms/backend/internal/service"
)

func main() {
	if err := run(); err != nil {
		slog.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	level := slog.LevelInfo
	if os.Getenv("LOG_LEVEL") == "debug" {
		level = slog.LevelDebug
	}
	var h slog.Handler = slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: level})
	if cfg.IsProd() {
		h = slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: level})
	}
	slog.SetDefault(slog.New(h))

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if cfg.AutoMigrate {
		if err := dbfiles.Up(cfg.DatabaseURL); err != nil {
			return err
		}
		slog.Info("migrations applied")
	}
	pcfg, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		return err
	}
	pcfg.MaxConns = 20
	pcfg.MaxConnIdleTime = 5 * time.Minute
	pool, err := pgxpool.NewWithConfig(ctx, pcfg)
	if err != nil {
		return err
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		return err
	}

	ropt, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		return err
	}
	rdb := redis.NewClient(ropt)
	defer rdb.Close()
	if err := rdb.Ping(ctx).Err(); err != nil {
		slog.Warn("redis unavailable: rate limits and realtime fan-out are disabled", "err", err)
		rdb = nil
	}

	store, err := storage.New(ctx, cfg)
	if err != nil {
		return err
	}
	hub := realtime.NewHub(rdb)
	go hub.Run(ctx)

	deps := &service.Deps{
		Cfg: cfg, Pool: pool, Q: repository.New(pool), Redis: rdb, Store: store, Mail: mailer.New(cfg), Hub: hub, Google: google.New(cfg),
		Tokens: auth.NewTokens(cfg.JWTSecret, cfg.AccessTTL), Cookies: auth.CookieFactory{Domain: cfg.CookieDomain, Secure: cfg.CookieSecure},
	}
	app := server.New(deps)
	if cfg.RunJobs {
		go jobs.Run(ctx, app.Services, deps)
	}

	srv := &http.Server{Addr: cfg.HTTPAddr, Handler: app.Router, ReadHeaderTimeout: 10 * time.Second, ReadTimeout: 60 * time.Second,
		WriteTimeout: 120 * time.Second, IdleTimeout: 120 * time.Second}
	errCh := make(chan error, 1)
	go func() {
		slog.Info("api listening", "addr", cfg.HTTPAddr, "docs", cfg.APIPublicURL+"/docs")
		errCh <- srv.ListenAndServe()
	}()
	select {
	case err := <-errCh:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
		slog.Info("shutting down")
	}
	shutdown, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return srv.Shutdown(shutdown)
}
