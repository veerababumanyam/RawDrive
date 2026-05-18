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

	// 2026-05-18: watermark baking for the public download path. Optional —
	// when nil, PublicAssetDownload streams the raw original. When set and
	// the gallery's watermark_config is enabled, the original is decoded,
	// watermarked, and re-encoded as JPEG before being streamed.
	watermarkSvc *service.WatermarkService
}

func NewPublicGalleryHandler(gs *service.GalleryService, as *service.AssetService, ss *service.ShareLinkService) *PublicGalleryHandler {
	return &PublicGalleryHandler{gallerySvc: gs, assetSvc: as, shareSvc: ss}
}

// WithWatermarkService wires the optional watermark baker used by
// PublicAssetDownload. Returns the receiver for chained construction.
func (h *PublicGalleryHandler) WithWatermarkService(ws *service.WatermarkService) *PublicGalleryHandler {
	h.watermarkSvc = ws
	return h
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

// publicAlbumResponse is the shape returned by GET .../albums for the
// public viewer. Excludes owner-only fields like description,
// cover_asset_id, parent_id, and the raw smart_filter JSON — guests only
// need enough to render a filter chip (id, name, count, isSmart hint).
type publicAlbumResponse struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	AssetCount int    `json:"asset_count"`
	IsSmart    bool   `json:"is_smart"`
	Position   int    `json:"position"`
}

// ListAlbums handles GET /api/v1/public/galleries/{slug}/albums.
//
// Returns the gallery's albums + utility smart albums with asset counts so
// the public viewer can render a chip strip beneath the cover image (All
// Photos, sub-galleries, Favorites, Videos, RAW). Counts are resolved
// through albumSvc.ListAssets which already dispatches smart-album
// resolution (M41/105 favorites + content_type filters), so the same
// numbers shown to the photographer in the dashboard appear here.
//
// Empty albums are included (Videos 0, RAW 0) — the chip's count badge
// is part of the affordance even when zero. The owner-only manual albums
// with zero photos are also included since photographers may publish
// galleries with planned-but-unfilled sub-galleries.
func (h *PublicGalleryHandler) ListAlbums(w http.ResponseWriter, r *http.Request) {
	if h.albumSvc == nil {
		http.Error(w, `{"error":"album service unavailable"}`, http.StatusServiceUnavailable)
		return
	}

	slug := chi.URLParam(r, "slug")
	gallery, err := h.gallerySvc.GetBySlug(r.Context(), slug)
	if err != nil || gallery == nil || !gallery.IsPublished {
		http.Error(w, `{"error":"gallery not found"}`, http.StatusNotFound)
		return
	}

	albums, err := h.albumSvc.ListByGallery(r.Context(), gallery.ID)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	result := make([]publicAlbumResponse, 0, len(albums))
	for _, a := range albums {
		// Count via ListAssets so smart-album resolution (favorites,
		// content_type) is honored. ListAssets is cheap for smart
		// albums on small galleries; if this becomes hot for large
		// galleries we can add a dedicated COUNT(*) path later.
		assets, err := h.albumSvc.ListAssets(r.Context(), a.ID)
		count := 0
		if err == nil {
			count = len(assets)
		}
		result = append(result, publicAlbumResponse{
			ID:         a.ID.String(),
			Name:       a.Name,
			AssetCount: count,
			IsSmart:    len(a.SmartFilter) > 0,
			Position:   a.Position,
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
// resolving the public gallery slug and plan gate. It never exposes the
// object-store storage key or public bucket URL to the browser.
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
// PR-3b: Public People tab — read-only face cluster + photos lookup by slug
// ──────────────────────────────────────────────────────────────────────────────

// publicPersonResponse is the public-safe projection of an ai.ClusterSummary.
// We deliberately drop the workspace-owner-only sample_bounding_box for now —
// guest viewers see the same fields the studio People grid uses, except the
// face-crop math will fall back to object-position:center.
type publicPersonResponse struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	FaceCount  int    `json:"face_count"`
	AssetCount int    `json:"asset_count"`
	CoverAsset string `json:"cover_asset_id"`
}

// isFaceRecognitionEnabledForGallery checks both gates that must pass before
// guests can see face data:
//
//  1. workspaces.face_recognition_enabled (migration 110) — workspace-level
//     opt-in for biometric data processing under Indian DPDP / EU GDPR.
//  2. galleries.face_detection_enabled (migration 046) — per-gallery
//     opt-out, defaults true.
//
// Returns false when either gate is closed. Errors propagate as false +
// non-nil error so the caller can fail-closed.
func (h *PublicGalleryHandler) isFaceRecognitionEnabledForGallery(ctx context.Context, galleryID, workspaceID uuid.UUID) (bool, error) {
	if h.pool == nil {
		// Public handler started without WithM13Deps wiring — fail closed.
		return false, fmt.Errorf("face recognition deps not wired")
	}
	var wsEnabled, galEnabled bool
	err := h.pool.QueryRow(ctx, `
		SELECT
		  (SELECT face_recognition_enabled FROM workspaces WHERE id = $1),
		  (SELECT face_detection_enabled   FROM galleries  WHERE id = $2)
	`, workspaceID, galleryID).Scan(&wsEnabled, &galEnabled)
	if err != nil {
		return false, err
	}
	return wsEnabled && galEnabled, nil
}

// ListPeople handles GET /api/v1/public/galleries/{slug}/people. Read-only
// listing of face clusters for a published gallery, gated on the workspace
// + per-gallery opt-in flags. Guests cannot rename / merge / split — those
// stay on the authed studio /api/v1/ai/clusters endpoints.
func (h *PublicGalleryHandler) ListPeople(w http.ResponseWriter, r *http.Request) {
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
	if h.faceRepo == nil {
		// Treat unwired faceRepo as "feature unavailable" rather than 500
		// so the public viewer can degrade gracefully.
		respondJSON(w, http.StatusOK, []publicPersonResponse{})
		return
	}
	enabled, err := h.isFaceRecognitionEnabledForGallery(r.Context(), gallery.ID, gallery.WorkspaceID)
	if err != nil {
		http.Error(w, `{"error":"face recognition status check failed"}`, http.StatusInternalServerError)
		return
	}
	if !enabled {
		// Same "feature off" projection as the unwired-handler case. The
		// public viewer's UI hides the People tab when this returns empty.
		respondJSON(w, http.StatusOK, []publicPersonResponse{})
		return
	}
	gid := gallery.ID
	clusters, err := h.faceRepo.ListClusters(r.Context(), gallery.WorkspaceID, &gid)
	if err != nil {
		http.Error(w, `{"error":"failed to list people"}`, http.StatusInternalServerError)
		return
	}
	out := make([]publicPersonResponse, 0, len(clusters))
	for _, c := range clusters {
		out = append(out, publicPersonResponse{
			ID:         c.ClusterLabel.String(),
			Name:       c.ClusterName,
			FaceCount:  c.FaceCount,
			AssetCount: c.AssetCount,
			CoverAsset: c.SampleAssetID.String(),
		})
	}
	respondJSON(w, http.StatusOK, out)
}

// ListPersonPhotos handles GET /api/v1/public/galleries/{slug}/people/{personId}/photos.
// Returns the asset IDs in the gallery that contain the given person. Uses
// the gallery-scoped ListClusterAssetIDsInGallery (not the workspace-scoped
// helper) so a guest viewer of gallery A cannot enumerate the same person's
// photos in gallery B of the same workspace.
func (h *PublicGalleryHandler) ListPersonPhotos(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	if slug == "" {
		http.Error(w, `{"error":"missing slug"}`, http.StatusBadRequest)
		return
	}
	personIDStr := chi.URLParam(r, "personId")
	personID, err := uuid.Parse(personIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid personId"}`, http.StatusBadRequest)
		return
	}
	gallery, err := h.gallerySvc.GetBySlug(r.Context(), slug)
	if err != nil || gallery == nil || !gallery.IsPublished {
		http.Error(w, `{"error":"gallery not found"}`, http.StatusNotFound)
		return
	}
	if h.faceRepo == nil {
		respondJSON(w, http.StatusOK, map[string]any{"asset_ids": []string{}, "count": 0})
		return
	}
	enabled, err := h.isFaceRecognitionEnabledForGallery(r.Context(), gallery.ID, gallery.WorkspaceID)
	if err != nil {
		http.Error(w, `{"error":"face recognition status check failed"}`, http.StatusInternalServerError)
		return
	}
	if !enabled {
		respondJSON(w, http.StatusOK, map[string]any{"asset_ids": []string{}, "count": 0})
		return
	}
	ids, err := h.faceRepo.ListClusterAssetIDsInGallery(r.Context(), gallery.ID, personID)
	if err != nil {
		http.Error(w, `{"error":"failed to list person photos"}`, http.StatusInternalServerError)
		return
	}
	stringIDs := make([]string, 0, len(ids))
	for _, id := range ids {
		stringIDs = append(stringIDs, id.String())
	}
	respondJSON(w, http.StatusOK, map[string]any{
		"asset_ids": stringIDs,
		"count":     len(stringIDs),
	})
}

// ──────────────────────────────────────────────────────────────────────────────
// M21: Public Asset Download
// ──────────────────────────────────────────────────────────────────────────────

// PublicAssetDownload handles GET /api/v1/public/galleries/{slug}/assets/{assetId}/download.
// Streams the original file from the object store (Backblaze B2 by default)
// for published galleries that have downloads enabled. No JWT required —
// this is a public endpoint.
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

	// Stream file from object storage
	reader, err := h.assetSvc.GetStorageReader(r.Context(), asset.StorageKey)
	if err != nil {
		http.Error(w, `{"error":"file retrieval failed"}`, http.StatusInternalServerError)
		return
	}
	defer reader.Close()

	// 2026-05-18: bake the gallery's text watermark into the download when:
	//   1. The photographer enabled it on /galleries/{id}/settings
	//      (watermark_config.enabled = true with non-empty text)
	//   2. The source content_type is a JPEG/PNG image — stdlib decoders
	//      can't handle RAW (CR2/NEF/ARW) or HEIC, and we don't want to
	//      bake into the WebP/AVIF derivatives either (we serve originals).
	//   3. A watermark service was wired at startup (always true in main.go
	//      since v0.0.51; nil-safe so tests that omit it still pass through).
	if h.watermarkSvc != nil && service.IsEnabled(gallery.WatermarkConfig) && supportsWatermarkBaking(asset.ContentType) {
		cfg := service.ConfigFromMap(gallery.WatermarkConfig)
		watermarked, werr := h.watermarkSvc.Apply(r.Context(), reader, cfg)
		if werr == nil {
			// The watermark service re-encodes as JPEG. Update headers
			// accordingly so the browser names the file with .jpg and the
			// MIME type matches the bytes being sent. Drop Content-Length
			// — re-encoding changes the byte count and we don't know the
			// new size without buffering the whole stream first.
			outName := watermarkedFilename(asset.Filename)
			w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, outName))
			w.Header().Set("Content-Type", "image/jpeg")
			w.Header().Set("X-Watermarked", "true")
			io.Copy(w, watermarked)
			return
		}
		// Bake failed (decode error, unsupported color profile, etc.) —
		// fall through to the original-stream path below so the download
		// still completes. The watermark is "best effort" on the download
		// path; the public viewer keeps its CSS overlay as a second line.
	}

	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, asset.Filename))
	w.Header().Set("Content-Type", asset.ContentType)
	if asset.SizeBytes > 0 {
		w.Header().Set("Content-Length", fmt.Sprintf("%d", asset.SizeBytes))
	}

	io.Copy(w, reader)
}

// supportsWatermarkBaking reports whether the asset's content type can be
// decoded by the stdlib image package + imaging library used by
// WatermarkService.Apply. RAW formats (CR2/NEF/ARW/DNG) and HEIC are not
// supported — those downloads stream untouched.
func supportsWatermarkBaking(contentType string) bool {
	switch strings.ToLower(contentType) {
	case "image/jpeg", "image/jpg", "image/pjpeg", "image/png":
		return true
	default:
		return false
	}
}

// watermarkedFilename swaps the original extension for .jpg since the bake
// path re-encodes as JPEG. Preserves the stem ("Wedding (42).NEF" →
// "Wedding (42).jpg") and tolerates dotted filenames.
func watermarkedFilename(name string) string {
	if i := strings.LastIndex(name, "."); i > 0 {
		return name[:i] + ".jpg"
	}
	return name + ".jpg"
}
