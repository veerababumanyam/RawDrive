package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/service"
)

// VideoHandler handles video asset HTTP endpoints.
type VideoHandler struct {
	svc *service.VideoService
}

// NewVideoHandler creates a new VideoHandler.
func NewVideoHandler(svc *service.VideoService) *VideoHandler {
	return &VideoHandler{svc: svc}
}

// Create handles POST /api/v1/videos
func (h *VideoHandler) Create(w http.ResponseWriter, r *http.Request) {
	wsID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"workspace context required"}`, http.StatusBadRequest)
		return
	}

	var req struct {
		AssetID       string  `json:"asset_id"`
		FileSizeBytes *int64  `json:"file_size_bytes"`
		Codec         *string `json:"codec"`
		Resolution    *string `json:"resolution"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	assetID, err := uuid.Parse(req.AssetID)
	if err != nil {
		http.Error(w, `{"error":"invalid asset_id"}`, http.StatusBadRequest)
		return
	}

	video, err := h.svc.CreateVideoAsset(r.Context(), service.CreateVideoInput{
		AssetID:       assetID,
		WorkspaceID:   wsID,
		FileSizeBytes: req.FileSizeBytes,
		Codec:         req.Codec,
		Resolution:    req.Resolution,
	})
	if err != nil {
		http.Error(w, `{"error":"failed to create video asset"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusCreated, video)
}

// Get handles GET /api/v1/videos/{id}
func (h *VideoHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid video id"}`, http.StatusBadRequest)
		return
	}
	video, err := h.svc.GetVideoAsset(r.Context(), id)
	if err != nil {
		http.Error(w, `{"error":"video not found"}`, http.StatusNotFound)
		return
	}
	respondJSON(w, http.StatusOK, video)
}

// GetByAsset handles GET /api/v1/videos/by-asset/{assetId}
func (h *VideoHandler) GetByAsset(w http.ResponseWriter, r *http.Request) {
	assetID, err := uuid.Parse(chi.URLParam(r, "assetId"))
	if err != nil {
		http.Error(w, `{"error":"invalid asset id"}`, http.StatusBadRequest)
		return
	}
	video, err := h.svc.GetVideoByAssetID(r.Context(), assetID)
	if err != nil {
		http.Error(w, `{"error":"video not found for asset"}`, http.StatusNotFound)
		return
	}
	respondJSON(w, http.StatusOK, video)
}

// List handles GET /api/v1/videos
func (h *VideoHandler) List(w http.ResponseWriter, r *http.Request) {
	wsID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"workspace context required"}`, http.StatusBadRequest)
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

	videos, err := h.svc.ListWorkspaceVideos(r.Context(), wsID, limit, offset)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, videos)
}

// Delete handles DELETE /api/v1/videos/{id}
func (h *VideoHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid video id"}`, http.StatusBadRequest)
		return
	}
	if err := h.svc.DeleteVideoAsset(r.Context(), id); err != nil {
		http.Error(w, `{"error":"failed to delete video"}`, http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// TranscodingStatus handles GET /api/v1/videos/{id}/status
func (h *VideoHandler) TranscodingStatus(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid video id"}`, http.StatusBadRequest)
		return
	}
	video, err := h.svc.GetVideoAsset(r.Context(), id)
	if err != nil {
		http.Error(w, `{"error":"video not found"}`, http.StatusNotFound)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{
		"id":        video.ID,
		"status":    video.Status,
		"qualities": video.Qualities,
		"error":     video.ErrorMessage,
	})
}
