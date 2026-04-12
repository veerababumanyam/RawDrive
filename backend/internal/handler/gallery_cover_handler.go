package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
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

// FocalPointPayload mirrors the frontend shape for GAL-FR-061. The frontend
// sends focal_point: { x, y } as 0-100 percentages.
type FocalPointPayload struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// CoverUpdateRequest is the canonical shape of PUT /galleries/{id}/cover.
type CoverUpdateRequest struct {
	AssetID    string             `json:"asset_id"`
	StyleID    string             `json:"style_id"`
	FocalPoint *FocalPointPayload `json:"focal_point,omitempty"`
	// M19: Cover page template (full_bleed, split_screen, minimal_white, classic_film, festive)
	Template     string                 `json:"template,omitempty"`
	TemplateConfig map[string]interface{} `json:"template_config,omitempty"`
}

// validCoverTemplates lists the 5 cover page templates from F-009.
var validCoverTemplates = map[string]bool{
	"none": true, "full_bleed": true, "split_screen": true,
	"minimal_white": true, "classic_film": true, "festive": true,
}

// parseCoverRequest decodes and validates the request body. Extracted so
// the parsing/validation logic can be unit-tested without a repository.
// Defaults focal_point to (50, 50) when omitted so first-save is sane.
func parseCoverRequest(body []byte) (CoverUpdateRequest, error) {
	var req CoverUpdateRequest
	if err := json.Unmarshal(body, &req); err != nil {
		return req, fmt.Errorf("invalid request body: %w", err)
	}
	if req.FocalPoint == nil {
		req.FocalPoint = &FocalPointPayload{X: 50, Y: 50}
	}
	if req.FocalPoint.X < 0 || req.FocalPoint.X > 100 || req.FocalPoint.Y < 0 || req.FocalPoint.Y > 100 {
		return req, errors.New("focal_point x and y must be between 0 and 100")
	}
	if req.StyleID != "" && !validCoverStyles[req.StyleID] {
		return req, fmt.Errorf("invalid style_id: %s (must be one of 30 valid cover styles)", req.StyleID)
	}
	if req.Template != "" && !validCoverTemplates[req.Template] {
		return req, fmt.Errorf("invalid template: %s (must be one of: none, full_bleed, split_screen, minimal_white, classic_film, festive)", req.Template)
	}
	return req, nil
}

// UpdateCover handles PUT /api/v1/galleries/{id}/cover.
func (h *GalleryCoverHandler) UpdateCover(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery ID"}`, http.StatusBadRequest)
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<14)) // 16KB — cover config is tiny
	if err != nil {
		http.Error(w, `{"error":"failed to read body"}`, http.StatusBadRequest)
		return
	}

	req, err := parseCoverRequest(body)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusBadRequest)
		return
	}

	var assetID *uuid.UUID
	if req.AssetID != "" {
		parsed, err := uuid.Parse(req.AssetID)
		if err != nil {
			http.Error(w, `{"error":"invalid asset_id"}`, http.StatusBadRequest)
			return
		}
		assetID = &parsed
	}

	gallery, err := h.galleryRepo.GetByID(r.Context(), galleryID)
	if err != nil || gallery == nil {
		http.Error(w, `{"error":"gallery not found"}`, http.StatusNotFound)
		return
	}

	if gallery.Settings == nil {
		gallery.Settings = make(map[string]interface{})
	}
	gallery.Settings["cover_style"] = map[string]interface{}{
		"asset_id": assetID,
		"style_id": req.StyleID,
		"focal_point": map[string]float64{
			"x": req.FocalPoint.X,
			"y": req.FocalPoint.Y,
		},
	}

	if assetID != nil {
		if err := h.galleryRepo.UpdateCover(r.Context(), galleryID, assetID); err != nil {
			http.Error(w, `{"error":"failed to update cover"}`, http.StatusInternalServerError)
			return
		}
	}

	// M19: Persist cover template selection
	if req.Template != "" {
		gallery.CoverTemplate = req.Template
	}
	if req.TemplateConfig != nil {
		gallery.CoverConfig = req.TemplateConfig
	}

	if err := h.galleryRepo.Update(r.Context(), gallery); err != nil {
		http.Error(w, `{"error":"failed to save cover config"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status":         "updated",
		"cover":          gallery.Settings["cover_style"],
		"cover_template": gallery.CoverTemplate,
	})
}
