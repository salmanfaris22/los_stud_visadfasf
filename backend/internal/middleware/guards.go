package middleware

import (
	"fmt"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/redis/go-redis/v9"

	"github.com/lms/backend/internal/auth"
)

// Fn is a per-operation middleware attached to an endpoint.
type Fn = func(ctx huma.Context, next func(huma.Context))

// Guards builds the per-endpoint access rules.
type Guards struct {
	api   huma.API
	redis *redis.Client
}

func NewGuards(api huma.API, rdb *redis.Client) *Guards { return &Guards{api: api, redis: rdb} }

func (g *Guards) deny(ctx huma.Context, status int, msg string) {
	_ = huma.WriteErr(g.api, ctx, status, msg)
}

// Auth allows any signed-in user.
func (g *Guards) Auth() Fn {
	return func(ctx huma.Context, next func(huma.Context)) {
		if auth.FromContext(ctx.Context()) == nil {
			g.deny(ctx, http.StatusUnauthorized, "sign in required")
			return
		}
		next(ctx)
	}
}

// Student allows signed-in students.
func (g *Guards) Student() Fn {
	return func(ctx huma.Context, next func(huma.Context)) {
		p := auth.FromContext(ctx.Context())
		switch {
		case p == nil:
			g.deny(ctx, http.StatusUnauthorized, "sign in required")
		case !p.IsStudent():
			g.deny(ctx, http.StatusForbidden, "students only")
		default:
			next(ctx)
		}
	}
}

// Staff allows any signed-in staff member (finer checks happen in services).
func (g *Guards) Staff() Fn {
	return func(ctx huma.Context, next func(huma.Context)) {
		p := auth.FromContext(ctx.Context())
		switch {
		case p == nil:
			g.deny(ctx, http.StatusUnauthorized, "sign in required")
		case !p.IsStaff():
			g.deny(ctx, http.StatusForbidden, "staff only")
		default:
			next(ctx)
		}
	}
}

// Perm allows staff holding module:action (super admins always pass).
func (g *Guards) Perm(module, action string) Fn {
	return func(ctx huma.Context, next func(huma.Context)) {
		p := auth.FromContext(ctx.Context())
		switch {
		case p == nil:
			g.deny(ctx, http.StatusUnauthorized, "sign in required")
		case !p.IsStaff() || !p.Can(module, action):
			g.deny(ctx, http.StatusForbidden, fmt.Sprintf("you need the %s %s permission", module, action))
		default:
			next(ctx)
		}
	}
}

// RateLimit allows `limit` calls per window per client IP for a named bucket (Redis fixed window).
func (g *Guards) RateLimit(name string, limit int, window time.Duration) Fn {
	return func(ctx huma.Context, next func(huma.Context)) {
		if g.redis != nil {
			ip := auth.MetaFrom(ctx.Context()).IP
			key := fmt.Sprintf("rl:%s:%s:%d", name, ip, time.Now().Unix()/int64(window.Seconds()))
			if n, err := g.redis.Incr(ctx.Context(), key).Result(); err == nil {
				if n == 1 {
					g.redis.Expire(ctx.Context(), key, window)
				}
				if n > int64(limit) {
					ctx.SetHeader("Retry-After", fmt.Sprint(int(window.Seconds())))
					g.deny(ctx, http.StatusTooManyRequests, "too many requests, try again later")
					return
				}
			}
		}
		next(ctx)
	}
}
