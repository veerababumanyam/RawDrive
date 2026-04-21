package handlers_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/upload/handlers"
)

// T3-001: GET /api/v1/uploads/packages returns all active tiers sorted by
// credits ascending. Response shape is the thin one the RechargeModal
// consumes — code / credits / price_paise / display_name.
func TestPackageCatalogueHandler_ReturnsAllTiers_SortedByCredits(t *testing.T) {
	provider := &stubPackageProvider{
		// Intentionally out-of-order so the handler's sort contract is
		// what the test proves, not the provider's.
		packages: []handlers.UploadPackageView{
			{Code: "studio", Credits: 8000, PricePaise: 349900, Currency: "INR", DisplayName: "Studio — 8,000 credits"},
			{Code: "starter", Credits: 500, PricePaise: 29900, Currency: "INR", DisplayName: "Starter — 500 credits"},
			{Code: "pro", Credits: 2000, PricePaise: 149900, Currency: "INR", DisplayName: "Pro — 2,000 credits"},
		},
	}

	h := &handlers.UploadPackageCatalogueHandler{Provider: provider}
	r := chi.NewRouter()
	h.RegisterRoutes(r)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/uploads/packages", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)
	require.Equal(t, "application/json", rr.Header().Get("Content-Type"))

	var resp handlers.UploadPackageCatalogueResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	require.Len(t, resp.Packages, 3)
	// Sorted by credits ascending — starter, pro, studio.
	assert.Equal(t, "starter", resp.Packages[0].Code)
	assert.Equal(t, int64(500), resp.Packages[0].Credits)
	assert.Equal(t, "pro", resp.Packages[1].Code)
	assert.Equal(t, int64(2000), resp.Packages[1].Credits)
	assert.Equal(t, "studio", resp.Packages[2].Code)
	assert.Equal(t, int64(8000), resp.Packages[2].Credits)
	// Paise price + currency present on every row.
	for _, p := range resp.Packages {
		assert.NotZero(t, p.PricePaise, "price_paise must be populated for %s", p.Code)
		assert.Equal(t, "INR", p.Currency, "currency must be INR for %s", p.Code)
		assert.NotEmpty(t, p.DisplayName)
	}
}

// T3-001b: Provider error surfaces as 503 — the catalogue is advisory so a
// hard 500 would cascade into the modal crashing. 503 signals "try again"
// to the fetch hook and keeps the rest of the app live.
func TestPackageCatalogueHandler_ProviderError_503(t *testing.T) {
	provider := &stubPackageProvider{err: errors.New("db unavailable")}

	h := &handlers.UploadPackageCatalogueHandler{Provider: provider}
	r := chi.NewRouter()
	h.RegisterRoutes(r)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/uploads/packages", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	require.Equal(t, http.StatusServiceUnavailable, rr.Code)
}

// T3-001c: Missing provider (mis-wired handler) returns 503. Catches the
// silent-nil-deref class of bug that's only obvious when a build is
// missing its main.go wiring update.
func TestPackageCatalogueHandler_NilProvider_503(t *testing.T) {
	h := &handlers.UploadPackageCatalogueHandler{Provider: nil}
	r := chi.NewRouter()
	h.RegisterRoutes(r)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/uploads/packages", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	require.Equal(t, http.StatusServiceUnavailable, rr.Code)
}

// stubPackageProvider lets the test control the catalogue shape without a
// real DB. The real provider is wired in main.go against upload/credit's
// rate_cards / packages repository.
type stubPackageProvider struct {
	packages []handlers.UploadPackageView
	err      error
}

func (s *stubPackageProvider) UploadPackages(_ context.Context) ([]handlers.UploadPackageView, error) {
	if s.err != nil {
		return nil, s.err
	}
	return s.packages, nil
}

// Satisfy time import in case future tests need it.
var _ = time.Time{}
