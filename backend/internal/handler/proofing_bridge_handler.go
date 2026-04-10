package handler

// proofing_bridge_handler.go — M14 GAL-FR-159: proofing-to-fulfillment bridge HTTP.
//
// Studio-only endpoint. Mounted under the JWT-protected group so only
// the authenticated workspace can trigger conversion of a client's
// selections into a pending gallery order.

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/service"
)

// ProofingBridgeHandler handles POST /galleries/{id}/proofing/bridge
type ProofingBridgeHandler struct {
	bridge *service.ProofingFulfillmentBridge
}

// NewProofingBridgeHandler constructs a ProofingBridgeHandler.
func NewProofingBridgeHandler(bridge *service.ProofingFulfillmentBridge) *ProofingBridgeHandler {
	return &ProofingBridgeHandler{bridge: bridge}
}

// BridgeSelections handles POST /galleries/{id}/proofing/bridge
func (h *ProofingBridgeHandler) BridgeSelections(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid_gallery_id", "invalid gallery id")
		return
	}
	var body struct {
		ClientName  string `json:"client_name"`
		ClientEmail string `json:"client_email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respondError(w, http.StatusBadRequest, "invalid_json", "invalid json body")
		return
	}

	wsIDStr := middleware.WorkspaceIDFromContext(r.Context())
	wsID, _ := uuid.Parse(wsIDStr)

	order, err := h.bridge.BridgeSelections(r.Context(), service.BridgeInput{
		GalleryID:   galleryID,
		WorkspaceID: wsID,
		ClientName:  body.ClientName,
		ClientEmail: body.ClientEmail,
	})
	if err != nil {
		switch {
		case errors.Is(err, service.ErrBridgeMissingEmail):
			respondError(w, http.StatusBadRequest, "missing_email", err.Error())
		case errors.Is(err, service.ErrBridgeNoSelections):
			respondError(w, http.StatusNotFound, "no_selections", err.Error())
		default:
			respondError(w, http.StatusInternalServerError, "bridge_failed", err.Error())
		}
		return
	}
	respondJSON(w, http.StatusCreated, order)
}
