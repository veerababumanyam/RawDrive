package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestCORSProductionDoesNotAllowLocalhostByDefault(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("GO_ENV", "")
	t.Setenv("FRONTEND_URL", "https://app.rawdrive.in")

	handler := CORS(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))

	req := httptest.NewRequest(http.MethodOptions, "/api/v1/assets", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusNoContent, rec.Code)
	assert.Empty(t, rec.Header().Get("Access-Control-Allow-Origin"))
	assert.Empty(t, rec.Header().Get("Access-Control-Allow-Credentials"))
}

func TestCORSProductionAllowsConfiguredFrontendURL(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("GO_ENV", "")
	t.Setenv("FRONTEND_URL", "https://app.rawdrive.in")

	handler := CORS(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))

	req := httptest.NewRequest(http.MethodOptions, "/api/v1/assets", nil)
	req.Header.Set("Origin", "https://app.rawdrive.in")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusNoContent, rec.Code)
	assert.Equal(t, "https://app.rawdrive.in", rec.Header().Get("Access-Control-Allow-Origin"))
	assert.Equal(t, "true", rec.Header().Get("Access-Control-Allow-Credentials"))
}
