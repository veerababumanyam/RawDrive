package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/rawdrive/backend/internal/service"
)

// PublicGalleryHandler handles public gallery viewing (no auth).
type PublicGalleryHandler struct {
	gallerySvc *service.GalleryService
	assetSvc   *service.AssetService
	shareSvc   *service.ShareLinkService
}

func NewPublicGalleryHandler(gs *service.GalleryService, as *service.AssetService, ss *service.ShareLinkService) *PublicGalleryHandler {
	return &PublicGalleryHandler{gallerySvc: gs, assetSvc: as, shareSvc: ss}
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
