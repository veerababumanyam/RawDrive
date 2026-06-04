package middleware

// valkey_options.go — explicit, env-tunable timeouts for the Valkey client
// that backs the sliding-window rate limiter.
//
// Before this, main.go handed redis.NewClient the bare output of
// redis.ParseURL, so dial/read/write timeouts were whatever the linked go-redis
// version defaulted to. ApplyValkeyTimeouts pins them to values this codebase
// owns (overridable via env) so a slow or wedged Valkey fails the limiter open
// on a predictable bound instead of an inherited one.

import (
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

// Default Valkey client timeouts. These match sane go-redis defaults but are
// applied EXPLICITLY so the bound does not drift across go-redis releases.
const (
	defaultValkeyDialTimeout  = 5 * time.Second
	defaultValkeyReadTimeout  = 3 * time.Second
	defaultValkeyWriteTimeout = 3 * time.Second
)

// ApplyValkeyTimeouts sets explicit dial/read/write timeouts (and an optional
// pool size) on a go-redis options struct, resolving each from an env lookup
// with a safe default. env is typically os.Getenv.
//
// Keys:
//   - VALKEY_DIAL_TIMEOUT / VALKEY_READ_TIMEOUT / VALKEY_WRITE_TIMEOUT — a Go
//     duration string ("5s", "1500ms"); invalid/empty falls back to the default.
//   - VALKEY_POOL_SIZE — a positive int; anything else leaves the go-redis
//     default untouched.
//
// TLS is intentionally left alone: redis.ParseURL already derives opts.TLSConfig
// from a rediss:// scheme, and this helper must never downgrade it.
func ApplyValkeyTimeouts(opts *redis.Options, env func(string) string) {
	if opts == nil || env == nil {
		return
	}
	opts.DialTimeout = valkeyDurationFromEnv(env, "VALKEY_DIAL_TIMEOUT", defaultValkeyDialTimeout)
	opts.ReadTimeout = valkeyDurationFromEnv(env, "VALKEY_READ_TIMEOUT", defaultValkeyReadTimeout)
	opts.WriteTimeout = valkeyDurationFromEnv(env, "VALKEY_WRITE_TIMEOUT", defaultValkeyWriteTimeout)
	if n, err := strconv.Atoi(env("VALKEY_POOL_SIZE")); err == nil && n > 0 {
		opts.PoolSize = n
	}
}

func valkeyDurationFromEnv(env func(string) string, key string, def time.Duration) time.Duration {
	if d, err := time.ParseDuration(env(key)); err == nil && d > 0 {
		return d
	}
	return def
}
