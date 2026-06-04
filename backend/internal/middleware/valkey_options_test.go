package middleware_test

// valkey_options_test.go — pure-logic tests for ApplyValkeyTimeouts.
//
// The Valkey client backs the sliding-window rate limiter. Before this helper,
// main.go built the go-redis client straight off redis.ParseURL with NO
// explicit dial/read/write timeouts, so the rate limiter's backend round trips
// inherited whatever the go-redis defaults happened to be in the linked
// version — values that have drifted across go-redis releases. These tests pin
// the resolved timeouts (defaults + env overrides) and, critically, assert the
// helper never downgrades TLS that redis.ParseURL derived from a rediss:// URL.

import (
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/middleware"
)

func noEnv(string) string { return "" }

func mapEnv(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

func TestApplyValkeyTimeoutsDefaults(t *testing.T) {
	opts, err := redis.ParseURL("redis://localhost:6379/0")
	require.NoError(t, err)

	middleware.ApplyValkeyTimeouts(opts, noEnv)

	assert.Equal(t, 5*time.Second, opts.DialTimeout, "default dial timeout")
	assert.Equal(t, 3*time.Second, opts.ReadTimeout, "default read timeout")
	assert.Equal(t, 3*time.Second, opts.WriteTimeout, "default write timeout")
}

func TestApplyValkeyTimeoutsEnvOverride(t *testing.T) {
	opts, err := redis.ParseURL("redis://localhost:6379")
	require.NoError(t, err)

	middleware.ApplyValkeyTimeouts(opts, mapEnv(map[string]string{
		"VALKEY_DIAL_TIMEOUT":  "7s",
		"VALKEY_READ_TIMEOUT":  "2s",
		"VALKEY_WRITE_TIMEOUT": "1500ms",
		"VALKEY_POOL_SIZE":     "30",
	}))

	assert.Equal(t, 7*time.Second, opts.DialTimeout)
	assert.Equal(t, 2*time.Second, opts.ReadTimeout)
	assert.Equal(t, 1500*time.Millisecond, opts.WriteTimeout)
	assert.Equal(t, 30, opts.PoolSize)
}

func TestApplyValkeyTimeoutsInvalidEnvFallsBackToDefault(t *testing.T) {
	opts, err := redis.ParseURL("redis://localhost:6379")
	require.NoError(t, err)

	middleware.ApplyValkeyTimeouts(opts, mapEnv(map[string]string{
		"VALKEY_DIAL_TIMEOUT": "not-a-duration",
		"VALKEY_POOL_SIZE":    "-4",
	}))

	assert.Equal(t, 5*time.Second, opts.DialTimeout, "invalid duration falls back to default")
	assert.Zero(t, opts.PoolSize, "non-positive pool size leaves the go-redis default untouched")
}

func TestApplyValkeyTimeoutsPreservesTLSFromRedissScheme(t *testing.T) {
	opts, err := redis.ParseURL("rediss://localhost:6379")
	require.NoError(t, err)
	require.NotNil(t, opts.TLSConfig, "precondition: rediss:// must yield a TLS config from ParseURL")

	middleware.ApplyValkeyTimeouts(opts, noEnv)

	assert.NotNil(t, opts.TLSConfig, "helper must not clobber TLS derived from the rediss:// scheme")
}
