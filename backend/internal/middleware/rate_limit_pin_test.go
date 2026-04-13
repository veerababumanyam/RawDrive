package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	rdm "github.com/rawdrive/backend/internal/middleware"
)

func newTestRouter(lim rdm.PINRateLimiter) http.Handler {
	r := chi.NewRouter()
	r.With(rdm.RequirePINRateLimit(lim)).Post("/streams/{id}/verify-pin", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	return r
}

func TestPINRateLimit_AllowsUpToMax(t *testing.T) {
	lim := rdm.NewMemoryPINRateLimiter(5, 5*time.Minute)
	srv := httptest.NewServer(newTestRouter(lim))
	defer srv.Close()

	for i := 0; i < 5; i++ {
		req, _ := http.NewRequest("POST", srv.URL+"/streams/stream-a/verify-pin", nil)
		req.Header.Set("X-Forwarded-For", "203.0.113.10")
		resp, err := http.DefaultClient.Do(req)
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, resp.StatusCode, "attempt %d must be allowed", i+1)
		resp.Body.Close()
	}
}

func TestPINRateLimit_BlocksSixthAttemptWith429(t *testing.T) {
	lim := rdm.NewMemoryPINRateLimiter(5, 5*time.Minute)
	srv := httptest.NewServer(newTestRouter(lim))
	defer srv.Close()

	for i := 0; i < 5; i++ {
		req, _ := http.NewRequest("POST", srv.URL+"/streams/stream-a/verify-pin", nil)
		req.Header.Set("X-Forwarded-For", "203.0.113.11")
		resp, _ := http.DefaultClient.Do(req)
		resp.Body.Close()
	}

	req, _ := http.NewRequest("POST", srv.URL+"/streams/stream-a/verify-pin", nil)
	req.Header.Set("X-Forwarded-For", "203.0.113.11")
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusTooManyRequests, resp.StatusCode)
	assert.NotEmpty(t, resp.Header.Get("Retry-After"))
	n, err := strconv.Atoi(resp.Header.Get("Retry-After"))
	require.NoError(t, err)
	assert.GreaterOrEqual(t, n, 1)
}

func TestPINRateLimit_IsolatesByStreamID(t *testing.T) {
	lim := rdm.NewMemoryPINRateLimiter(5, 5*time.Minute)
	srv := httptest.NewServer(newTestRouter(lim))
	defer srv.Close()

	// Burn through stream-a from one IP.
	for i := 0; i < 5; i++ {
		req, _ := http.NewRequest("POST", srv.URL+"/streams/stream-a/verify-pin", nil)
		req.Header.Set("X-Forwarded-For", "203.0.113.12")
		resp, _ := http.DefaultClient.Do(req)
		resp.Body.Close()
	}
	// Different stream from the same IP still has budget.
	req, _ := http.NewRequest("POST", srv.URL+"/streams/stream-b/verify-pin", nil)
	req.Header.Set("X-Forwarded-For", "203.0.113.12")
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode, "per-stream buckets must be independent")
}

func TestPINRateLimit_IsolatesByIP(t *testing.T) {
	lim := rdm.NewMemoryPINRateLimiter(5, 5*time.Minute)
	srv := httptest.NewServer(newTestRouter(lim))
	defer srv.Close()

	// Burn IP-A.
	for i := 0; i < 5; i++ {
		req, _ := http.NewRequest("POST", srv.URL+"/streams/stream-a/verify-pin", nil)
		req.Header.Set("X-Forwarded-For", "203.0.113.20")
		resp, _ := http.DefaultClient.Do(req)
		resp.Body.Close()
	}
	// IP-B still has budget for same stream.
	req, _ := http.NewRequest("POST", srv.URL+"/streams/stream-a/verify-pin", nil)
	req.Header.Set("X-Forwarded-For", "203.0.113.21")
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode, "per-IP buckets must be independent")
}

func TestPINRateLimit_SkipsWhenStreamIDMissing(t *testing.T) {
	// If the URL has no {id} param, the middleware must not blow up.
	r := chi.NewRouter()
	lim := rdm.NewMemoryPINRateLimiter(1, time.Minute)
	r.With(rdm.RequirePINRateLimit(lim)).Get("/noparam", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	srv := httptest.NewServer(r)
	defer srv.Close()

	// Multiple calls with no {id} must all pass since key cannot be formed.
	for i := 0; i < 5; i++ {
		resp, _ := http.Get(srv.URL + "/noparam")
		require.Equal(t, http.StatusOK, resp.StatusCode)
		resp.Body.Close()
	}
}
