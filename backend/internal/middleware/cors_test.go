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

// Resumable chunked uploads (backend/internal/handler/chunked_upload.go)
// PATCH with Upload-Offset + Upload-Length and the Tus-Resumable version
// marker. The browser preflight for that request must accept those
// headers or Chromium blocks the PATCH before it leaves the tab. This
// test locks the contract so a future CORS refactor can't silently drop
// TUS support and re-break gallery image uploads.
func TestCORSPreflight_AllowsTusChunkedUploadHeaders(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	t.Setenv("GO_ENV", "")

	handler := CORS(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))

	req := httptest.NewRequest(http.MethodOptions, "/api/v1/uploads/abc", nil)
	req.Header.Set("Origin", "http://localhost:3001")
	req.Header.Set("Access-Control-Request-Method", "PATCH")
	req.Header.Set("Access-Control-Request-Headers", "upload-offset, upload-length, tus-resumable, content-type")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusNoContent, rec.Code)
	allow := rec.Header().Get("Access-Control-Allow-Headers")
	assert.Contains(t, allow, "Upload-Offset")
	assert.Contains(t, allow, "Upload-Length")
	assert.Contains(t, allow, "Tus-Resumable")

	expose := rec.Header().Get("Access-Control-Expose-Headers")
	assert.Contains(t, expose, "Upload-Offset")
	assert.Contains(t, expose, "Upload-Length")
}
