package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"

	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

// ──────────────────────── Route Registration ────────────────────────

func setupM2Router() *chi.Mux {
	r := chi.NewRouter()
	deps := M2Dependencies{}
	RegisterM2Routes(r, deps)
	RegisterPublicGalleryRoutes(r, deps)
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

// TestM2Routes_MusicLibraryEndpoints asserts the workspace music-library routes
// mount when their deps (asset repo+service + gallery repo) are wired. The
// underlying pools are nil, so the handlers would panic if called — but
// routeExists recovers from panics, which is fine for mount-only verification.
func TestM2Routes_MusicLibraryEndpoints(t *testing.T) {
	r := chi.NewRouter()
	deps := M2Dependencies{
		AssetRepo:      repository.NewAssetRepo(nil),
		AssetService:   service.NewAssetService(nil, nil),
		GalleryRepo:    repository.NewGalleryRepo(nil),
		GalleryService: service.NewGalleryService(nil, nil, nil),
	}
	RegisterM2Routes(r, deps)
	RegisterPublicGalleryRoutes(r, deps)

	assert.True(t, routeExists(r, "GET", "/api/v1/music"), "GET /api/v1/music")
	assert.True(t, routeExists(r, "DELETE", "/api/v1/music/test-id"), "DELETE /api/v1/music/{id}")
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

func TestM2Routes_AlbumManagementEndpoints(t *testing.T) {
	r := setupM2RouterWithStubs()

	assert.True(t, routeExists(r, "PATCH", "/api/v1/albums/test-id"), "PATCH /albums/{id}")
	assert.True(t, routeExists(r, "DELETE", "/api/v1/albums/test-id"), "DELETE /albums/{id}")
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

func TestM2Routes_DashboardEndpoints(t *testing.T) {
	r := setupM2Router()
	assert.True(t, routeExists(r, "GET", "/api/v1/dashboard/gallery-activity"), "GET /api/v1/dashboard/gallery-activity")
}

func TestM2Routes_PublicEndpoints(t *testing.T) {
	r := setupM2Router()
	assert.True(t, routeExists(r, "GET", "/api/v1/public/studios/test-a1b2c3d4"), "GET public studio landing")
	assert.True(t, routeExists(r, "GET", "/api/v1/public/studios/test-a1b2c3d4/logo"), "GET public studio logo")
	assert.True(t, routeExists(r, "GET", "/api/v1/public/galleries/test-slug"), "GET public gallery")
	assert.True(t, routeExists(r, "GET", "/api/v1/public/galleries/test-slug/assets"), "GET public assets")
	assert.True(t, routeExists(r, "POST", "/api/v1/public/galleries/test-slug/verify-pin"), "POST verify-pin")
	assert.True(t, routeExists(r, "POST", "/api/v1/public/galleries/test-slug/proof"), "POST proof")
	assert.True(t, routeExists(r, "GET", "/api/v1/public/galleries/test-slug/branding/logo"), "GET public branding logo")
	assert.True(t, routeExists(r, "GET", "/api/v1/public/galleries/test-slug/music"), "GET public gallery music")
}

// setupM2RouterWithStubs builds a router with non-nil service stubs so
// tests that exercise nil-guarded route mounts can verify registration.
// The underlying repos are nil — handlers would panic if called, but
// routeExists recovers from panics, which is fine for mount-only tests.
func setupM2RouterWithStubs() *chi.Mux {
	r := chi.NewRouter()
	deps := M2Dependencies{
		GalleryService:      service.NewGalleryService(nil, nil, nil),
		AlbumService:        service.NewAlbumService(nil),
		ProductService:      service.NewProductService(nil),
		BannerService:       service.NewBannerService(nil),
		CartService:         service.NewCartService(nil, nil, nil),
		GalleryAnalyticsSvc: service.NewGalleryAnalyticsService(nil),
	}
	RegisterM2Routes(r, deps)
	RegisterPublicGalleryRoutes(r, deps)
	return r
}

// TestM2Routes_PublicEndpoints_DeferredFollowups asserts routes whose
// handlers were orphaned (defined but never mounted). Mounting these
// closes M14 public-surface gaps for ProductPreview rendering and
// banner/product analytics tracking.
func TestM2Routes_PublicEndpoints_DeferredFollowups(t *testing.T) {
	r := setupM2RouterWithStubs()
	// Public product listing — required so ProductPreview can render on
	// the public gallery page without authentication.
	assert.True(t, routeExists(r, "GET", "/api/v1/public/galleries/test-slug/products"),
		"GET /public/galleries/{slug}/products must be mounted")
	// Public event tracking — required for banner impression/click analytics.
	assert.True(t, routeExists(r, "POST", "/api/v1/public/galleries/test-slug/events"),
		"POST /public/galleries/{slug}/events must be mounted")
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
