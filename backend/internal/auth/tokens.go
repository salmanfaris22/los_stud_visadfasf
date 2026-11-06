package auth

import (
	"errors"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// Claims are the JWT access-token claims.
type Claims struct {
	Kind string `json:"knd"`
	App  string `json:"app"`
	jwt.RegisteredClaims
}

// Tokens issues and verifies short-lived HS256 access tokens.
type Tokens struct {
	secret []byte
	ttl    time.Duration
}

func NewTokens(secret []byte, ttl time.Duration) *Tokens { return &Tokens{secret: secret, ttl: ttl} }

func (t *Tokens) TTL() time.Duration { return t.ttl }

func (t *Tokens) Issue(userID uuid.UUID, kind, app string) (string, error) {
	now := time.Now()
	c := Claims{Kind: kind, App: app, RegisteredClaims: jwt.RegisteredClaims{
		Subject: userID.String(), Issuer: "lms",
		IssuedAt: jwt.NewNumericDate(now), ExpiresAt: jwt.NewNumericDate(now.Add(t.ttl)),
	}}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, c).SignedString(t.secret)
}

func (t *Tokens) Parse(raw string) (*Claims, error) {
	var c Claims
	_, err := jwt.ParseWithClaims(raw, &c, func(tok *jwt.Token) (any, error) {
		if tok.Method != jwt.SigningMethodHS256 {
			return nil, errors.New("unexpected signing method")
		}
		return t.secret, nil
	}, jwt.WithIssuer("lms"), jwt.WithExpirationRequired())
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func AccessCookieName(app string) string  { return "lms_" + app + "_at" }
func RefreshCookieName(app string) string { return "lms_" + app + "_rt" }

// RefreshCookiePath limits the refresh cookie to the AuthService RPCs (Refresh, Logout) as the
// browser sees them: the web apps proxy /rpc/* to the API.
const RefreshCookiePath = "/rpc/lms.v1.AuthService"

// LegacyRefreshCookiePath is where the REST API kept the refresh cookie; Logout clears it.
const LegacyRefreshCookiePath = "/api/v1/auth"

// CookieFactory builds auth cookies with consistent security attributes.
type CookieFactory struct {
	Domain string
	Secure bool
}

// Session returns the access and refresh cookies of a signed-in session.
func (f CookieFactory) Session(app, accessToken, refreshToken string, accessTTL, refreshTTL time.Duration) []http.Cookie {
	return []http.Cookie{
		f.Make(AccessCookieName(app), accessToken, "/", accessTTL),
		f.Make(RefreshCookieName(app), refreshToken, RefreshCookiePath, refreshTTL),
	}
}

func (f CookieFactory) Make(name, value, path string, maxAge time.Duration) http.Cookie {
	c := http.Cookie{Name: name, Value: value, Path: path, Domain: f.Domain, HttpOnly: true, Secure: f.Secure, SameSite: http.SameSiteLaxMode}
	if maxAge < 0 {
		c.MaxAge = -1
	} else {
		c.MaxAge = int(maxAge.Seconds())
		c.Expires = time.Now().Add(maxAge)
	}
	return c
}
