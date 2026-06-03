package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

	"github.com/rawdrive/backend/internal/middleware"
)

func TestRateLimit_UnderLimit(t *testing.T) {
	handler := middleware.RateLimit(10, 1*time.Minute)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	for i := 0; i < 5; i++ {
		req := httptest.NewRequest(http.MethodGet, "/api/files", nil)
		req.RemoteAddr = "192.168.1.1:12345"
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		assert.Equal(t, http.StatusOK, rr.Code, "request %d should succeed", i+1)
	}
}

func TestRateLimit_AtLimit(t *testing.T) {
	limit := 5
	handler := middleware.RateLimit(limit, 1*time.Minute)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	for i := 0; i < limit; i++ {
		req := httptest.NewRequest(http.MethodGet, "/api/files", nil)
		req.RemoteAddr = "192.168.1.2:12345"
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		assert.Equal(t, http.StatusOK, rr.Code)
	}

	// Next request should be rate-limited
	req := httptest.NewRequest(http.MethodGet, "/api/files", nil)
	req.RemoteAddr = "192.168.1.2:12345"
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusTooManyRequests, rr.Code, "should return 429 at limit")
}

func TestRateLimit_PerIdentifier(t *testing.T) {
	limit := 3
	handler := middleware.RateLimit(limit, 1*time.Minute)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// Exhaust limit for IP 1
	for i := 0; i < limit; i++ {
		req := httptest.NewRequest(http.MethodGet, "/api/files", nil)
		req.RemoteAddr = "10.0.0.1:12345"
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		assert.Equal(t, http.StatusOK, rr.Code)
	}

	// IP 2 should still have its own limit
	req := httptest.NewRequest(http.MethodGet, "/api/files", nil)
	req.RemoteAddr = "10.0.0.2:12345"
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusOK, rr.Code, "different IP should have separate rate limit")
}

func TestRateLimit_SharesBudgetAcrossHandlers(t *testing.T) {
	limiter := middleware.RateLimit(2, 1*time.Minute)
	mux := http.NewServeMux()
	ok := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	mux.Handle("/auth/login", limiter(ok))
	mux.Handle("/api/v1/auth/login", limiter(ok))

	paths := []string{"/auth/login", "/api/v1/auth/login", "/auth/login"}
	expected := []int{http.StatusOK, http.StatusOK, http.StatusTooManyRequests}

	for i, path := range paths {
		req := httptest.NewRequest(http.MethodPost, path, nil)
		req.RemoteAddr = "203.0.113.10:12345"
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)
		assert.Equal(t, expected[i], rr.Code, "request %d to %s", i+1, path)
	}
}

func TestRateLimit_WindowReset(t *testing.T) {
	limit := 2
	window := 10 * time.Millisecond
	handler := middleware.RateLimit(limit, window)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// Exhaust limit
	for i := 0; i < limit; i++ {
		req := httptest.NewRequest(http.MethodGet, "/api/files", nil)
		req.RemoteAddr = "10.0.0.3:12345"
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		assert.Equal(t, http.StatusOK, rr.Code)
	}

	// Should be rate-limited
	req := httptest.NewRequest(http.MethodGet, "/api/files", nil)
	req.RemoteAddr = "10.0.0.3:12345"
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusTooManyRequests, rr.Code)

	// Wait for window to reset
	time.Sleep(20 * time.Millisecond)

	// Should be allowed again
	req = httptest.NewRequest(http.MethodGet, "/api/files", nil)
	req.RemoteAddr = "10.0.0.3:12345"
	rr = httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusOK, rr.Code, "rate limit should reset after window expires")
}
