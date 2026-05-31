// Package config provides application configuration loading from environment variables.
package config

import (
	"os"
	"strconv"
	"time"
)

// Config holds all application configuration values.
type Config struct {
	DatabaseURL   string
	ValkeyURL     string
	NATSURL       string
	NATSAuthToken string
	Port          int
	Environment   string
	AppSecret     string

	JWTPrivateKeyPath string
	JWTPublicKeyPath  string
	JWTPrivateKey     []byte
	JWTPublicKey      []byte

	OTPExpiry             time.Duration
	AccessTokenExpiry     time.Duration
	RefreshTokenExpiry    time.Duration
	MaxConcurrentSessions int
	RateLimitPerMinute    int

	// RLSEnforced is the operator's DECLARED INTENT to run the application
	// behind the database-level Row Level Security backstop (audit S2-G1,
	// 2026-05-31). It is read from the RLS_ENFORCED env var and defaults to
	// false.
	//
	// IMPORTANT — this is SCAFFOLDING, not an active code switch. Setting it
	// to true does NOT, by itself, change any query behavior or add per-query
	// overhead: the application does not yet bind app.workspace_id to the repo
	// query connection (see middleware.PgDBContext and the 64 pool-holding
	// repositories), so flipping it on without the connection-scoping refactor
	// + the non-owner rawdrive_app login role + the manually-applied
	// backend/ops/rls/enable_force_rls.sql would NOT enforce isolation — and
	// applying FORCE RLS without those preconditions would cause a total
	// outage. This field exists so the staged rollout has a single,
	// discoverable, byte-for-byte-default-off signal that ops sets when the
	// preconditions are met. See
	// docs/audits/2026-05-31-integration-audit/ADR-rls-backstop.md.
	RLSEnforced bool
}

// Load reads configuration from environment variables and returns a Config.
// It panics if required environment variables are missing.
func Load() (*Config, error) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		panic("DATABASE_URL is required")
	}

	cfg := &Config{
		DatabaseURL:           dbURL,
		ValkeyURL:             envOrDefault("VALKEY_URL", ""),
		NATSURL:               envOrDefault("NATS_URL", ""),
		NATSAuthToken:         envOrDefault("NATS_AUTH_TOKEN", ""),
		Port:                  envIntOrDefault("PORT", 8080),
		Environment:           envOrDefault("ENVIRONMENT", "development"),
		AppSecret:             os.Getenv("APP_SECRET"),
		JWTPrivateKeyPath:     os.Getenv("JWT_PRIVATE_KEY_PATH"),
		JWTPublicKeyPath:      os.Getenv("JWT_PUBLIC_KEY_PATH"),
		OTPExpiry:             time.Duration(envIntOrDefault("OTP_EXPIRY_MINUTES", 5)) * time.Minute,
		AccessTokenExpiry:     time.Duration(envIntOrDefault("ACCESS_TOKEN_EXPIRY_MINUTES", 15)) * time.Minute,
		RefreshTokenExpiry:    time.Duration(envIntOrDefault("REFRESH_TOKEN_EXPIRY_DAYS", 7)) * 24 * time.Hour,
		MaxConcurrentSessions: envIntOrDefault("MAX_CONCURRENT_SESSIONS", 5),
		RateLimitPerMinute:    envIntOrDefault("RATE_LIMIT_PER_MINUTE", 60),
		RLSEnforced:           envBoolOrDefault("RLS_ENFORCED", false),
	}

	// Load JWT key files if paths are provided and files exist
	if cfg.JWTPrivateKeyPath != "" {
		data, err := os.ReadFile(cfg.JWTPrivateKeyPath)
		if err == nil && len(data) > 0 {
			cfg.JWTPrivateKey = data
		}
	}
	if cfg.JWTPublicKeyPath != "" {
		data, err := os.ReadFile(cfg.JWTPublicKeyPath)
		if err == nil && len(data) > 0 {
			cfg.JWTPublicKey = data
		}
	}

	return cfg, nil
}

func envOrDefault(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}

func envIntOrDefault(key string, defaultVal int) int {
	v := os.Getenv(key)
	if v == "" {
		return defaultVal
	}
	i, err := strconv.Atoi(v)
	if err != nil {
		return defaultVal
	}
	return i
}

// envBoolOrDefault parses a boolean env var, falling back to defaultVal when
// the var is unset or unparseable. Accepts the strconv.ParseBool vocabulary
// (1/0, t/f, true/false, etc.).
func envBoolOrDefault(key string, defaultVal bool) bool {
	v := os.Getenv(key)
	if v == "" {
		return defaultVal
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return defaultVal
	}
	return b
}
