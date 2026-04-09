package handler

import (
	"encoding/json"
	"net/http"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

// BulkAssetHandler handles bulk asset operations.
type BulkAssetHandler struct {
	assetRepo *repository.AssetRepo
}

// NewBulkAssetHandler creates a new BulkAssetHandler.
func NewBulkAssetHandler(ar *repository.AssetRepo) *BulkAssetHandler {
	return &BulkAssetHandler{assetRepo: ar}
}

// BulkAction handles POST /api/v1/assets/bulk
func (h *BulkAssetHandler) BulkAction(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}

	var input struct {
		Action    string   `json:"action"`
		AssetIDs  []string `json:"asset_ids"`
		TargetID  string   `json:"target_id,omitempty"`
		NewStatus string   `json:"new_status,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}
	if len(input.AssetIDs) == 0 {
		http.Error(w, `{"error":"asset_ids required"}`, http.StatusBadRequest)
		return
	}

	ids := make([]uuid.UUID, 0, len(input.AssetIDs))
	for _, s := range input.AssetIDs {
		id, err := uuid.Parse(s)
		if err != nil {
			http.Error(w, `{"error":"invalid asset_id: `+s+`"}`, http.StatusBadRequest)
			return
		}
		ids = append(ids, id)
	}

	var affected int64
	var err error

	switch input.Action {
	case "update_status":
		if input.NewStatus == "" {
			http.Error(w, `{"error":"new_status required for update_status action"}`, http.StatusBadRequest)
			return
		}
		affected, err = h.assetRepo.BulkUpdateStatus(r.Context(), ids, input.NewStatus, workspaceID)
	case "move":
		if input.TargetID == "" {
			http.Error(w, `{"error":"target_id required for move action"}`, http.StatusBadRequest)
			return
		}
		fromGalleryStr := r.URL.Query().Get("from_gallery_id")
		if fromGalleryStr == "" {
			http.Error(w, `{"error":"from_gallery_id query param required for move action"}`, http.StatusBadRequest)
			return
		}
		fromID, fromErr := uuid.Parse(fromGalleryStr)
		if fromErr != nil {
			http.Error(w, `{"error":"invalid from_gallery_id"}`, http.StatusBadRequest)
			return
		}
		toID, parseErr := uuid.Parse(input.TargetID)
		if parseErr != nil {
			http.Error(w, `{"error":"invalid target_id"}`, http.StatusBadRequest)
			return
		}
		_ = workspaceID // TODO: pass workspace scoping to BulkMoveToGallery when repo supports it
		err = h.assetRepo.BulkMoveToGallery(r.Context(), ids, fromID, toID)
		if err == nil {
			affected = int64(len(ids))
		}
	case "delete":
		affected, err = h.assetRepo.BulkUpdateStatus(r.Context(), ids, "deleted", workspaceID)
	default:
		http.Error(w, `{"error":"unknown action, expected: update_status, move, delete"}`, http.StatusBadRequest)
		return
	}

	if err != nil {
		http.Error(w, `{"error":"bulk operation failed"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data": map[string]interface{}{
			"action":   input.Action,
			"affected": affected,
		},
	})
}
