package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/service"
)

// GalleryDesignHandler handles gallery design studio API endpoints.
type GalleryDesignHandler struct {
	designSvc *service.GalleryDesignService
}

// NewGalleryDesignHandler creates a new GalleryDesignHandler.
func NewGalleryDesignHandler(svc *service.GalleryDesignService) *GalleryDesignHandler {
	return &GalleryDesignHandler{designSvc: svc}
}

// GetDesign handles GET /api/v1/galleries/{id}/design
func (h *GalleryDesignHandler) GetDesign(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	config, err := h.designSvc.GetDesignConfig(r.Context(), id)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"data": config})
}

// UpdateDesign handles PUT /api/v1/galleries/{id}/design
func (h *GalleryDesignHandler) UpdateDesign(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	var config service.GalleryDesignConfig
	if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	if err := h.designSvc.UpdateDesignConfig(r.Context(), id, config); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"data": map[string]string{"status": "saved"}})
}
