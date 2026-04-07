package integration_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// setupSecurityRouter creates a Chi router with the SecurityHeaders middleware
// and a simple handler for testing.
func setupSecurityRouter() *httptest.Server {
	r := chi.NewRouter()
	r.Use(middleware.SecurityHeaders)
	r.Get("/test", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})
	return httptest.NewServer(r)
}

func TestSecurityHeaders_XFrameOptions(t *testing.T) {
	ts := setupSecurityRouter()
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/test")
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, "DENY", resp.Header.Get("X-Frame-Options"))
}

func TestSecurityHeaders_ContentType(t *testing.T) {
	ts := setupSecurityRouter()
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/test")
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, "nosniff", resp.Header.Get("X-Content-Type-Options"))
}

func TestSecurityHeaders_XSS(t *testing.T) {
	ts := setupSecurityRouter()
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/test")
	require.NoError(t, err)
	defer resp.Body.Close()

	xss := resp.Header.Get("X-XSS-Protection")
	assert.NotEmpty(t, xss, "X-XSS-Protection header should be present")
	assert.Equal(t, "1; mode=block", xss)
}

func TestSecurityHeaders_HSTS(t *testing.T) {
	ts := setupSecurityRouter()
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/test")
	require.NoError(t, err)
	defer resp.Body.Close()

	hsts := resp.Header.Get("Strict-Transport-Security")
	assert.NotEmpty(t, hsts, "Strict-Transport-Security header should be present")
	assert.Contains(t, hsts, "max-age=")
}
