package handler

import (
	"encoding/json"
	"io"
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

// UpdateDesign handles PUT /api/v1/galleries/{id}/design.
//
// 2026-05-18: Switched from strongly-typed decode into GalleryDesignConfig
// to a raw map[string]interface{} passthrough. The typed-decode approach
// was a recurring footgun: every new field the frontend added
// (titlePosition, subtitlePosition, textColor, titleColor, etc.) had to
// be paired with a Go struct addition + backend restart, otherwise the
// JSON decoder silently dropped the unknown fields and the round-trip
// lost the data. Users hit this three separate times in the same fix
// session for: titlePosition reset to default, title/subtitle colors
// reset to white, custom textShadow toggle reset.
//
// Now the handler reads the body as a generic map, increments `version`
// in-place, and hands it directly to the service which writes it to
// gallery.settings.design_config as-is. Schema evolution is one-sided:
// frontend can add fields without any Go change.
//
// The typed struct still exists and is used on the READ path
// (GetDesignConfig) — the typed parse is lenient with unknown fields
// because Go's default decoder ignores them, so unknown fields stored
// on disk simply don't materialise into typed fields. They DO come
// through GetGallery's generic settings map though, which is what the
// frontend uses (cover/page.tsx reads gallery.settings.design_config
// directly without going through the typed Go struct).
func (h *GalleryDesignHandler) UpdateDesign(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, `{"error":"failed to read body"}`, http.StatusBadRequest)
		return
	}

	var raw map[string]interface{}
	if err := json.Unmarshal(bodyBytes, &raw); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	if err := h.designSvc.UpdateDesignConfigRaw(r.Context(), id, raw); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"data": map[string]string{"status": "saved"}})
}
