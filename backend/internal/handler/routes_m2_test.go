package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
)

// ──────────────────────── Route Registration ────────────────────────

func setupM2Router() *chi.Mux {
	r := chi.NewRouter()
	RegisterM2Routes(r, M2Dependencies{})
	return r
}

// routeExists tests if a route is registered by making a request and checking
// it doesn't 404/405. Handlers may panic with nil deps — that's expected.
func routeExists(r *chi.Mux, method, path string) bool {
	req := httptest.NewRequest(method, path, nil)
	rr := httptest.NewRecorder()

	// Recover from handler panics (nil service deps) — we only care about route registration
	func() {
		defer func() { recover() }()
		r.ServeHTTP(rr, req)
	}()

	// If the route wasn't found, chi returns 404 or 405
	return rr.Code != http.StatusNotFound && rr.Code != http.StatusMethodNotAllowed
}

func TestM2Routes_AssetEndpoints(t *testing.T) {
	r := setupM2Router()
	assert.True(t, routeExists(r, "GET", "/api/v1/assets"), "GET /api/v1/assets")
	assert.True(t, routeExists(r, "POST", "/api/v1/assets"), "POST /api/v1/assets")
	assert.True(t, routeExists(r, "GET", "/api/v1/assets/test-id"), "GET /api/v1/assets/{id}")
	assert.True(t, routeExists(r, "DELETE", "/api/v1/assets/test-id"), "DELETE /api/v1/assets/{id}")
}

func TestM2Routes_GalleryEndpoints(t *testing.T) {
	r := setupM2Router()
	assert.True(t, routeExists(r, "GET", "/api/v1/galleries"), "GET /api/v1/galleries")
	assert.True(t, routeExists(r, "POST", "/api/v1/galleries"), "POST /api/v1/galleries")
	assert.True(t, routeExists(r, "GET", "/api/v1/galleries/test-id"), "GET /galleries/{id}")
	assert.True(t, routeExists(r, "PUT", "/api/v1/galleries/test-id"), "PUT /galleries/{id}")
	assert.True(t, routeExists(r, "DELETE", "/api/v1/galleries/test-id"), "DELETE /galleries/{id}")
	assert.True(t, routeExists(r, "GET", "/api/v1/galleries/test-id/assets"), "GET /galleries/{id}/assets")
}

func TestM2Routes_ShareLinkEndpoints(t *testing.T) {
	r := setupM2Router()
	assert.True(t, routeExists(r, "POST", "/api/v1/galleries/test-id/share"), "POST share")
	assert.True(t, routeExists(r, "GET", "/api/v1/galleries/test-id/share"), "GET share")
}

func TestM2Routes_ProofingEndpoints(t *testing.T) {
	r := setupM2Router()
	assert.True(t, routeExists(r, "GET", "/api/v1/galleries/test-id/proofing"), "GET proofing")
}

func TestM2Routes_PublicEndpoints(t *testing.T) {
	r := setupM2Router()
	assert.True(t, routeExists(r, "GET", "/api/v1/public/galleries/test-slug"), "GET public gallery")
	assert.True(t, routeExists(r, "GET", "/api/v1/public/galleries/test-slug/assets"), "GET public assets")
	assert.True(t, routeExists(r, "POST", "/api/v1/public/galleries/test-slug/verify-pin"), "POST verify-pin")
	assert.True(t, routeExists(r, "POST", "/api/v1/public/galleries/test-slug/proof"), "POST proof")
}

func TestM2Dependencies_ZeroValue(t *testing.T) {
	deps := M2Dependencies{}
	assert.Nil(t, deps.AssetService)
	assert.Nil(t, deps.UploadService)
	assert.Nil(t, deps.GalleryService)
	assert.Nil(t, deps.ShareLinkService)
	assert.Nil(t, deps.ProofingService)
	assert.Nil(t, deps.StorageConfigService)
}
