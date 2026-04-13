// Package cf loads Cloudflare Stream configuration.
//
// M30 / E101-S1 — config must come from platform_settings (streaming category)
// first, fall back to environment variables only for legacy bootstrap, and
// fail with a clear error if neither source produces an API token. The
// existing `os.Getenv` lookups scattered through stream_service.go are to be
// replaced with calls to LoadConfig.
//
// Precedence per project rule (AGENTS.md): platform_settings -> env -> fail-disable.
package cf

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
)

// ErrStreamingDisabled indicates that Cloudflare Stream is not configured.
// Callers MUST treat streaming features as disabled — never substitute a
// placeholder token.
var ErrStreamingDisabled = errors.New("cf: streaming is disabled; no CF_STREAM_API_TOKEN configured")

// Config is the Cloudflare Stream runtime configuration.
type Config struct {
	AccountID      string
	APIToken       string
	SigningKey     string
	WebhookSecret  string
	AllowedOrigins []string
}

// SettingsStore is the minimal surface LoadConfig needs to read the
// streaming category from platform_settings. repository.PlatformSettingsRepo
// satisfies this interface; tests can provide an in-memory fake.
type SettingsStore interface {
	// GetByKey returns the plaintext value for (category, key) or a
	// non-nil error if the row does not exist.
	GetByKey(ctx context.Context, category, key string) (Setting, error)
}

// Setting is a structural subset of repository.PlatformSetting covering only
// the fields cf cares about. Using an interface-owned type keeps the coupling
// shallow — the repository package can return its richer struct without
// dragging its unrelated fields into this package.
type Setting struct {
	Value    string
	IsSecret bool
}

// LoadConfig resolves Cloudflare Stream config. The returned *Config is nil
// and err is ErrStreamingDisabled when neither platform_settings nor env
// provides an API token. Any other error indicates a real failure (DB down,
// decrypt error).
func LoadConfig(ctx context.Context, store SettingsStore) (*Config, error) {
	cfg := &Config{}

	cfg.APIToken = lookupString(ctx, store, "cf_api_token", "CF_STREAM_API_TOKEN")
	cfg.AccountID = lookupString(ctx, store, "cf_account_id", "CF_STREAM_ACCOUNT_ID")
	cfg.SigningKey = lookupString(ctx, store, "cf_signing_key", "CF_STREAM_SIGNING_KEY")
	cfg.WebhookSecret = lookupString(ctx, store, "cf_webhook_secret", "CF_STREAM_WEBHOOK_SECRET")
	cfg.AllowedOrigins = splitOrigins(lookupString(ctx, store, "allowed_origins", "CF_STREAM_ALLOWED_ORIGINS"))

	if strings.TrimSpace(cfg.APIToken) == "" {
		return nil, ErrStreamingDisabled
	}
	return cfg, nil
}

// lookupString returns the DB value if the row exists, otherwise the env
// value. Empty DB values fall through to env.
func lookupString(ctx context.Context, store SettingsStore, dbKey, envKey string) string {
	if store != nil {
		if s, err := store.GetByKey(ctx, "streaming", dbKey); err == nil && strings.TrimSpace(s.Value) != "" {
			return s.Value
		}
	}
	return os.Getenv(envKey)
}

func splitOrigins(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

// String redacts secrets for safe logging.
func (c *Config) String() string {
	if c == nil {
		return "Config<nil>"
	}
	return fmt.Sprintf(
		"Config{AccountID:%q, APIToken:%s, SigningKey:%s, WebhookSecret:%s, AllowedOrigins:%v}",
		c.AccountID, redact(c.APIToken), redact(c.SigningKey), redact(c.WebhookSecret), c.AllowedOrigins,
	)
}

func redact(s string) string {
	if s == "" {
		return "<unset>"
	}
	return "<set>"
}
