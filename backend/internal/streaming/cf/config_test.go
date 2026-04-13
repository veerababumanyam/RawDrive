package cf_test

// M30 / E101-S1 — Cloudflare Stream config loader.

import (
	"context"
	"errors"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/streaming/cf"
)

// fakeStore is an in-memory SettingsStore for tests — no DB required.
type fakeStore struct {
	rows map[string]cf.Setting
}

func (f *fakeStore) GetByKey(_ context.Context, category, key string) (cf.Setting, error) {
	if f.rows == nil {
		return cf.Setting{}, errors.New("no rows")
	}
	v, ok := f.rows[category+":"+key]
	if !ok {
		return cf.Setting{}, errors.New("not found")
	}
	return v, nil
}

func newStore(pairs map[string]string) *fakeStore {
	rows := make(map[string]cf.Setting, len(pairs))
	for k, v := range pairs {
		rows[k] = cf.Setting{Value: v, IsSecret: true}
	}
	return &fakeStore{rows: rows}
}

func TestLoadConfig_PrefersPlatformSettingsOverEnv(t *testing.T) {
	t.Setenv("CF_STREAM_API_TOKEN", "env-token")
	t.Setenv("CF_STREAM_ACCOUNT_ID", "env-account")

	store := newStore(map[string]string{
		"streaming:cf_api_token":  "db-token",
		"streaming:cf_account_id": "db-account",
	})

	cfg, err := cf.LoadConfig(context.Background(), store)
	require.NoError(t, err)
	require.NotNil(t, cfg)
	assert.Equal(t, "db-token", cfg.APIToken, "platform_settings must beat env")
	assert.Equal(t, "db-account", cfg.AccountID)
}

func TestLoadConfig_FallsBackToEnvWhenStoreEmpty(t *testing.T) {
	t.Setenv("CF_STREAM_API_TOKEN", "env-token")
	t.Setenv("CF_STREAM_ACCOUNT_ID", "env-account")

	cfg, err := cf.LoadConfig(context.Background(), newStore(nil))
	require.NoError(t, err)
	require.NotNil(t, cfg)
	assert.Equal(t, "env-token", cfg.APIToken)
	assert.Equal(t, "env-account", cfg.AccountID)
}

func TestLoadConfig_ReturnsErrStreamingDisabledWhenNoToken(t *testing.T) {
	os.Unsetenv("CF_STREAM_API_TOKEN")
	os.Unsetenv("CF_STREAM_ACCOUNT_ID")

	cfg, err := cf.LoadConfig(context.Background(), newStore(nil))
	assert.Nil(t, cfg)
	assert.ErrorIs(t, err, cf.ErrStreamingDisabled)
}

func TestLoadConfig_ParsesAllowedOrigins(t *testing.T) {
	t.Setenv("CF_STREAM_API_TOKEN", "t")

	store := newStore(map[string]string{
		"streaming:cf_api_token":   "t",
		"streaming:allowed_origins": "https://a.example, https://b.example,https://c.example",
	})

	cfg, err := cf.LoadConfig(context.Background(), store)
	require.NoError(t, err)
	assert.ElementsMatch(t,
		[]string{"https://a.example", "https://b.example", "https://c.example"},
		cfg.AllowedOrigins,
	)
}

func TestLoadConfig_IgnoresMisspelledEnvVars(t *testing.T) {
	// Regression: M8 skeleton referenced a misspelled CLODFLARE_STREAMING
	// var. LoadConfig must NOT pick that up — only CF_STREAM_API_TOKEN.
	os.Unsetenv("CF_STREAM_API_TOKEN")
	t.Setenv("CLODFLARE_STREAMING", "legacy-misspelled-token")

	cfg, err := cf.LoadConfig(context.Background(), newStore(nil))
	assert.Nil(t, cfg)
	assert.ErrorIs(t, err, cf.ErrStreamingDisabled)
}

func TestConfig_StringRedactsSecrets(t *testing.T) {
	cfg := &cf.Config{
		AccountID:     "acct-123",
		APIToken:      "super-secret-token",
		SigningKey:    "signing-key-value",
		WebhookSecret: "webhook-secret-value",
	}
	s := cfg.String()
	assert.NotContains(t, s, "super-secret-token")
	assert.NotContains(t, s, "signing-key-value")
	assert.NotContains(t, s, "webhook-secret-value")
	assert.Contains(t, s, "acct-123", "non-secret AccountID can appear")
	assert.Contains(t, s, "<set>")
}
