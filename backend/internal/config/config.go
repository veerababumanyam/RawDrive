// Package config provides application configuration loading from environment variables.
package config

import (
	"os"
	"strconv"
	"time"
)

// Config holds all application configuration values.
type Config struct {
	DatabaseURL    string
	ValkeyURL      string
	NATSURL        string
	Port           int
	Environment    string
	AppSecret      string

	JWTPrivateKeyPath string
	JWTPublicKeyPath  string
	JWTPrivateKey     []byte
	JWTPublicKey      []byte

	OTPExpiry             time.Duration
	AccessTokenExpiry     time.Duration
	RefreshTokenExpiry    time.Duration
	MaxConcurrentSessions int
	RateLimitPerMinute    int
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

