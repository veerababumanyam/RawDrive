package handler

import (
	"context"
	"net/http"
	"net/url"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
)

type galleryClientPreviewResponse struct {
	Gallery         *repository.Gallery         `json:"gallery"`
	Assets          []publicAssetResponse       `json:"assets"`
	Albums          []publicAlbumResponse       `json:"albums"`
	TotalAssetCount int                         `json:"total_asset_count"`
	Branding        *brandingResponse           `json:"branding,omitempty"`
	Banners         []repository.GalleryBanner  `json:"banners"`
	Products        []repository.GalleryProduct `json:"products"`
	PublicURL       string                      `json:"public_url"`
	IsPublished     bool                        `json:"is_published"`
}

// ClientPreview handles GET /api/v1/galleries/{id}/client-preview.
//
// It returns the public-gallery render payload to an authenticated owner without
// enforcing the publish gate or minting gallery sessions / asset-access tokens.
// Public side effects stay disabled in the frontend through explicit preview
// props; this endpoint is only the read-only data source.
func (h *GalleryHandler) ClientPreview(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	gallery, workspaceID, ok := h.requireGalleryInWorkspace(w, r, id)
	if !ok {
		return
	}

	galleryAssets, err := h.gallerySvc.ListAssets(r.Context(), gallery.ID)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	previewGallery := cloneGalleryForClientPreview(gallery)
	h.enrichClientPreviewSettings(r.Context(), previewGallery, galleryAssets)

	selectedAssets := galleryAssets
	if rawAlbumID := strings.TrimSpace(r.URL.Query().Get("album")); rawAlbumID != "" {
		if h.albumSvc == nil {
			http.Error(w, `{"error":"album service unavailable"}`, http.StatusServiceUnavailable)
			return
		}
		albumID, err := uuid.Parse(rawAlbumID)
		if err != nil {
			http.Error(w, `{"error":"invalid album id"}`, http.StatusBadRequest)
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
		selectedAssets = make([]repository.GalleryAsset, 0, len(albumAssets))
		for _, aa := range albumAssets {
			selectedAssets = append(selectedAssets, repository.GalleryAsset{
				GalleryID: gallery.ID,
				AssetID:   aa.AssetID,
				SortOrder: aa.Position,
				AddedAt:   aa.AddedAt,
			})
		}
	}

	respondJSON(w, http.StatusOK, galleryClientPreviewResponse{
		Gallery:         previewGallery,
		Assets:          h.clientPreviewAssetResponses(r.Context(), selectedAssets),
		Albums:          h.clientPreviewAlbums(r.Context(), gallery.ID),
		TotalAssetCount: len(galleryAssets),
		Branding:        h.clientPreviewBranding(r.Context(), previewGallery, workspaceID),
		Banners:         h.clientPreviewBanners(r.Context(), gallery.ID),
		Products:        h.clientPreviewProducts(r.Context(), gallery.ID),
		PublicURL:       h.clientPreviewPublicURL(r.Context(), previewGallery, workspaceID),
		IsPublished:     gallery.IsPublished,
	})
}

func cloneGalleryForClientPreview(g *repository.Gallery) *repository.Gallery {
	if g == nil {
		return nil
	}
	copy := *g
	copy.Settings = make(map[string]interface{}, len(g.Settings)+6)
	for k, v := range g.Settings {
		copy.Settings[k] = v
	}
	delete(copy.Settings, "asset_access_token")
	return &copy
}

func (h *GalleryHandler) enrichClientPreviewSettings(ctx context.Context, gallery *repository.Gallery, galleryAssets []repository.GalleryAsset) {
	if gallery == nil {
		return
	}
	if gallery.Settings == nil {
		gallery.Settings = map[string]interface{}{}
	}
	if gallery.CoverTemplate != "" && gallery.CoverTemplate != "none" {
		gallery.Settings["cover_template"] = gallery.CoverTemplate
		gallery.Settings["cover_config"] = gallery.CoverConfig
	}
	gallery.Settings["has_password"] = gallery.PasswordHash != nil && *gallery.PasswordHash != ""
	if gallery.WatermarkConfig != nil {
		gallery.Settings["watermark_config"] = gallery.WatermarkConfig
	}
	gallery.Settings["max_selections"] = gallery.MaxSelections

	profileCoverIDs := resolveDesignCoverProfileAssetIDs(gallery.Settings, gallery.CoverAssetID)
	if len(profileCoverIDs) > 0 {
		uniqueIDs := make([]uuid.UUID, 0, len(profileCoverIDs))
		seenIDs := make(map[uuid.UUID]struct{}, len(profileCoverIDs))
		for _, id := range profileCoverIDs {
			if _, ok := seenIDs[id]; ok || !galleryAssetContains(galleryAssets, id) {
				continue
			}
			seenIDs[id] = struct{}{}
			uniqueIDs = append(uniqueIDs, id)
		}
		assets := h.clientPreviewAssetsByID(ctx, uniqueIDs)
		profileThumbnails := make(map[string]map[string]string, len(profileCoverIDs))
		for device, id := range profileCoverIDs {
			coverAsset := assets[id]
			if coverAsset == nil || len(coverAsset.ThumbnailURLs) == 0 {
				continue
			}
			profileThumbnails[device] = coverAsset.ThumbnailURLs
			if device == "desktop" {
				gallery.Settings["cover_thumbnails"] = coverAsset.ThumbnailURLs
				gallery.Settings["cover_asset_resolved_id"] = coverAsset.ID.String()
			}
		}
		if len(profileThumbnails) > 0 {
			gallery.Settings["cover_profile_thumbnails"] = profileThumbnails
		}
	}
}

func galleryAssetContains(items []repository.GalleryAsset, assetID uuid.UUID) bool {
	for _, item := range items {
		if item.AssetID == assetID {
			return true
		}
	}
	return false
}

func (h *GalleryHandler) clientPreviewAssetsByID(ctx context.Context, ids []uuid.UUID) map[uuid.UUID]*repository.Asset {
	byID := make(map[uuid.UUID]*repository.Asset, len(ids))
	if len(ids) == 0 {
		return byID
	}
	batch := h.assetBatch
	if batch == nil && h.pool != nil {
		batch = poolAssetBatchSource{pool: h.pool}
	}
	if batch == nil {
		return byID
	}
	assets, err := batch.GetByIDs(ctx, ids)
	if err != nil {
		return byID
	}
	for _, asset := range assets {
		if asset != nil {
			byID[asset.ID] = asset
		}
	}
	return byID
}

func (h *GalleryHandler) clientPreviewAssetResponses(ctx context.Context, junctions []repository.GalleryAsset) []publicAssetResponse {
	ids := make([]uuid.UUID, 0, len(junctions))
	for _, j := range junctions {
		ids = append(ids, j.AssetID)
	}
	assetsByID := h.clientPreviewAssetsByID(ctx, ids)
	out := make([]publicAssetResponse, 0, len(junctions))
	for _, j := range junctions {
		asset := assetsByID[j.AssetID]
		if asset == nil {
			continue
		}
		out = append(out, publicAssetResponse{
			ID:              asset.ID.String(),
			Filename:        asset.Filename,
			ContentType:     asset.ContentType,
			Width:           asset.Width,
			Height:          asset.Height,
			Blurhash:        asset.Blurhash,
			ThumbnailURLs:   asset.ThumbnailURLs,
			IsEncrypted:     asset.IsEncrypted,
			MediaEncryption: asset.MediaEncryption,
			SortOrder:       j.SortOrder,
		})
	}
	return out
}

func (h *GalleryHandler) clientPreviewAlbums(ctx context.Context, galleryID uuid.UUID) []publicAlbumResponse {
	if h.albumSvc == nil {
		return []publicAlbumResponse{}
	}
	albums, err := h.albumSvc.ListByGallery(ctx, galleryID)
	if err != nil {
		return []publicAlbumResponse{}
	}
	out := make([]publicAlbumResponse, 0, len(albums))
	for _, album := range albums {
		assetCount := 0
		if assets, err := h.albumSvc.ListAssets(ctx, album.ID); err == nil {
			assetCount = len(assets)
		}
		out = append(out, publicAlbumResponse{
			ID:         album.ID.String(),
			Name:       album.Name,
			AssetCount: assetCount,
			IsSmart:    len(album.SmartFilter) > 0,
			Position:   album.Position,
		})
	}
	return out
}

func (h *GalleryHandler) clientPreviewBranding(ctx context.Context, gallery *repository.Gallery, workspaceID uuid.UUID) *brandingResponse {
	publicHandler := &PublicGalleryHandler{pool: h.pool}
	tier := publicHandler.lookupWorkspaceTier(ctx, workspaceID)
	workspaceBranding := publicHandler.lookupWorkspaceBranding(ctx, workspaceID)
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
			if gallery != nil && gallery.IsPublished && gallery.Slug != "" {
				url := "/api/v1/public/galleries/" + gallery.Slug + "/branding/logo"
				logoURL = &url
			}
		}
	}

	return &brandingResponse{
		TierSlug:              tier,
		CanCustomize:          canCustomize,
		BrandName:             brandName,
		LogoURL:               logoURL,
		LogoAssetID:           logoAssetID,
		AccentColor:           accentColor,
		HideFooter:            tier == "enterprise" || tier == "elite_studio",
		PublicBrandingEnabled: workspaceBranding.PublicBrandingEnabled,
	}
}

func (h *GalleryHandler) clientPreviewProducts(ctx context.Context, galleryID uuid.UUID) []repository.GalleryProduct {
	if h.productSvc == nil || h.pool == nil {
		return []repository.GalleryProduct{}
	}
	products, err := h.productSvc.List(ctx, galleryID)
	if err != nil {
		return []repository.GalleryProduct{}
	}
	return products
}

func (h *GalleryHandler) clientPreviewBanners(ctx context.Context, galleryID uuid.UUID) []repository.GalleryBanner {
	if h.bannerSvc == nil || h.pool == nil {
		return []repository.GalleryBanner{}
	}
	banners, err := h.bannerSvc.ListLive(ctx, galleryID)
	if err != nil {
		return []repository.GalleryBanner{}
	}
	return banners
}

func (h *GalleryHandler) clientPreviewPublicURL(ctx context.Context, gallery *repository.Gallery, workspaceID uuid.UUID) string {
	if gallery == nil || gallery.Slug == "" {
		return ""
	}
	base := strings.TrimRight(strings.TrimSpace(h.publicBaseURL), "/")
	if isClientPreviewLocalOrigin(base) {
		return base + "/g/" + gallery.Slug
	}

	if h.pool != nil {
		var slug, code string
		err := h.pool.QueryRow(ctx, `
			SELECT COALESCE(business_profile_slug, ''), COALESCE(business_unique_code, '')
			FROM workspaces
			WHERE id = $1`,
			workspaceID,
		).Scan(&slug, &code)
		if err == nil && slug != "" && code != "" {
			return publicStudioSubdomainURL(slug+"-"+code) + "/" + gallery.Slug
		}
	}

	if base != "" {
		return base + "/g/" + gallery.Slug
	}
	return "/g/" + gallery.Slug
}

func isClientPreviewLocalOrigin(origin string) bool {
	if origin == "" {
		return false
	}
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	host := u.Hostname()
	return host == "localhost" || host == "127.0.0.1" || host == "::1"
}
