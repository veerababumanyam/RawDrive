package handler

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/google/uuid"
)

// bulkAssetRepo is the minimal surface of the asset repository that
// BulkAssetHandler uses. It exists so the handler can be tested
// without a live database. *repository.AssetRepo satisfies this
// interface implicitly.
//
// ISSUE-007 (brownfield P2): BulkMoveToGallery previously took no
// workspaceID parameter, which allowed a tenant-isolation bypass.
// The new signature makes workspace scoping a compile-time
// requirement for every caller.
type bulkAssetRepo interface {
	BulkUpdateStatus(ctx context.Context, ids []uuid.UUID, status string, workspaceID uuid.UUID) (int64, error)
	BulkMoveToGallery(ctx context.Context, ids []uuid.UUID, fromGalleryID, toGalleryID, workspaceID uuid.UUID) (int64, error)
	BulkSetRating(ctx context.Context, ids []uuid.UUID, rating int, workspaceID uuid.UUID) (int64, error)
	BulkSetColorLabel(ctx context.Context, ids []uuid.UUID, label string, workspaceID uuid.UUID) (int64, error)
	BulkAddTags(ctx context.Context, ids []uuid.UUID, tags []string, workspaceID uuid.UUID) (int64, error)
	BulkRemoveTags(ctx context.Context, ids []uuid.UUID, tags []string, workspaceID uuid.UUID) (int64, error)
}

// BulkAssetHandler handles bulk asset operations.
type BulkAssetHandler struct {
	assetRepo bulkAssetRepo
}

// NewBulkAssetHandler creates a new BulkAssetHandler. The repo
// argument is accepted as the bulkAssetRepo interface so tests can
// substitute fakes; production wiring passes *repository.AssetRepo.
func NewBulkAssetHandler(ar bulkAssetRepo) *BulkAssetHandler {
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
		Action     string   `json:"action"`
		AssetIDs   []string `json:"asset_ids"`
		TargetID   string   `json:"target_id,omitempty"`
		NewStatus  string   `json:"new_status,omitempty"`
		Rating     *int     `json:"rating,omitempty"`
		ColorLabel string   `json:"color_label,omitempty"`
		Tags       []string `json:"tags,omitempty"`
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
		// ISSUE-007: workspaceID is threaded through the repo so the
		// SQL layer can filter cross-workspace asset_ids and reject
		// from/to galleries that belong to other tenants. The handler
		// reports the repo's real RowsAffected (which may be less
		// than len(ids) when the filter drops rows) instead of the
		// previously hardcoded len(ids).
		affected, err = h.assetRepo.BulkMoveToGallery(r.Context(), ids, fromID, toID, workspaceID)
	case "delete":
		affected, err = h.assetRepo.BulkUpdateStatus(r.Context(), ids, "deleted", workspaceID)
	case "set_rating":
		if input.Rating == nil || *input.Rating < 0 || *input.Rating > 5 {
			http.Error(w, `{"error":"rating must be 0-5"}`, http.StatusBadRequest)
			return
		}
		affected, err = h.assetRepo.BulkSetRating(r.Context(), ids, *input.Rating, workspaceID)
	case "set_label":
		validLabels := map[string]bool{"": true, "red": true, "yellow": true, "green": true, "blue": true, "purple": true}
		if !validLabels[input.ColorLabel] {
			http.Error(w, `{"error":"invalid color_label"}`, http.StatusBadRequest)
			return
		}
		affected, err = h.assetRepo.BulkSetColorLabel(r.Context(), ids, input.ColorLabel, workspaceID)
	case "add_tags":
		if len(input.Tags) == 0 {
			http.Error(w, `{"error":"tags required"}`, http.StatusBadRequest)
			return
		}
		affected, err = h.assetRepo.BulkAddTags(r.Context(), ids, input.Tags, workspaceID)
	case "remove_tags":
		if len(input.Tags) == 0 {
			http.Error(w, `{"error":"tags required"}`, http.StatusBadRequest)
			return
		}
		affected, err = h.assetRepo.BulkRemoveTags(r.Context(), ids, input.Tags, workspaceID)
	default:
		http.Error(w, `{"error":"unknown action"}`, http.StatusBadRequest)
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
