package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/service"
)

// ProofingHandler handles proofing HTTP requests.
type ProofingHandler struct {
	proofingSvc *service.ProofingService
}

func NewProofingHandler(svc *service.ProofingService) *ProofingHandler {
	return &ProofingHandler{proofingSvc: svc}
}

func (h *ProofingHandler) ListByGallery(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	selections, err := h.proofingSvc.ListByGallery(r.Context(), galleryID)
	if err != nil {
		http.Error(w, `{"error":"list failed"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusOK, selections)
}

func (h *ProofingHandler) UpdateStatus(w http.ResponseWriter, r *http.Request) {
	selectionID, err := uuid.Parse(chi.URLParam(r, "selectionId"))
	if err != nil {
		http.Error(w, `{"error":"invalid selection id"}`, http.StatusBadRequest)
		return
	}

	var input struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	if err := h.proofingSvc.UpdateStatus(r.Context(), selectionID, input.Status); err != nil {
		http.Error(w, `{"error":"update failed"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (h *ProofingHandler) SubmitPublic(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	if slug == "" {
		http.Error(w, `{"error":"missing slug"}`, http.StatusBadRequest)
		return
	}

	var input struct {
		AssetIDs    []string `json:"asset_ids"`
		ClientName  string   `json:"client_name"`
		ClientEmail string   `json:"client_email"`
		Note        string   `json:"note"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	// TODO: resolve gallery from slug, validate share link access
	// For now, return not implemented
	http.Error(w, `{"error":"not implemented - requires gallery slug resolution"}`, http.StatusNotImplemented)
}
