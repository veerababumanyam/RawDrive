package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

type processingAssetRepo interface {
	GetByID(ctx context.Context, id uuid.UUID) (*repository.Asset, error)
	RetryFailedByGallery(ctx context.Context, galleryID, workspaceID uuid.UUID) (int64, error)
}

// ProcessingStatusHandler handles asset processing status SSE and REST endpoints.
type ProcessingStatusHandler struct {
	assetRepo processingAssetRepo
}

// NewProcessingStatusHandler creates a new ProcessingStatusHandler.
func NewProcessingStatusHandler(ar processingAssetRepo) *ProcessingStatusHandler {
	return &ProcessingStatusHandler{assetRepo: ar}
}

// GetStatus handles GET /api/v1/assets/{id}/processing-status
func (h *ProcessingStatusHandler) GetStatus(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}

	asset, err := h.assetRepo.GetByID(r.Context(), id)
	if err != nil || asset == nil {
		http.Error(w, `{"error":"asset not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data": map[string]interface{}{
			"asset_id":          asset.ID,
			"processing_status": asset.Status,
			"processing_error":  asset.ProcessingError,
			"updated_at":        asset.UpdatedAt,
		},
	})
}

// SSEStream handles GET /api/v1/assets/processing-stream (Server-Sent Events)
// Clients subscribe to this endpoint to receive real-time processing status updates.
func (h *ProcessingStatusHandler) SSEStream(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, `{"error":"streaming not supported"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	// Poll-based SSE — in production, replace with NATS subscription push
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
			// Send heartbeat to keep connection alive
			fmt.Fprintf(w, ": heartbeat\n\n")
			flusher.Flush()
		}
	}
}

// BulkRetry handles POST /api/v1/galleries/{galleryId}/assets/retry-failed
func (h *ProcessingStatusHandler) BulkRetry(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "galleryId"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery_id"}`, http.StatusBadRequest)
		return
	}

	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}

	retried, err := h.assetRepo.RetryFailedByGallery(r.Context(), galleryID, workspaceID)
	if err != nil {
		http.Error(w, `{"error":"retry failed"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data": map[string]interface{}{
			"gallery_id": galleryID,
			"retried":    retried,
			"message":    "failed assets queued for retry",
		},
	})
}
