package middleware_test

// valkey_ratelimit_test.go — pure-logic tests for the Valkey sliding
// window limiter. We use a fake ValkeyClient so the test doesn't
// require a live redis instance.

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/rawdrive/backend/internal/middleware"
)

// fakeValkey is a deterministic in-memory implementation of the
// ValkeyClient surface — one counter per key, no actual window math.
type fakeValkey struct {
	counts   map[string]int
	allowFn  func(key string, count int) bool
	pingErr  error
	incError error
}

func newFakeValkey() *fakeValkey {
	return &fakeValkey{counts: make(map[string]int)}
}

func (f *fakeValkey) Ping(_ context.Context) error { return f.pingErr }

func (f *fakeValkey) IncrementSlidingWindow(_ context.Context, key string, maxRequests int, _ int64, _ int64) (int, bool, error) {
	if f.incError != nil {
		return 0, false, f.incError
	}
	f.counts[key]++
	count := f.counts[key]
	if f.allowFn != nil {
		return count, f.allowFn(key, count), nil
	}
	return count, count <= maxRequests, nil
}

func TestValkeyRateLimit_NilClientIsNoOp(t *testing.T) {
	handler := middleware.ValkeyRateLimit(nil, func(_ *http.Request) string { return "x" }, 5, time.Minute)(
		http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }),
	)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/test", nil))
	if rr.Code != http.StatusOK {
		t.Errorf("want 200 with nil client, got %d", rr.Code)
	}
}

func TestValkeyRateLimit_EmptyKeyIsNoOp(t *testing.T) {
	fv := newFakeValkey()
	handler := middleware.ValkeyRateLimit(fv, func(_ *http.Request) string { return "" }, 5, time.Minute)(
		http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }),
	)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/test", nil))
	if rr.Code != http.StatusOK {
		t.Errorf("want 200 with empty key, got %d", rr.Code)
	}
	if len(fv.counts) != 0 {
		t.Errorf("empty key should skip redis, counts = %+v", fv.counts)
	}
}

func TestValkeyRateLimit_UnderLimit(t *testing.T) {
	fv := newFakeValkey()
	handler := middleware.ValkeyRateLimit(fv, func(_ *http.Request) string { return "client-1" }, 3, time.Minute)(
		http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }),
	)
	for i := 0; i < 3; i++ {
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/test", nil))
		if rr.Code != http.StatusOK {
			t.Errorf("request %d should succeed, got %d", i, rr.Code)
		}
	}
}

func TestValkeyRateLimit_OverLimitReturns429(t *testing.T) {
	fv := newFakeValkey()
	handler := middleware.ValkeyRateLimit(fv, func(_ *http.Request) string { return "client-2" }, 2, time.Minute)(
		http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }),
	)
	// First two requests pass.
	for i := 0; i < 2; i++ {
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/test", nil))
		if rr.Code != http.StatusOK {
			t.Errorf("request %d should succeed, got %d", i, rr.Code)
		}
	}
	// Third should be rate limited.
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/test", nil))
	if rr.Code != http.StatusTooManyRequests {
		t.Errorf("third request should be 429, got %d", rr.Code)
	}
	if rr.Header().Get("Retry-After") == "" {
		t.Errorf("Retry-After header should be set on 429")
	}
}

func TestValkeyRateLimit_HeadersAlwaysSet(t *testing.T) {
	fv := newFakeValkey()
	handler := middleware.ValkeyRateLimit(fv, func(_ *http.Request) string { return "client-3" }, 10, time.Minute)(
		http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }),
	)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/test", nil))
	if rr.Header().Get("X-RateLimit-Limit") != "10" {
		t.Errorf("X-RateLimit-Limit should be 10")
	}
	if rr.Header().Get("X-RateLimit-Remaining") != "9" {
		t.Errorf("X-RateLimit-Remaining should be 9 after one hit, got %q", rr.Header().Get("X-RateLimit-Remaining"))
	}
}

func TestValkeyRateLimit_FailOpenOnBackendError(t *testing.T) {
	fv := &fakeValkey{counts: make(map[string]int), incError: context.DeadlineExceeded}
	handler := middleware.ValkeyRateLimit(fv, func(_ *http.Request) string { return "client-4" }, 1, time.Minute)(
		http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }),
	)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/test", nil))
	if rr.Code != http.StatusOK {
		t.Errorf("backend errors should fail open, got %d", rr.Code)
	}
}

// ──────────────────────── Per-key dynamic limit ────────────────────────
//
// ValkeyRateLimitDynamic honors a per-request budget resolver so each
// API key can enforce its own rate_limit column value. The scalar
// ValkeyRateLimit stays in place for callers that want a single
// shared budget (e.g. anonymous public routes).

func TestValkeyRateLimitDynamic_HonorsPerKeyMax(t *testing.T) {
	fv := newFakeValkey()
	// maxFunc returns 2 for this request — below the fallback of 100.
	maxFunc := func(_ *http.Request) int { return 2 }
	handler := middleware.ValkeyRateLimitDynamic(
		fv,
		func(_ *http.Request) string { return "apikey:low" },
		maxFunc,
		100, // fallback
		time.Minute,
	)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }))

	// First 2 succeed, third is 429.
	for i := 0; i < 2; i++ {
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/test", nil))
		if rr.Code != http.StatusOK {
			t.Fatalf("request %d should succeed at per-key max=2, got %d", i, rr.Code)
		}
		if rr.Header().Get("X-RateLimit-Limit") != "2" {
			t.Errorf("X-RateLimit-Limit should reflect per-key max=2, got %q", rr.Header().Get("X-RateLimit-Limit"))
		}
	}
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/test", nil))
	if rr.Code != http.StatusTooManyRequests {
		t.Errorf("third request at per-key max=2 should be 429, got %d", rr.Code)
	}
}

func TestValkeyRateLimitDynamic_FallsBackWhenMaxFuncReturnsZero(t *testing.T) {
	fv := newFakeValkey()
	// maxFunc returns 0 — meaning "no override" — so fallback applies.
	maxFunc := func(_ *http.Request) int { return 0 }
	handler := middleware.ValkeyRateLimitDynamic(
		fv,
		func(_ *http.Request) string { return "apikey:default" },
		maxFunc,
		3, // fallback
		time.Minute,
	)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }))

	// First 3 succeed at fallback budget, fourth is 429.
	for i := 0; i < 3; i++ {
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/test", nil))
		if rr.Code != http.StatusOK {
			t.Fatalf("request %d should succeed at fallback max=3, got %d", i, rr.Code)
		}
	}
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/test", nil))
	if rr.Code != http.StatusTooManyRequests {
		t.Errorf("fourth request at fallback max=3 should be 429, got %d", rr.Code)
	}
	if rr.Header().Get("X-RateLimit-Limit") != "3" {
		t.Errorf("X-RateLimit-Limit should reflect fallback max=3, got %q", rr.Header().Get("X-RateLimit-Limit"))
	}
}

func TestValkeyRateLimitDynamic_NegativeMaxFuncFallsBack(t *testing.T) {
	fv := newFakeValkey()
	maxFunc := func(_ *http.Request) int { return -1 }
	handler := middleware.ValkeyRateLimitDynamic(
		fv,
		func(_ *http.Request) string { return "apikey:neg" },
		maxFunc,
		5, // fallback
		time.Minute,
	)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }))

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/test", nil))
	if rr.Code != http.StatusOK {
		t.Errorf("negative maxFunc should fall back, got %d", rr.Code)
	}
	if rr.Header().Get("X-RateLimit-Limit") != "5" {
		t.Errorf("X-RateLimit-Limit should reflect fallback max=5, got %q", rr.Header().Get("X-RateLimit-Limit"))
	}
}

func TestValkeyRateLimitDynamic_FailOpenOnBackendError(t *testing.T) {
	fv := &fakeValkey{counts: make(map[string]int), incError: context.DeadlineExceeded}
	handler := middleware.ValkeyRateLimitDynamic(
		fv,
		func(_ *http.Request) string { return "apikey:err" },
		func(_ *http.Request) int { return 1 },
		100,
		time.Minute,
	)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }))

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/test", nil))
	if rr.Code != http.StatusOK {
		t.Errorf("dynamic variant should preserve fail-open, got %d", rr.Code)
	}
}

func TestValkeyRateLimitDynamic_NilClientIsNoOp(t *testing.T) {
	handler := middleware.ValkeyRateLimitDynamic(
		nil,
		func(_ *http.Request) string { return "apikey:nil" },
		func(_ *http.Request) int { return 1 },
		100,
		time.Minute,
	)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }))

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/test", nil))
	if rr.Code != http.StatusOK {
		t.Errorf("nil client should be a no-op, got %d", rr.Code)
	}
}
