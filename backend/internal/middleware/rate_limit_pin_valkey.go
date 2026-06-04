package middleware

import (
	"context"
	"fmt"
	"time"
)

// redisPINLimiter implements PINRateLimiter using Valkey (via ValkeyClient)
// with a per-node in-memory fallback (memoryLimiter) when Valkey is
// unavailable. This is the production replacement for NewMemoryPINRateLimiter
// in multi-node deployments (H-2 from the 2026-06-05 caching audit).
type redisPINLimiter struct {
	client ValkeyClient
	mem    PINRateLimiter
	max    int
	window time.Duration
}

// NewRedisPINRateLimiter returns a PINRateLimiter that enforces the budget
// cluster-wide via Valkey and falls back to per-node in-memory enforcement
// when Valkey errors (fail-closed — a Valkey outage never disables PIN brute-
// force protection).
func NewRedisPINRateLimiter(client ValkeyClient, max int, window time.Duration) PINRateLimiter {
	return &redisPINLimiter{
		client: client,
		mem:    NewMemoryPINRateLimiter(max, window),
		max:    max,
		window: window,
	}
}

// Allow checks whether the (ip, streamID) pair is within the rate limit.
// The Valkey key uses the same namespace as other rl:* keys for
// operational consistency: rl:pin:{ip}:{streamID}.
//
// Both Valkey and the in-memory limiter are always incremented so that
// the in-memory state mirrors the real request history. On a Valkey error
// the in-memory result is used, ensuring the per-node budget reflects
// actual traffic seen before the outage (fail-closed).
func (r *redisPINLimiter) Allow(ip, streamID string) (bool, time.Duration) {
	// Always advance the in-memory counter so it stays in sync with Valkey.
	memAllowed, memRetry := r.mem.Allow(ip, streamID)

	key := fmt.Sprintf("rl:pin:%s:%s", ip, streamID)
	nowMs := time.Now().UnixMilli()
	windowMs := r.window.Milliseconds()

	_, allowed, err := r.client.IncrementSlidingWindow(
		context.Background(), key, r.max, windowMs, nowMs,
	)
	if err != nil {
		// Valkey unavailable — use in-memory result which already tracks
		// request history, so the budget cannot be reset by an outage.
		return memAllowed, memRetry
	}

	if allowed {
		return true, 0
	}
	return false, r.window
}
