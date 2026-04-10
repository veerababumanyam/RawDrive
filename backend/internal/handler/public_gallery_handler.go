package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rawdrive/backend/internal/ai"
	"github.com/rawdrive/backend/internal/service"
)

// PublicGalleryHandler handles public gallery viewing (no auth).
type PublicGalleryHandler struct {
	gallerySvc *service.GalleryService
	assetSvc   *service.AssetService
	shareSvc   *service.ShareLinkService

	// M13 deferred-FR closure deps (optional — nil-safe handlers degrade
	// gracefully so existing tests that construct PublicGalleryHandler
	// without these continue to compile).
	pool     *pgxpool.Pool // subscription tier lookup for GAL-FR-115
	faceRepo *ai.FaceRepo  // gallery-scoped face match for GAL-FR-107/108
}

func NewPublicGalleryHandler(gs *service.GalleryService, as *service.AssetService, ss *service.ShareLinkService) *PublicGalleryHandler {
	return &PublicGalleryHandler{gallerySvc: gs, assetSvc: as, shareSvc: ss}
}

// WithM13Deps injects the M13 deferred-FR closure dependencies (pool + face
// repo). Call after construction when wiring routes_m2. Returns the receiver
// so callers can chain.
func (h *PublicGalleryHandler) WithM13Deps(pool *pgxpool.Pool, faceRepo *ai.FaceRepo) *PublicGalleryHandler {
	h.pool = pool
	h.faceRepo = faceRepo
	return h
}

// GetBySlug handles GET /api/v1/public/galleries/{slug}
func (h *PublicGalleryHandler) GetBySlug(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	if slug == "" {
		http.Error(w, `{"error":"missing slug"}`, http.StatusBadRequest)
		return
	}

	gallery, err := h.gallerySvc.GetBySlug(r.Context(), slug)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	if gallery == nil {
		http.Error(w, `{"error":"gallery not found"}`, http.StatusNotFound)
		return
	}
	if !gallery.IsPublished {
		http.Error(w, `{"error":"gallery not published"}`, http.StatusNotFound)
		return
	}

	respondJSON(w, http.StatusOK, gallery)
}

// publicAssetResponse is the enriched asset returned to public gallery viewers.
type publicAssetResponse struct {
	ID            string            `json:"id"`
	Filename      string            `json:"filename"`
	ContentType   string            `json:"content_type"`
	Width         *int              `json:"width,omitempty"`
	Height        *int              `json:"height,omitempty"`
	Blurhash      *string           `json:"blurhash,omitempty"`
	ThumbnailURLs map[string]string `json:"thumbnail_urls"`
	SortOrder     int               `json:"sort_order"`
}

// ListAssets handles GET /api/v1/public/galleries/{slug}/assets
func (h *PublicGalleryHandler) ListAssets(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	gallery, err := h.gallerySvc.GetBySlug(r.Context(), slug)
	if err != nil || gallery == nil || !gallery.IsPublished {
		http.Error(w, `{"error":"gallery not found"}`, http.StatusNotFound)
		return
	}

	galleryAssets, err := h.gallerySvc.ListAssets(r.Context(), gallery.ID)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	// Enrich gallery assets with full asset details
	var result []publicAssetResponse
	for _, ga := range galleryAssets {
		asset, err := h.assetSvc.GetByID(r.Context(), ga.AssetID)
		if err != nil || asset == nil {
			continue // skip missing assets
		}
		result = append(result, publicAssetResponse{
			ID:            asset.ID.String(),
			Filename:      asset.Filename,
			ContentType:   asset.ContentType,
			Width:         asset.Width,
			Height:        asset.Height,
			Blurhash:      asset.Blurhash,
			ThumbnailURLs: asset.ThumbnailURLs,
			SortOrder:     ga.SortOrder,
		})
	}

	respondJSON(w, http.StatusOK, result)
}

// VerifyPIN handles POST /api/v1/public/galleries/{slug}/verify-pin
func (h *PublicGalleryHandler) VerifyPIN(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Token string `json:"token"`
		PIN   string `json:"pin"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	valid, err := h.shareSvc.VerifyPIN(r.Context(), input.Token, input.PIN)
	if err != nil {
		http.Error(w, `{"error":"verification failed"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusOK, map[string]bool{"valid": valid})
}

// ──────────────────────────────────────────────────────────────────────────────
// M13 Deferred FR Closure (v0.0.29)
// ──────────────────────────────────────────────────────────────────────────────

// brandingResponse is the public-facing branding payload for a gallery
// (GAL-FR-115). Exposes only what the public viewer needs to render the
// gallery shell — tier, platform brand defaults, and a can_customize flag
// the frontend uses to decide whether to apply studio-level overrides.
type brandingResponse struct {
	TierSlug     string  `json:"tier_slug"`     // free, standard, pro, enterprise
	CanCustomize bool    `json:"can_customize"` // true when tier supports white-label overrides
	BrandName    string  `json:"brand_name"`
	LogoURL      *string `json:"logo_url,omitempty"`
	AccentColor  *string `json:"accent_color,omitempty"`
	HideFooter   bool    `json:"hide_footer"` // enterprise-only: hide "Powered by RawDrive"
}

// canCustomizeForTier returns true for tiers that may override platform
// branding. Kept in Go (not DB) so the gating rule is visible in code review.
func canCustomizeForTier(tier string) bool {
	switch strings.ToLower(tier) {
	case "pro", "enterprise", "studio":
		return true
	default:
		return false
	}
}

// GetBranding handles GET /api/v1/public/galleries/{slug}/branding (GAL-FR-115).
// Resolves workspace tier via the subscriptions table and decides whether
// the studio is permitted to override platform branding. Falls back to
// platform defaults when no active subscription exists, when the pool is
// not wired, or on any query error (fail-soft: unknown tier = free).
func (h *PublicGalleryHandler) GetBranding(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	if slug == "" {
		http.Error(w, `{"error":"missing slug"}`, http.StatusBadRequest)
		return
	}

	gallery, err := h.gallerySvc.GetBySlug(r.Context(), slug)
	if err != nil || gallery == nil || !gallery.IsPublished {
		http.Error(w, `{"error":"gallery not found"}`, http.StatusNotFound)
		return
	}

	tier := h.lookupWorkspaceTier(r.Context(), gallery.WorkspaceID)
	respondJSON(w, http.StatusOK, brandingResponse{
		TierSlug:     tier,
		CanCustomize: canCustomizeForTier(tier),
		BrandName:    "RawDrive",
		HideFooter:   tier == "enterprise",
	})
}

// lookupWorkspaceTier queries the active subscription for the workspace and
// returns the tier_slug. Returns "free" when no active subscription exists,
// the pool is not wired, or the query fails.
func (h *PublicGalleryHandler) lookupWorkspaceTier(ctx context.Context, workspaceID uuid.UUID) string {
	if h.pool == nil {
		return "free"
	}
	var tier string
	err := h.pool.QueryRow(ctx,
		`SELECT COALESCE(tier_slug, 'free')
		   FROM subscriptions
		  WHERE workspace_id = $1
		    AND status = 'active'
		  ORDER BY created_at DESC
		  LIMIT 1`,
		workspaceID,
	).Scan(&tier)
	if err != nil || tier == "" {
		return "free"
	}
	return tier
}

// faceMatchRequest accepts a pre-computed face embedding from the client.
//
// Design: embedding extraction happens in the browser via face-api.js so the
// selfie itself never leaves the user's device — this is both a privacy
// feature (biometric consent, GAL-FR-107) and keeps Go off the ML hot path.
// The client posts only the 512-float descriptor vector.
type faceMatchRequest struct {
	Embedding    []float32 `json:"embedding"`
	ConsentGiven bool      `json:"consent_given"`
	Threshold    *float64  `json:"threshold,omitempty"` // clamped 0.3–0.95, default 0.6
}

type faceMatchResponse struct {
	GalleryID         string   `json:"gallery_id"`
	AssetIDs          []string `json:"asset_ids"`
	MatchCount        int      `json:"match_count"`
	Threshold         float64  `json:"threshold"`
	FallbackAvailable bool     `json:"fallback_available"` // GAL-FR-109 — always true
}

// FaceMatch handles POST /api/v1/public/galleries/{slug}/face-match
// (GAL-FR-107/108/109).
//
// Enforces:
//   - gallery.settings.faceid_enabled = true (opt-in per gallery)
//   - explicit consent_given = true in request body (GAL-FR-107)
//   - matches are strictly gallery-scoped via FindSimilarFacesInGallery
//     (GAL-FR-108 — cross-gallery leakage impossible at the SQL layer)
//   - fallback_available = true in every response so zero-match selfies
//     don't trap the user (GAL-FR-109 — frontend always shows "Browse all")
func (h *PublicGalleryHandler) FaceMatch(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	if slug == "" {
		http.Error(w, `{"error":"missing slug"}`, http.StatusBadRequest)
		return
	}

	var req faceMatchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}
	if !req.ConsentGiven {
		http.Error(w, `{"error":"biometric_consent_required"}`, http.StatusForbidden)
		return
	}
	if len(req.Embedding) == 0 {
		http.Error(w, `{"error":"embedding required"}`, http.StatusBadRequest)
		return
	}

	gallery, err := h.gallerySvc.GetBySlug(r.Context(), slug)
	if err != nil || gallery == nil || !gallery.IsPublished {
		http.Error(w, `{"error":"gallery not found"}`, http.StatusNotFound)
		return
	}

	// Per-gallery FaceID opt-in — feature is off by default so studios must
	// explicitly enable it in gallery settings.
	faceIDEnabled, _ := gallery.Settings["faceid_enabled"].(bool)
	if !faceIDEnabled {
		http.Error(w, `{"error":"faceid_disabled_for_gallery"}`, http.StatusNotFound)
		return
	}

	if h.faceRepo == nil {
		http.Error(w, `{"error":"faceid_service_unavailable"}`, http.StatusServiceUnavailable)
		return
	}

	threshold := 0.6
	if req.Threshold != nil {
		threshold = *req.Threshold
		if threshold < 0.3 {
			threshold = 0.3
		}
		if threshold > 0.95 {
			threshold = 0.95
		}
	}

	matches, err := h.faceRepo.FindSimilarFacesInGallery(r.Context(), req.Embedding, gallery.ID, threshold, 200)
	if err != nil {
		http.Error(w, `{"error":"face match failed"}`, http.StatusInternalServerError)
		return
	}

	// Dedupe by asset_id — a single asset can contain multiple matching faces.
	seen := make(map[string]bool, len(matches))
	ids := make([]string, 0, len(matches))
	for _, fc := range matches {
		key := fc.AssetID.String()
		if !seen[key] {
			seen[key] = true
			ids = append(ids, key)
		}
	}

	respondJSON(w, http.StatusOK, faceMatchResponse{
		GalleryID:         gallery.ID.String(),
		AssetIDs:          ids,
		MatchCount:        len(ids),
		Threshold:         threshold,
		FallbackAvailable: true,
	})
}
