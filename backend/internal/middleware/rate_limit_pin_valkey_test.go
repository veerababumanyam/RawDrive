package middleware_test

import (
	"errors"
	"testing"
	"time"

	"github.com/rawdrive/backend/internal/middleware"
)

var errTest = errors.New("valkey test error")

// TestNewRedisPINRateLimiter_AllowsUnderLimit verifies that requests within
// the configured window budget are allowed.
func TestNewRedisPINRateLimiter_AllowsUnderLimit(t *testing.T) {
	fv := newFakeValkey()
	limiter := middleware.NewRedisPINRateLimiter(fv, 5, 5*time.Minute)

	for i := 0; i < 5; i++ {
		allowed, _ := limiter.Allow("1.2.3.4", "stream-abc")
		if !allowed {
			t.Fatalf("request %d/%d must be allowed, got denied", i+1, 5)
		}
	}
}

// TestNewRedisPINRateLimiter_DeniesOverLimit verifies that the 6th attempt
// within the window is rejected and Retry-After is positive.
func TestNewRedisPINRateLimiter_DeniesOverLimit(t *testing.T) {
	fv := newFakeValkey()
	limiter := middleware.NewRedisPINRateLimiter(fv, 5, 5*time.Minute)

	for i := 0; i < 5; i++ {
		limiter.Allow("1.2.3.4", "stream-abc")
	}

	allowed, retryAfter := limiter.Allow("1.2.3.4", "stream-abc")
	if allowed {
		t.Fatal("6th attempt within window must be denied")
	}
	if retryAfter <= 0 {
		t.Fatalf("Retry-After must be positive, got %v", retryAfter)
	}
}

// TestNewRedisPINRateLimiter_PerKey verifies that different (ip, streamID)
// pairs do not share a bucket.
func TestNewRedisPINRateLimiter_PerKey(t *testing.T) {
	fv := newFakeValkey()
	limiter := middleware.NewRedisPINRateLimiter(fv, 1, 5*time.Minute)

	// Exhaust bucket for stream-A.
	limiter.Allow("1.2.3.4", "stream-A")
	allowed, _ := limiter.Allow("1.2.3.4", "stream-A")
	if allowed {
		t.Fatal("second attempt on stream-A must be denied")
	}

	// stream-B shares the same IP but must have its own bucket.
	allowedB, _ := limiter.Allow("1.2.3.4", "stream-B")
	if !allowedB {
		t.Fatal("first attempt on stream-B must be allowed (separate bucket)")
	}
}

// TestNewRedisPINRateLimiter_FallsBackOnValkeyError verifies that when
// Valkey errors the limiter falls back to the in-memory path (fail-closed).
func TestNewRedisPINRateLimiter_FallsBackOnValkeyError(t *testing.T) {
	fv := newFakeValkey()
	limiter := middleware.NewRedisPINRateLimiter(fv, 5, 5*time.Minute)

	// First 5 allowed via Valkey.
	for i := 0; i < 5; i++ {
		limiter.Allow("1.2.3.4", "stream-abc")
	}
	// Inject Valkey error.
	fv.incError = errTest
	// 6th attempt: Valkey errors, in-memory fallback also exhausted (5 hits).
	allowed, _ := limiter.Allow("1.2.3.4", "stream-abc")
	if allowed {
		t.Fatal("6th attempt must be denied even when Valkey is unavailable")
	}
}
