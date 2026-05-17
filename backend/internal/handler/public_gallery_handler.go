package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

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
	albumSvc   *service.AlbumService

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

// WithAlbumService wires album lookups for public sub-gallery links.
func (h *PublicGalleryHandler) WithAlbumService(albumSvc *service.AlbumService) *PublicGalleryHandler {
	h.albumSvc = albumSvc
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

	// M19 F-009: Gallery expiry enforcement
	if gallery.ExpiresAt != nil && gallery.ExpiresAt.Before(time.Now().UTC()) {
		respondJSON(w, http.StatusGone, map[string]interface{}{
			"expired":    true,
			"expired_at": gallery.ExpiresAt,
			"title":      gallery.Title,
		})
		return
	}

	// M19 F-009: Enrich settings with computed fields for the public client
	if gallery.Settings == nil {
		gallery.Settings = make(map[string]interface{})
	}
	// Cover template data
	if gallery.CoverTemplate != "" && gallery.CoverTemplate != "none" {
		gallery.Settings["cover_template"] = gallery.CoverTemplate
		gallery.Settings["cover_config"] = gallery.CoverConfig
	}
	// Password protection indicator (PasswordHash is json:"-" so never leaks)
	gallery.Settings["has_password"] = gallery.PasswordHash != nil && *gallery.PasswordHash != ""
	// M22 E74-S1: Expose watermark config and selection limit to public client
	if gallery.WatermarkConfig != nil {
		gallery.Settings["watermark_config"] = gallery.WatermarkConfig
	}
	gallery.Settings["max_selections"] = gallery.MaxSelections

	// Resolve the design-studio cover asset and attach its thumbnail URLs.
	// The public viewer needs these to render the saved cover even when the
	// share link is scoped to an album (?album=X) that doesn't contain the
	// cover asset itself — without this, ListAssets would return only the
	// album's assets and the hero would either fall back to assets[0] or
	// render no cover at all. The design's `cover.assetId` takes precedence
	// over the legacy `gallery.cover_asset_id`; both are tried before
	// giving up. Best-effort: any failure leaves cover_thumbnails unset and
	// the frontend falls back to its existing legacy behavior.
	if h.assetSvc != nil {
		if coverID := resolveDesignCoverAssetID(gallery.Settings, gallery.CoverAssetID); coverID != nil {
			if coverAsset, err := h.assetSvc.GetByID(r.Context(), *coverID); err == nil && coverAsset != nil && len(coverAsset.ThumbnailURLs) > 0 {
				gallery.Settings["cover_thumbnails"] = coverAsset.ThumbnailURLs
				gallery.Settings["cover_asset_resolved_id"] = coverAsset.ID.String()
			}
		}
	}

	respondJSON(w, http.StatusOK, gallery)
}

// resolveDesignCoverAssetID returns the asset ID the public viewer should use
// for the cover thumbnail. Checks design_config.cover.assetId first, then
// falls back to the gallery's legacy CoverAssetID. Returns nil only when
// neither source has a usable UUID.
func resolveDesignCoverAssetID(settings map[string]interface{}, fallback *uuid.UUID) *uuid.UUID {
	if settings != nil {
		if raw, ok := settings["design_config"]; ok {
			if m, ok := raw.(map[string]interface{}); ok {
				if cover, ok := m["cover"].(map[string]interface{}); ok {
					if idStr, ok := cover["assetId"].(string); ok && idStr != "" {
						if parsed, err := uuid.Parse(idStr); err == nil {
							return &parsed
						}
					}
				}
			}
		}
	}
	return fallback
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

// ListAlbumAssets handles GET /api/v1/public/galleries/{slug}/albums/{albumId}/assets.
func (h *PublicGalleryHandler) ListAlbumAssets(w http.ResponseWriter, r *http.Request) {
	if h.albumSvc == nil {
		http.Error(w, `{"error":"album service unavailable"}`, http.StatusServiceUnavailable)
		return
	}

	slug := chi.URLParam(r, "slug")
	albumID, err := uuid.Parse(chi.URLParam(r, "albumId"))
	if err != nil {
		http.Error(w, `{"error":"invalid album id"}`, http.StatusBadRequest)
		return
	}

	gallery, err := h.gallerySvc.GetBySlug(r.Context(), slug)
	if err != nil || gallery == nil || !gallery.IsPublished {
		http.Error(w, `{"error":"gallery not found"}`, http.StatusNotFound)
		return
	}

	album, err := h.albumSvc.GetByID(r.Context(), albumID)
	if err != nil || album == nil || album.GalleryID != gallery.ID {
		http.Error(w, `{"error":"album not found"}`, http.StatusNotFound)
		return
	}

	albumAssets, err := h.albumSvc.ListAssets(r.Context(), albumID)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	result := make([]publicAssetResponse, 0, len(albumAssets))
	for _, aa := range albumAssets {
		asset, err := h.assetSvc.GetByID(r.Context(), aa.AssetID)
		if err != nil || asset == nil {
			continue
		}
		result = append(result, publicAssetResponse{
			ID:            asset.ID.String(),
			Filename:      asset.Filename,
			ContentType:   asset.ContentType,
			Width:         asset.Width,
			Height:        asset.Height,
			Blurhash:      asset.Blurhash,
			ThumbnailURLs: asset.ThumbnailURLs,
			SortOrder:     aa.Position,
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
	TierSlug              string  `json:"tier_slug"`     // free, standard, pro, enterprise
	CanCustomize          bool    `json:"can_customize"` // true when tier supports white-label overrides
	BrandName             string  `json:"brand_name"`
	LogoURL               *string `json:"logo_url,omitempty"`
	LogoAssetID           *string `json:"logo_asset_id,omitempty"`
	AccentColor           *string `json:"accent_color,omitempty"`
	HideFooter            bool    `json:"hide_footer"` // enterprise-only: hide "Powered by RawDrive"
	PublicBrandingEnabled bool    `json:"public_branding_enabled"`
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
	workspaceBranding := h.lookupWorkspaceBranding(r.Context(), gallery.WorkspaceID)
	canCustomize := canCustomizeForTier(tier) && workspaceBranding.PublicBrandingEnabled

	brandName := "RawDrive"
	var logoURL *string
	var logoAssetID *string
	var accentColor *string
	if canCustomize {
		if workspaceBranding.BrandName != "" {
			brandName = workspaceBranding.BrandName
		} else if workspaceBranding.WorkspaceName != "" {
			brandName = workspaceBranding.WorkspaceName
		}
		if workspaceBranding.BrandAccentColor != "" {
			accentColor = &workspaceBranding.BrandAccentColor
		}
		if workspaceBranding.LogoAssetID != "" {
			logoAssetID = &workspaceBranding.LogoAssetID
			url := "/api/v1/public/galleries/" + slug + "/branding/logo"
			logoURL = &url
		}
	}

	respondJSON(w, http.StatusOK, brandingResponse{
		TierSlug:              tier,
		CanCustomize:          canCustomize,
		BrandName:             brandName,
		LogoURL:               logoURL,
		LogoAssetID:           logoAssetID,
		AccentColor:           accentColor,
		HideFooter:            tier == "enterprise",
		PublicBrandingEnabled: workspaceBranding.PublicBrandingEnabled,
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
	if err == nil && tier != "" {
		return tier
	}

	err = h.pool.QueryRow(ctx,
		`SELECT COALESCE(plan_tier, 'free') FROM workspaces WHERE id = $1`,
		workspaceID,
	).Scan(&tier)
	if err != nil || tier == "" {
		return "free"
	}
	return tier
}

type publicWorkspaceBranding struct {
	WorkspaceName         string
	BrandName             string
	BrandAccentColor      string
	PublicBrandingEnabled bool
	LogoAssetID           string
}

func (h *PublicGalleryHandler) lookupWorkspaceBranding(ctx context.Context, workspaceID uuid.UUID) publicWorkspaceBranding {
	result := publicWorkspaceBranding{PublicBrandingEnabled: true}
	if h.pool == nil {
		return result
	}

	err := h.pool.QueryRow(ctx, `
		SELECT
			COALESCE(name, ''),
			COALESCE(brand_name, ''),
			COALESCE(brand_accent_color, ''),
			COALESCE(public_branding_enabled, true),
			COALESCE(logo_asset_id::text, '')
		FROM workspaces
		WHERE id = $1`,
		workspaceID,
	).Scan(&result.WorkspaceName, &result.BrandName, &result.BrandAccentColor, &result.PublicBrandingEnabled, &result.LogoAssetID)
	if err != nil {
		return publicWorkspaceBranding{PublicBrandingEnabled: true}
	}
	return result
}

// GetBrandingLogo streams the workspace logo through the application after
// resolving the public gallery slug and plan gate. It never exposes the R2
// storage key or public bucket URL to the browser.
func (h *PublicGalleryHandler) GetBrandingLogo(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	if slug == "" {
		http.Error(w, `{"error":"missing slug"}`, http.StatusBadRequest)
		return
	}
	if h.assetSvc == nil || h.pool == nil {
		http.Error(w, `{"error":"branding logo unavailable"}`, http.StatusServiceUnavailable)
		return
	}

	gallery, err := h.gallerySvc.GetBySlug(r.Context(), slug)
	if err != nil || gallery == nil || !gallery.IsPublished {
		http.Error(w, `{"error":"gallery not found"}`, http.StatusNotFound)
		return
	}

	tier := h.lookupWorkspaceTier(r.Context(), gallery.WorkspaceID)
	workspaceBranding := h.lookupWorkspaceBranding(r.Context(), gallery.WorkspaceID)
	if !canCustomizeForTier(tier) || !workspaceBranding.PublicBrandingEnabled || workspaceBranding.LogoAssetID == "" {
		http.Error(w, `{"error":"branding logo not available"}`, http.StatusNotFound)
		return
	}

	logoAssetID, err := uuid.Parse(workspaceBranding.LogoAssetID)
	if err != nil {
		http.Error(w, `{"error":"branding logo invalid"}`, http.StatusNotFound)
		return
	}

	var storageKey, contentType, filename string
	err = h.pool.QueryRow(r.Context(), `
		SELECT storage_key, content_type, filename
		FROM assets
		WHERE id = $1
		  AND workspace_id = $2
		  AND deleted_at IS NULL
		  AND content_type LIKE 'image/%'`,
		logoAssetID, gallery.WorkspaceID,
	).Scan(&storageKey, &contentType, &filename)
	if err != nil {
		http.Error(w, `{"error":"branding logo not found"}`, http.StatusNotFound)
		return
	}

	reader, err := h.assetSvc.GetStorageReader(r.Context(), storageKey)
	if err != nil {
		http.Error(w, `{"error":"branding logo retrieval failed"}`, http.StatusInternalServerError)
		return
	}
	defer reader.Close()

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`inline; filename="%s"`, filename))
	_, _ = io.Copy(w, reader)
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

// ──────────────────────────────────────────────────────────────────────────────
// M21: Public Asset Download
// ──────────────────────────────────────────────────────────────────────────────

// PublicAssetDownload handles GET /api/v1/public/galleries/{slug}/assets/{assetId}/download.
// Streams the original file from R2 storage for published galleries that have
// downloads enabled. No JWT required — this is a public endpoint.
func (h *PublicGalleryHandler) PublicAssetDownload(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	if slug == "" {
		http.Error(w, `{"error":"missing slug"}`, http.StatusBadRequest)
		return
	}

	assetIDStr := chi.URLParam(r, "assetId")
	assetID, err := uuid.Parse(assetIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid asset id"}`, http.StatusBadRequest)
		return
	}

	gallery, err := h.gallerySvc.GetBySlug(r.Context(), slug)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	if gallery == nil || !gallery.IsPublished {
		http.Error(w, `{"error":"gallery not found"}`, http.StatusNotFound)
		return
	}

	// M19 F-009: Gallery expiry enforcement
	if gallery.ExpiresAt != nil && gallery.ExpiresAt.Before(time.Now().UTC()) {
		http.Error(w, `{"error":"gallery expired"}`, http.StatusGone)
		return
	}

	if !gallery.DownloadEnabled {
		http.Error(w, `{"error":"downloads disabled for this gallery"}`, http.StatusForbidden)
		return
	}

	// Verify the asset belongs to this gallery
	galleryAssets, err := h.gallerySvc.ListAssets(r.Context(), gallery.ID)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	found := false
	for _, ga := range galleryAssets {
		if ga.AssetID == assetID {
			found = true
			break
		}
	}
	if !found {
		http.Error(w, `{"error":"asset not in gallery"}`, http.StatusNotFound)
		return
	}

	// Fetch asset details
	asset, err := h.assetSvc.GetByID(r.Context(), assetID)
	if err != nil || asset == nil {
		http.Error(w, `{"error":"asset not found"}`, http.StatusNotFound)
		return
	}

	// Stream file from R2 storage
	reader, err := h.assetSvc.GetStorageReader(r.Context(), asset.StorageKey)
	if err != nil {
		http.Error(w, `{"error":"file retrieval failed"}`, http.StatusInternalServerError)
		return
	}
	defer reader.Close()

	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, asset.Filename))
	w.Header().Set("Content-Type", asset.ContentType)
	if asset.SizeBytes > 0 {
		w.Header().Set("Content-Length", fmt.Sprintf("%d", asset.SizeBytes))
	}

	io.Copy(w, reader)
}
