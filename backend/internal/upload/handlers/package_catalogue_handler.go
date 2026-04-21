package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"sort"
)

// UploadPackageView is the provider-side projection of a single upload
// credit package (tier + price). Shape matches the RechargeModal's
// fetch contract so the client can decode without a translation layer.
type UploadPackageView struct {
	Code        string `json:"code"`
	Credits     int64  `json:"credits"`
	PricePaise  int64  `json:"price_paise"`
	Currency    string `json:"currency"`
	DisplayName string `json:"display_name"`
}

// UploadPackageProvider is the narrow interface the catalogue handler
// needs. Real implementation reads from upload_packages JOIN upload_rate_cards
// (active rate card per package). Tests stub this directly.
type UploadPackageProvider interface {
	UploadPackages(ctx context.Context) ([]UploadPackageView, error)
}

// UploadPackageCatalogueHandler serves GET /api/v1/uploads/packages.
//
// Catalogue is advisory: a DB hiccup must not cascade into the modal
// crashing, so provider error returns 503 rather than 500 — the fetch
// hook treats 503 as transient and retries.
type UploadPackageCatalogueHandler struct {
	Provider UploadPackageProvider
}

// UploadPackageCatalogueResponse is the wire response shape. Packages are
// always returned sorted by credits ascending so the frontend can trust
// the order without re-sorting.
//
// M41-API-001: NextCursor is reserved for future pagination. Today the
// catalogue is three rows and fits in a single response; the field is
// always an empty string. Reserving it now means a future market-specific
// or region-specific catalogue that grows past a page boundary can adopt
// cursor pagination without a breaking wire change.
type UploadPackageCatalogueResponse struct {
	Packages   []UploadPackageView `json:"packages"`
	NextCursor string              `json:"next_cursor"`
}

// GetPackages returns the active upload credit catalogue.
func (h *UploadPackageCatalogueHandler) GetPackages(w http.ResponseWriter, r *http.Request) {
	if h.Provider == nil {
		// Handler wired without a provider — the build is mis-assembled.
		// Return 503 so health checks pick this up rather than 500'ing
		// every caller.
		http.Error(w, `{"error":"catalogue_unavailable"}`, http.StatusServiceUnavailable)
		return
	}

	pkgs, err := h.Provider.UploadPackages(r.Context())
	if err != nil {
		http.Error(w, `{"error":"catalogue_unavailable"}`, http.StatusServiceUnavailable)
		return
	}

	// Sort ascending by credits — the contract the frontend relies on.
	// Stable sort so the provider's secondary ordering (e.g. by code) is
	// preserved when two packages share a credit count.
	sort.SliceStable(pkgs, func(i, j int) bool {
		return pkgs[i].Credits < pkgs[j].Credits
	})

	resp := UploadPackageCatalogueResponse{Packages: pkgs}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

// RegisterRoutes wires the catalogue endpoint onto an existing chi router.
func (h *UploadPackageCatalogueHandler) RegisterRoutes(mux interface {
	Get(string, http.HandlerFunc)
}) {
	mux.Get("/api/v1/uploads/packages", h.GetPackages)
}
