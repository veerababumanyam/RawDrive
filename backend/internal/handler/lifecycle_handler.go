package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/service"
)

// LifecycleHandler handles asset lifecycle state transitions.
type LifecycleHandler struct {
	lifecycleSvc *service.AssetLifecycleService
}

// NewLifecycleHandler creates a new LifecycleHandler.
func NewLifecycleHandler(svc *service.AssetLifecycleService) *LifecycleHandler {
	return &LifecycleHandler{lifecycleSvc: svc}
}

// Transition handles POST /api/v1/assets/{id}/lifecycle
func (h *LifecycleHandler) Transition(w http.ResponseWriter, r *http.Request) {
	assetID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid asset id"}`, http.StatusBadRequest)
		return
	}

	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}

	var input struct {
		TargetState string `json:"target_state"`
		Reason      string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}
	if input.TargetState == "" {
		http.Error(w, `{"error":"target_state required"}`, http.StatusBadRequest)
		return
	}

	err = h.lifecycleSvc.Transition(r.Context(), service.TransitionInput{
		AssetID:     assetID,
		WorkspaceID: workspaceID,
		TargetState: service.LifecycleState(input.TargetState),
		Reason:      input.Reason,
	})
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data": map[string]interface{}{
			"asset_id":  assetID,
			"new_state": input.TargetState,
		},
	})
}
