package middleware

// M30 / E100-S3 — PIN verify rate limiter.
//
// FR-014-SEC-02 brute-force defence: cap verify-pin attempts at 5 per
// 5-minute sliding window per (IP, streamID) pair. 6th attempt returns
// 429 Too Many Requests with a Retry-After header. In-memory LRU is
// fine for development and single-node staging; the production wiring
// should swap RedisBucket in (see NewRedisPINRateLimiter, TODO M30+1).

import (
	"fmt"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
)

// PINRateLimiter is the interface the verify-pin handler depends on.
type PINRateLimiter interface {
	// Allow returns true if the request is within the limit. When it
	// returns false, retryAfter indicates when the next attempt is safe.
	Allow(ip, streamID string) (allowed bool, retryAfter time.Duration)
}

// memoryLimiter is a simple in-memory sliding window.
type memoryLimiter struct {
	mu     sync.Mutex
	hits   map[string][]time.Time
	max    int
	window time.Duration
	now    func() time.Time
}

// NewMemoryPINRateLimiter returns a PINRateLimiter allowing `max`
// attempts per `window` per key.
func NewMemoryPINRateLimiter(max int, window time.Duration) PINRateLimiter {
	if max <= 0 {
		max = 5
	}
	if window <= 0 {
		window = 5 * time.Minute
	}
	return &memoryLimiter{
		hits:   make(map[string][]time.Time),
		max:    max,
		window: window,
		now:    time.Now,
	}
}

// Allow implements PINRateLimiter.
func (m *memoryLimiter) Allow(ip, streamID string) (bool, time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()

	now := m.now()
	cutoff := now.Add(-m.window)
	key := ip + ":" + streamID

	// drop expired hits
	recent := m.hits[key][:0]
	for _, t := range m.hits[key] {
		if t.After(cutoff) {
			recent = append(recent, t)
		}
	}

	if len(recent) >= m.max {
		// next allowed = oldest hit + window
		next := recent[0].Add(m.window)
		m.hits[key] = recent
		return false, time.Until(next)
	}

	recent = append(recent, now)
	m.hits[key] = recent
	return true, 0
}

// RequirePINRateLimit is the chi middleware factory. Streams without an
// {id} URL param pass through unchanged. Limit key is (clientIP, streamID).
func RequirePINRateLimit(limiter PINRateLimiter) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// nil limiter = middleware disabled (test/bootstrap convenience).
			if limiter == nil {
				next.ServeHTTP(w, r)
				return
			}
			streamID := chi.URLParam(r, "id")
			if streamID == "" {
				next.ServeHTTP(w, r)
				return
			}
			ip := clientIP(r)
			allowed, retryAfter := limiter.Allow(ip, streamID)
			if !allowed {
				secs := int(retryAfter.Seconds())
				if secs < 1 {
					secs = 1
				}
				w.Header().Set("Retry-After", fmt.Sprintf("%d", secs))
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusTooManyRequests)
				_, _ = w.Write([]byte(`{"error":"too_many_pin_attempts","retry_after_seconds":` + fmt.Sprintf("%d", secs) + `}`))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func clientIP(r *http.Request) string {
	// X-Forwarded-For first, then X-Real-IP, then RemoteAddr.
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if idx := strings.Index(xff, ","); idx >= 0 {
			return strings.TrimSpace(xff[:idx])
		}
		return strings.TrimSpace(xff)
	}
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return strings.TrimSpace(xri)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
