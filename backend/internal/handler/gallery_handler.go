package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

// GalleryHandler handles gallery HTTP requests.
type GalleryHandler struct {
	gallerySvc *service.GalleryService
}

// NewGalleryHandler creates a new GalleryHandler.
func NewGalleryHandler(svc *service.GalleryService) *GalleryHandler {
	return &GalleryHandler{gallerySvc: svc}
}

// Create handles POST /api/v1/galleries
func (h *GalleryHandler) Create(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	userID, _ := getUserID(r)

	var input struct {
		Title       string `json:"title"`
		Description string `json:"description"`
		GalleryType string `json:"gallery_type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}
	if input.Title == "" {
		http.Error(w, `{"error":"title required"}`, http.StatusBadRequest)
		return
	}
	if input.GalleryType == "" {
		input.GalleryType = "proofing"
	}

	gallery, err := h.gallerySvc.Create(r.Context(), service.CreateGalleryInput{
		WorkspaceID: workspaceID,
		Title:       input.Title,
		Description: input.Description,
		GalleryType: input.GalleryType,
		CreatedBy:   userID,
	})
	if err != nil {
		http.Error(w, `{"error":"create failed"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusCreated, gallery)
}

// List handles GET /api/v1/galleries
func (h *GalleryHandler) List(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}

	galleries, err := h.gallerySvc.List(r.Context(), repository.GalleryFilter{
		WorkspaceID: workspaceID,
		Status:      r.URL.Query().Get("status"),
		GalleryType: r.URL.Query().Get("type"),
		Search:      r.URL.Query().Get("search"),
		Limit:       50,
	})
	if err != nil {
		http.Error(w, `{"error":"list failed"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusOK, galleries)
}

// GetByID handles GET /api/v1/galleries/{id}
func (h *GalleryHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	gallery, err := h.gallerySvc.GetByID(r.Context(), id)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	if gallery == nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}

	respondJSON(w, http.StatusOK, gallery)
}

// Update handles PUT /api/v1/galleries/{id}
func (h *GalleryHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	gallery, err := h.gallerySvc.GetByID(r.Context(), id)
	if err != nil || gallery == nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}

	var input struct {
		Title       *string `json:"title,omitempty"`
		Description *string `json:"description,omitempty"`
		Status      *string `json:"status,omitempty"`
		IsPublished *bool   `json:"is_published,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	if input.Title != nil {
		gallery.Title = *input.Title
	}
	if input.Description != nil {
		gallery.Description = *input.Description
	}
	if input.Status != nil {
		gallery.Status = *input.Status
	}
	if input.IsPublished != nil {
		gallery.IsPublished = *input.IsPublished
	}

	if err := h.gallerySvc.Update(r.Context(), gallery); err != nil {
		http.Error(w, `{"error":"update failed"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusOK, gallery)
}

// SoftDelete handles DELETE /api/v1/galleries/{id}
func (h *GalleryHandler) SoftDelete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	if err := h.gallerySvc.SoftDelete(r.Context(), id); err != nil {
		http.Error(w, `{"error":"delete failed"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// AddAsset handles POST /api/v1/galleries/{id}/assets
func (h *GalleryHandler) AddAsset(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	var input struct {
		AssetID   string `json:"asset_id"`
		SortOrder int    `json:"sort_order"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	assetID, err := uuid.Parse(input.AssetID)
	if err != nil {
		http.Error(w, `{"error":"invalid asset_id"}`, http.StatusBadRequest)
		return
	}

	if err := h.gallerySvc.AddAsset(r.Context(), galleryID, assetID, input.SortOrder); err != nil {
		http.Error(w, `{"error":"add asset failed"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
}

// RemoveAsset handles DELETE /api/v1/galleries/{id}/assets/{assetId}
func (h *GalleryHandler) RemoveAsset(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}
	assetID, err := uuid.Parse(chi.URLParam(r, "assetId"))
	if err != nil {
		http.Error(w, `{"error":"invalid asset id"}`, http.StatusBadRequest)
		return
	}

	if err := h.gallerySvc.RemoveAsset(r.Context(), galleryID, assetID); err != nil {
		http.Error(w, `{"error":"remove asset failed"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// ListAssets handles GET /api/v1/galleries/{id}/assets
func (h *GalleryHandler) ListAssets(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	assets, err := h.gallerySvc.ListAssets(r.Context(), galleryID)
	if err != nil {
		http.Error(w, `{"error":"list failed"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusOK, assets)
}
