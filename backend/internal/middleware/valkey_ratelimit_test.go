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
