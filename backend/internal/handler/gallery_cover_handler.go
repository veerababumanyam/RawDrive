package handler

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

// GalleryCoverHandler handles cover photo configuration.
type GalleryCoverHandler struct {
	galleryRepo *repository.GalleryRepo
}

// NewGalleryCoverHandler creates a new GalleryCoverHandler.
func NewGalleryCoverHandler(gr *repository.GalleryRepo) *GalleryCoverHandler {
	return &GalleryCoverHandler{galleryRepo: gr}
}

// validCoverStyles lists all 30 valid cover style IDs.
var validCoverStyles = map[string]bool{
	"classic-full": true, "classic-split": true, "classic-minimal": true,
	"hero-overlay": true, "hero-gradient": true, "hero-blur": true,
	"editorial-left": true, "editorial-right": true, "editorial-center": true,
	"magazine-cover": true, "magazine-spread": true, "magazine-minimal": true,
	"cinematic-wide": true, "cinematic-dark": true, "cinematic-grain": true,
	"elegant-border": true, "elegant-frame": true, "elegant-vignette": true,
	"modern-grid": true, "modern-asymmetric": true, "modern-overlap": true,
	"vintage-polaroid": true, "vintage-film": true, "vintage-sepia": true,
	"bold-typography": true, "bold-color-block": true, "bold-geometric": true,
	"nature-earth": true, "nature-botanical": true, "nature-panoramic": true,
}

// UpdateCover handles PUT /api/v1/galleries/{id}/cover.
func (h *GalleryCoverHandler) UpdateCover(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery ID"}`, http.StatusBadRequest)
		return
	}

	var req struct {
		AssetID string  `json:"asset_id"`
		StyleID string  `json:"style_id"`
		FocalX  float64 `json:"focal_x"`
		FocalY  float64 `json:"focal_y"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	// Validate focal point range
	if req.FocalX < 0 || req.FocalX > 100 || req.FocalY < 0 || req.FocalY > 100 {
		http.Error(w, `{"error":"focal_x and focal_y must be between 0 and 100"}`, http.StatusBadRequest)
		return
	}

	// Validate cover style
	if req.StyleID != "" && !validCoverStyles[req.StyleID] {
		http.Error(w, fmt.Sprintf(`{"error":"invalid style_id: %s. Must be one of 30 valid cover styles"}`, req.StyleID), http.StatusBadRequest)
		return
	}

	// Parse asset ID if provided
	var assetID *uuid.UUID
	if req.AssetID != "" {
		parsed, err := uuid.Parse(req.AssetID)
		if err != nil {
			http.Error(w, `{"error":"invalid asset_id"}`, http.StatusBadRequest)
			return
		}
		assetID = &parsed
	}

	// Update gallery cover
	gallery, err := h.galleryRepo.GetByID(r.Context(), galleryID)
	if err != nil || gallery == nil {
		http.Error(w, `{"error":"gallery not found"}`, http.StatusNotFound)
		return
	}

	if gallery.Settings == nil {
		gallery.Settings = make(map[string]interface{})
	}
	gallery.Settings["cover_config"] = map[string]interface{}{
		"asset_id": assetID,
		"style_id": req.StyleID,
		"focal_x":  req.FocalX,
		"focal_y":  req.FocalY,
	}

	if assetID != nil {
		if err := h.galleryRepo.UpdateCover(r.Context(), galleryID, assetID); err != nil {
			http.Error(w, `{"error":"failed to update cover"}`, http.StatusInternalServerError)
			return
		}
	}

	if err := h.galleryRepo.Update(r.Context(), gallery); err != nil {
		http.Error(w, `{"error":"failed to save cover config"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "updated",
		"cover":  gallery.Settings["cover_config"],
	})
}
