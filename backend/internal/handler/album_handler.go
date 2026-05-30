package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/service"
)

// AlbumHandler handles album HTTP requests.
type AlbumHandler struct {
	albumSvc *service.AlbumService
}

// NewAlbumHandler creates a new AlbumHandler.
func NewAlbumHandler(svc *service.AlbumService) *AlbumHandler {
	return &AlbumHandler{albumSvc: svc}
}

// Create handles POST /api/v1/galleries/{galleryId}/albums
func (h *AlbumHandler) Create(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "galleryId"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery_id"}`, http.StatusBadRequest)
		return
	}

	var input struct {
		Name        string  `json:"name"`
		Description string  `json:"description"`
		ParentID    *string `json:"parent_id,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	createInput := service.CreateAlbumInput{
		GalleryID:   galleryID,
		Name:        input.Name,
		Description: input.Description,
	}
	if input.ParentID != nil {
		pid, err := uuid.Parse(*input.ParentID)
		if err == nil {
			createInput.ParentID = &pid
		}
	}

	album, err := h.albumSvc.Create(r.Context(), createInput)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{"data": album})
}

// List handles GET /api/v1/galleries/{galleryId}/albums
func (h *AlbumHandler) List(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "galleryId"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery_id"}`, http.StatusBadRequest)
		return
	}

	albums, err := h.albumSvc.ListByGallery(r.Context(), galleryID)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	// F-091: with ?include_asset_ids=true the client gets each album's membership
	// inline (one batched request) instead of one ListAssets call per album.
	// Without the flag the response is byte-for-byte the historical shape.
	if r.URL.Query().Get("include_asset_ids") == "true" {
		idsByAlbum, err := h.albumSvc.ListAssetIDsByGallery(r.Context(), galleryID)
		if err != nil {
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
			return
		}
		out := make([]map[string]interface{}, 0, len(albums))
		for _, al := range albums {
			b, mErr := json.Marshal(al)
			if mErr != nil {
				http.Error(w, `{"error":"encode album failed"}`, http.StatusInternalServerError)
				return
			}
			m := map[string]interface{}{}
			_ = json.Unmarshal(b, &m)
			ids := idsByAlbum[al.ID]
			if ids == nil {
				ids = []uuid.UUID{}
			}
			m["asset_ids"] = ids
			out = append(out, m)
		}
		json.NewEncoder(w).Encode(map[string]interface{}{"data": out})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{"data": albums})
}

// GetByID handles GET /api/v1/albums/{id}
func (h *AlbumHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}

	album, err := h.albumSvc.GetByID(r.Context(), id)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}
	if album == nil {
		http.Error(w, `{"error":"album not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"data": album})
}

// Breadcrumb handles GET /api/v1/albums/{id}/breadcrumb
func (h *AlbumHandler) Breadcrumb(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}

	chain, err := h.albumSvc.GetBreadcrumb(r.Context(), id)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"data": chain})
}

// ListAssets handles GET /api/v1/albums/{id}/assets.
func (h *AlbumHandler) ListAssets(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}

	assets, err := h.albumSvc.ListAssets(r.Context(), id)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"data": assets})
}

// AddAssets handles POST /api/v1/albums/{id}/assets.
func (h *AlbumHandler) AddAssets(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}

	var input struct {
		AssetID  string   `json:"asset_id"`
		AssetIDs []string `json:"asset_ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	rawIDs := input.AssetIDs
	if input.AssetID != "" {
		rawIDs = append(rawIDs, input.AssetID)
	}
	if len(rawIDs) == 0 {
		http.Error(w, `{"error":"asset_id or asset_ids required"}`, http.StatusBadRequest)
		return
	}

	added := 0
	for i, rawID := range rawIDs {
		assetID, err := uuid.Parse(rawID)
		if err != nil {
			http.Error(w, `{"error":"invalid asset id"}`, http.StatusBadRequest)
			return
		}
		if err := h.albumSvc.AddAsset(r.Context(), id, assetID, i); err != nil {
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
			return
		}
		added++
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"added": added})
}

// Delete handles DELETE /api/v1/albums/{id}
func (h *AlbumHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}

	if err := h.albumSvc.Delete(r.Context(), id); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
