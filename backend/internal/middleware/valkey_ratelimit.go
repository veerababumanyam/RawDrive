package middleware

// valkey_ratelimit.go — M14 GAL-FR-197.
//
// Valkey/Redis-backed sliding window rate limiter for API key usage.
// The existing in-memory RateLimit (middleware.go) is keyed by IP and
// loses state on restart; that's fine for anonymous public routes
// but unsuitable for developer-platform API keys where we need
// (a) stable counters across restarts, (b) per-key budgets matching
// the rate_limit column on api_keys, and (c) horizontal scale.
//
// Algorithm: sliding log with a capped window. For each request we
// LPUSH the current unix-ms timestamp onto a list, LTRIM to the
// configured max size, and check whether the oldest remaining entry
// falls inside the window. That gives smooth rate shaping without
// the "bucket reset" behavior of fixed windows.
//
// Redis operations are wrapped in a narrow interface so tests can
// swap in a fake without importing go-redis.

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"time"
)

// ValkeyClient is the narrow surface the sliding-window limiter needs.
// *redis.Client from go-redis/v9 satisfies this with a thin wrapper.
type ValkeyClient interface {
	Ping(ctx context.Context) error
	// IncrementSlidingWindow runs the sliding-window logic atomically.
	// Returns the current count within the window and a boolean flag
	// indicating whether the request should be allowed. Implementations
	// are expected to use a server-side script (Lua) so the check is
	// truly atomic under contention.
	IncrementSlidingWindow(ctx context.Context, key string, maxRequests int, windowMs int64, nowMs int64) (int, bool, error)
}

// ErrRateLimited is returned when a request exceeds the configured budget.
var ErrRateLimited = errors.New("rate limit exceeded")

// ValkeyRateLimit returns chi middleware that enforces a per-key
// sliding-window budget using a Valkey/Redis backend. keyFunc extracts
// the identity to rate-limit against (e.g. API key ID or workspace ID).
// When client is nil the middleware is a no-op — callers can wire it
// unconditionally and the build system decides whether to enable it.
func ValkeyRateLimit(client ValkeyClient, keyFunc func(r *http.Request) string, maxRequests int, window time.Duration) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if client == nil {
				next.ServeHTTP(w, r)
				return
			}
			id := keyFunc(r)
			if id == "" {
				// Nothing to rate-limit (e.g. unauthenticated request).
				next.ServeHTTP(w, r)
				return
			}

			nowMs := time.Now().UnixMilli()
			windowMs := window.Milliseconds()
			count, allowed, err := client.IncrementSlidingWindow(r.Context(), "rl:"+id, maxRequests, windowMs, nowMs)
			if err != nil {
				// Fail open on backend errors so a Valkey outage doesn't
				// cascade into 429s for legitimate traffic. The error is
				// logged by the client wrapper; we just let the request
				// pass through.
				next.ServeHTTP(w, r)
				return
			}

			w.Header().Set("X-RateLimit-Limit", strconv.Itoa(maxRequests))
			remaining := maxRequests - count
			if remaining < 0 {
				remaining = 0
			}
			w.Header().Set("X-RateLimit-Remaining", strconv.Itoa(remaining))

			if !allowed {
				w.Header().Set("Retry-After", strconv.FormatInt(window.Milliseconds()/1000, 10))
				http.Error(w, `{"error":"rate_limit_exceeded"}`, http.StatusTooManyRequests)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// APIKeyRateLimitKeyFunc returns the middleware key for an authenticated
// API key request. Intended to be passed as the keyFunc argument.
func APIKeyRateLimitKeyFunc(r *http.Request) string {
	key := APIKeyFromContext(r.Context())
	if key == nil {
		return ""
	}
	return "apikey:" + key.ID.String()
}

// MaxRequestsFunc resolves the per-request rate-limit budget. Returning
// zero (or a negative value) signals "no override" and the middleware
// applies its configured fallback budget instead.
type MaxRequestsFunc func(r *http.Request) int

// APIKeyRateLimitMaxFunc reads the rate_limit column from the API key
// in context. Intended to be passed as the maxFunc argument to
// ValkeyRateLimitDynamic so each developer-platform key can enforce
// its own budget (api_keys.rate_limit).
func APIKeyRateLimitMaxFunc(r *http.Request) int {
	key := APIKeyFromContext(r.Context())
	if key == nil {
		return 0
	}
	return key.RateLimit
}

// ValkeyRateLimitDynamic is like ValkeyRateLimit but resolves the
// budget per-request via maxFunc. When maxFunc returns <=0 the
// fallbackMax is applied instead, so callers can still enforce a
// default for keys whose rate_limit column is unset. When client is
// nil the middleware is a no-op (same as ValkeyRateLimit) so callers
// can wire it unconditionally and the build system decides whether
// to enable it.
func ValkeyRateLimitDynamic(
	client ValkeyClient,
	keyFunc func(r *http.Request) string,
	maxFunc MaxRequestsFunc,
	fallbackMax int,
	window time.Duration,
) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if client == nil {
				next.ServeHTTP(w, r)
				return
			}
			id := keyFunc(r)
			if id == "" {
				next.ServeHTTP(w, r)
				return
			}

			// Resolve the per-request budget. 0 / negative means
			// "use the fallback" — this keeps the semantics simple
			// for maxFunc implementations that don't have an override.
			maxRequests := maxFunc(r)
			if maxRequests <= 0 {
				maxRequests = fallbackMax
			}

			nowMs := time.Now().UnixMilli()
			windowMs := window.Milliseconds()
			count, allowed, err := client.IncrementSlidingWindow(r.Context(), "rl:"+id, maxRequests, windowMs, nowMs)
			if err != nil {
				// Preserve fail-open semantics of the scalar variant.
				next.ServeHTTP(w, r)
				return
			}

			w.Header().Set("X-RateLimit-Limit", strconv.Itoa(maxRequests))
			remaining := maxRequests - count
			if remaining < 0 {
				remaining = 0
			}
			w.Header().Set("X-RateLimit-Remaining", strconv.Itoa(remaining))

			if !allowed {
				w.Header().Set("Retry-After", strconv.FormatInt(window.Milliseconds()/1000, 10))
				http.Error(w, `{"error":"rate_limit_exceeded"}`, http.StatusTooManyRequests)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
