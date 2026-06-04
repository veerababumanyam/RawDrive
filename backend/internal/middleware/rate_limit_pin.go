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
//
// CACHE-6: the hits map is keyed by (ip, streamID). The Allow path prunes the
// per-key slice of expired hits, but a key whose client never returns would
// otherwise live in the map forever, so the map grew unbounded by distinct
// (IP, streamID) cardinality. A background janitor periodically sweeps and
// deletes keys whose every hit has aged past the window, bounding the map to
// the set of recently-active keys.
type memoryLimiter struct {
	mu     sync.Mutex
	hits   map[string][]time.Time
	max    int
	window time.Duration
	now    func() time.Time

	stopJanitor chan struct{}
	janitorOnce sync.Once
}

// NewMemoryPINRateLimiter returns a PINRateLimiter allowing `max`
// attempts per `window` per key. A background janitor evicts expired keys
// roughly once per window so the underlying map cannot grow without bound.
func NewMemoryPINRateLimiter(max int, window time.Duration) PINRateLimiter {
	if max <= 0 {
		max = 5
	}
	if window <= 0 {
		window = 5 * time.Minute
	}
	m := &memoryLimiter{
		hits:        make(map[string][]time.Time),
		max:         max,
		window:      window,
		now:         time.Now,
		stopJanitor: make(chan struct{}),
	}
	m.startJanitor(janitorInterval(window))
	return m
}

// janitorInterval picks a sweep cadence proportional to the window so eviction
// stays cheap while keeping the map close to the active key set. Clamped to a
// sane floor so a tiny test window doesn't spin a hot ticker.
func janitorInterval(window time.Duration) time.Duration {
	iv := window
	if iv < time.Minute {
		iv = time.Minute
	}
	return iv
}

// startJanitor launches a single sweeper goroutine that calls sweep on the
// given cadence until Stop is called. It is idempotent via janitorOnce.
func (m *memoryLimiter) startJanitor(interval time.Duration) {
	m.janitorOnce.Do(func() {
		go func() {
			t := time.NewTicker(interval)
			defer t.Stop()
			for {
				select {
				case <-t.C:
					m.sweep()
				case <-m.stopJanitor:
					return
				}
			}
		}()
	})
}

// Stop terminates the background janitor goroutine. Safe to call multiple
// times; intended for tests and graceful shutdown so the goroutine does not
// leak.
func (m *memoryLimiter) Stop() {
	m.stopOnce()
}

// stopOnce closes stopJanitor exactly once.
func (m *memoryLimiter) stopOnce() {
	m.mu.Lock()
	defer m.mu.Unlock()
	select {
	case <-m.stopJanitor:
		// already closed
	default:
		close(m.stopJanitor)
	}
}

// sweep removes keys whose every recorded hit has aged past the window. It
// holds the same mutex as Allow, so eviction is race-free with respect to
// concurrent attempts. Exported behavior is unchanged: a swept key simply
// starts fresh on its next request, exactly as an expired-then-pruned key did.
func (m *memoryLimiter) sweep() {
	m.mu.Lock()
	defer m.mu.Unlock()

	cutoff := m.now().Add(-m.window)
	for key, hits := range m.hits {
		live := false
		for _, t := range hits {
			if t.After(cutoff) {
				live = true
				break
			}
		}
		if !live {
			delete(m.hits, key)
		}
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

// ClientIP returns the best-effort client IP for an HTTP request, preferring
// X-Forwarded-For, then X-Real-IP, then the TCP RemoteAddr (port stripped).
// It is exported for audit/compliance call sites (e.g. terms acceptance, where
// the IP is recorded as IT Act §10A / DPDP evidence) that want the proxy-aware
// address rather than raw r.RemoteAddr. For rate-limit keying use
// clientIPForRateLimit instead — that variant only trusts forwarding headers
// from known proxies (F-008).
func ClientIP(r *http.Request) string {
	return clientIP(r)
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
