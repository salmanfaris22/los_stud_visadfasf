// Package config loads runtime settings from the environment (and an optional .env file).
package config

import (
	"encoding/base64"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	Env           string
	HTTPAddr      string
	DatabaseURL   string
	JWTSecret     []byte
	EncryptionKey []byte // 32 bytes, AES-256-GCM for stored OAuth tokens

	AdminAppURL   string
	StudentAppURL string
	APIPublicURL  string
	CookieDomain  string
	CookieSecure  bool
	TrustProxy    bool // read client IP from X-Forwarded-For (behind a reverse proxy)
	AutoMigrate   bool
	RunJobs       bool

	AccessTTL  time.Duration
	RefreshTTL time.Duration

	S3Endpoint     string
	S3Region       string
	S3Bucket       string
	S3AccessKey    string
	S3SecretKey    string
	S3UseSSL       bool
	S3PublicURL    string // optional CDN / public bucket base URL
	S3CreateBucket bool

	SMTPHost string
	SMTPPort int
	SMTPUser string
	SMTPPass string
	SMTPFrom string

	GoogleClientID     string
	GoogleClientSecret string

	SeedAdminEmail    string
	SeedAdminPassword string
}

func (c *Config) IsProd() bool { return c.Env == "production" }

// Load reads configuration. Missing required values in production are an error.
func Load() (*Config, error) {
	_ = godotenv.Load(".env", "../.env")

	c := &Config{
		Env:           get("APP_ENV", "development"),
		HTTPAddr:      get("HTTP_ADDR", ":8080"),
		DatabaseURL:   get("DATABASE_URL", "postgres://lms:lms@localhost:5432/lms?sslmode=disable"),
		AdminAppURL:   strings.TrimRight(get("ADMIN_APP_URL", "http://localhost:3001"), "/"),
		StudentAppURL: strings.TrimRight(get("STUDENT_APP_URL", "http://localhost:3000"), "/"),
		APIPublicURL:  strings.TrimRight(get("API_PUBLIC_URL", "http://localhost:8080"), "/"),
		CookieDomain:  get("COOKIE_DOMAIN", ""),
		CookieSecure:  getBool("COOKIE_SECURE", false),
		TrustProxy:    getBool("TRUST_PROXY", false),
		AutoMigrate:   getBool("AUTO_MIGRATE", true),
		RunJobs:       getBool("RUN_JOBS", true),
		AccessTTL:     getDuration("ACCESS_TTL", 15*time.Minute),
		RefreshTTL:    getDuration("REFRESH_TTL", 7*24*time.Hour),

		S3Endpoint:     get("S3_ENDPOINT", "localhost:9000"),
		S3Region:       get("S3_REGION", "auto"),
		S3Bucket:       get("S3_BUCKET", "lms"),
		S3AccessKey:    get("S3_ACCESS_KEY", "minioadmin"),
		S3SecretKey:    get("S3_SECRET_KEY", "minioadmin"),
		S3UseSSL:       getBool("S3_USE_SSL", false),
		S3PublicURL:    strings.TrimRight(get("S3_PUBLIC_URL", ""), "/"),
		S3CreateBucket: getBool("S3_CREATE_BUCKET", true),

		SMTPHost: get("SMTP_HOST", "localhost"),
		SMTPPort: getInt("SMTP_PORT", 1025),
		SMTPUser: get("SMTP_USER", ""),
		SMTPPass: get("SMTP_PASS", ""),
		SMTPFrom: get("SMTP_FROM", "LMS <no-reply@lms.local>"),

		GoogleClientID:     get("GOOGLE_CLIENT_ID", ""),
		GoogleClientSecret: get("GOOGLE_CLIENT_SECRET", ""),

		SeedAdminEmail:    get("SEED_ADMIN_EMAIL", "admin@lms.local"),
		SeedAdminPassword: get("SEED_ADMIN_PASSWORD", "Admin@12345"),
	}

	secret := get("JWT_SECRET", "")
	if secret == "" {
		if c.IsProd() {
			return nil, fmt.Errorf("JWT_SECRET is required in production")
		}
		secret = "dev-only-jwt-secret-change-me-please-0123456789"
	}
	if len(secret) < 32 {
		return nil, fmt.Errorf("JWT_SECRET must be at least 32 characters")
	}
	c.JWTSecret = []byte(secret)

	key := get("ENCRYPTION_KEY", "")
	if key == "" {
		if c.IsProd() {
			return nil, fmt.Errorf("ENCRYPTION_KEY is required in production (base64, 32 bytes)")
		}
		key = base64.StdEncoding.EncodeToString([]byte("dev-only-encryption-key-32bytes!"))
	}
	raw, err := base64.StdEncoding.DecodeString(key)
	if err != nil || len(raw) != 32 {
		return nil, fmt.Errorf("ENCRYPTION_KEY must be base64 of exactly 32 bytes")
	}
	c.EncryptionKey = raw
	return c, nil
}

func get(k, def string) string {
	v, ok := os.LookupEnv(k)
	v = strings.TrimSpace(v)
	// godotenv keeps the comment as the value for `KEY=   # note` (empty value + comment),
	// so a value that starts with "#" counts as unset.
	if !ok || v == "" || strings.HasPrefix(v, "#") {
		return def
	}
	return v
}

func getBool(k string, def bool) bool {
	if v, err := strconv.ParseBool(get(k, "")); err == nil {
		return v
	}
	return def
}

func getInt(k string, def int) int {
	if v, err := strconv.Atoi(get(k, "")); err == nil {
		return v
	}
	return def
}

func getDuration(k string, def time.Duration) time.Duration {
	if v, err := time.ParseDuration(get(k, "")); err == nil {
		return v
	}
	return def
}
