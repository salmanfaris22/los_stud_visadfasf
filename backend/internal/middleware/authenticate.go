// Package middleware holds HTTP cross-cutting concerns: authentication, permission guards,
// rate limiting, CORS, security headers and request logging.
package middleware

import (
	"net/http"
	"strings"

	"github.com/google/uuid"

	"github.com/lms/backend/internal/auth"
	"github.com/lms/backend/internal/service"
)

// Authenticate attaches request metadata and, when a valid access token is present, the
// signed-in Principal. The portal is chosen by the X-LMS-App header (admin | student).
//
// CSRF: cookie-authenticated writes must carry X-LMS-App. Browsers only send custom headers
// on same-origin or CORS-approved requests, so cross-site form posts are rejected.
func Authenticate(tokens *auth.Tokens, access *service.AccessService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			header := r.Header.Get("X-LMS-App")
			app := auth.AppStudent
			if header == auth.AppAdmin {
				app = auth.AppAdmin
			}
			meta := auth.Meta{App: app, IP: clientIP(r), UserAgent: r.UserAgent(), Cookies: r.Cookies()}
			ctx := auth.WithMeta(r.Context(), meta)

			raw, fromCookie := "", false
			if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
				raw = strings.TrimPrefix(h, "Bearer ")
			} else if v := meta.Cookie(auth.AccessCookieName(app)); v != "" {
				raw, fromCookie = v, true
			}
			if fromCookie && !safeMethod(r.Method) && header == "" {
				writeJSONError(w, http.StatusForbidden, "missing X-LMS-App header")
				return
			}
			if raw != "" {
				if c, err := tokens.Parse(raw); err == nil && c.App == app {
					if id, err := uuid.Parse(c.Subject); err == nil {
						if p, err := access.Load(ctx, id, app); err == nil {
							ctx = auth.WithPrincipal(ctx, p)
						}
					}
				}
			}
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// PrincipalFromAnyCookie is used by browser navigations (file links, OAuth starts) that cannot
// send the X-LMS-App header: it tries the admin cookie, then the student cookie.
func PrincipalFromAnyCookie(r *http.Request, tokens *auth.Tokens, access *service.AccessService, only string) *auth.Principal {
	for _, app := range []string{auth.AppAdmin, auth.AppStudent} {
		if only != "" && app != only {
			continue
		}
		c, err := r.Cookie(auth.AccessCookieName(app))
		if err != nil {
			continue
		}
		claims, err := tokens.Parse(c.Value)
		if err != nil || claims.App != app {
			continue
		}
		id, err := uuid.Parse(claims.Subject)
		if err != nil {
			continue
		}
		if p, err := access.Load(r.Context(), id, app); err == nil {
			return p
		}
	}
	return nil
}

func safeMethod(m string) bool {
	return m == http.MethodGet || m == http.MethodHead || m == http.MethodOptions
}

func clientIP(r *http.Request) string {
	addr := r.RemoteAddr
	if i := strings.LastIndex(addr, ":"); i > 0 && !strings.HasSuffix(addr, "]") {
		addr = addr[:i]
	}
	return strings.Trim(addr, "[]")
}

func writeJSONError(w http.ResponseWriter, status int, detail string) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(`{"title":"` + http.StatusText(status) + `","status":` + itoa(status) + `,"detail":"` + detail + `"}`))
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	b := []byte{}
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	return string(b)
}
