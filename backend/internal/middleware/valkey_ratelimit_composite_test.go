package middleware_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/rawdrive/backend/internal/middleware"
)

// okHandler always 200s; the middleware decides whether the request reaches it.
func okHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
}

// drive sends n identical requests (same client IP) through mw and returns the
// status codes in order.
func drive(mw func(http.Handler) http.Handler, n int) []int {
	h := mw(okHandler())
	codes := make([]int, 0, n)
	for i := 0; i < n; i++ {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/auth/login", nil)
		req.RemoteAddr = "203.0.113.7:5555" // fixed untrusted peer → stable bucket
		h.ServeHTTP(rr, req)
		codes = append(codes, rr.Code)
	}
	return codes
}

func countCode(codes []int, code int) int {
	n := 0
	for _, c := range codes {
		if c == code {
			n++
		}
	}
	return n
}

// When Valkey is present it is the source of truth: the first maxRequests pass,
// the next is 429, and the Valkey key carries the scope namespace.
func TestRateLimitWithValkey_UsesValkeyWhenPresent(t *testing.T) {
	fv := newFakeValkey()
	mw, _ := middleware.RateLimitWithValkey(fv, "cred", 2, time.Minute)

	codes := drive(mw, 3)
	if codes[0] != http.StatusOK || codes[1] != http.StatusOK {
		t.Fatalf("first 2 within budget must pass, got %v", codes)
	}
	if codes[2] != http.StatusTooManyRequests {
		t.Fatalf("3rd over budget must be 429, got %d", codes[2])
	}
	// Scope-namespaced key was used.
	found := false
	for k := range fv.counts {
		if k == "rl:cred:203.0.113.7" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected Valkey key rl:cred:<ip>, got keys %v", fv.counts)
	}
}

// A Valkey "deny" verdict yields 429.
func TestRateLimitWithValkey_DeniesWhenValkeyDenies(t *testing.T) {
	fv := newFakeValkey()
	fv.allowFn = func(string, int) bool { return false }
	mw, _ := middleware.RateLimitWithValkey(fv, "mfa", 10, time.Minute)

	codes := drive(mw, 1)
	if codes[0] != http.StatusTooManyRequests {
		t.Fatalf("Valkey deny must 429, got %d", codes[0])
	}
}

// THE FAIL-CLOSED GUARD: when Valkey errors, the limiter must fall back to
// in-memory enforcement, NOT fail open. With max=2, the 3rd request must 429.
func TestRateLimitWithValkey_FailsClosedToInMemoryOnValkeyError(t *testing.T) {
	fv := &fakeValkey{counts: map[string]int{}, incError: context.DeadlineExceeded}
	mw, _ := middleware.RateLimitWithValkey(fv, "cred", 2, time.Minute)

	codes := drive(mw, 3)
	if countCode(codes, http.StatusOK) != 2 {
		t.Fatalf("on Valkey error the in-memory fallback must allow exactly maxRequests, got %v", codes)
	}
	if codes[2] != http.StatusTooManyRequests {
		t.Fatalf("on Valkey error the 3rd request must be 429 (fail-closed), got %d — a Valkey outage must NOT disable throttling", codes[2])
	}
}

// When Valkey is unconfigured (nil client) the limiter still enforces per-node
// in-memory — it must NOT no-op (which would silently disable auth throttling).
func TestRateLimitWithValkey_NilClientEnforcesInMemory(t *testing.T) {
	mw, _ := middleware.RateLimitWithValkey(nil, "cred", 2, time.Minute)

	codes := drive(mw, 3)
	if codes[2] != http.StatusTooManyRequests {
		t.Fatalf("nil Valkey client must fall back to in-memory enforcement, got %v", codes)
	}
}

// The reset func clears the in-memory fallback so the test suite can drain it.
func TestRateLimitWithValkey_ResetClearsInMemory(t *testing.T) {
	mw, reset := middleware.RateLimitWithValkey(nil, "cred", 1, time.Minute)
	h := mw(okHandler())

	req := func() int {
		rr := httptest.NewRecorder()
		r := httptest.NewRequest(http.MethodPost, "/auth/login", nil)
		r.RemoteAddr = "198.51.100.9:4444"
		h.ServeHTTP(rr, r)
		return rr.Code
	}

	if got := req(); got != http.StatusOK {
		t.Fatalf("first request must pass, got %d", got)
	}
	if got := req(); got != http.StatusTooManyRequests {
		t.Fatalf("second must be limited, got %d", got)
	}
	reset()
	if got := req(); got != http.StatusOK {
		t.Fatalf("after reset the bucket must be drained, got %d", got)
	}
}
