package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

// LeadEmbedHandler handles public lead capture form submissions (no auth required).
type LeadEmbedHandler struct {
	repo *repository.LeadRepo
}

func NewLeadEmbedHandler(repo *repository.LeadRepo) *LeadEmbedHandler {
	return &LeadEmbedHandler{repo: repo}
}

// Submit handles POST /api/v1/public/leads/{workspaceId}
// Public endpoint for embeddable lead capture forms on external websites.
func (h *LeadEmbedHandler) Submit(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	wsID, err := uuid.Parse(chi.URLParam(r, "workspaceId"))
	if err != nil {
		http.Error(w, `{"error":"invalid workspace id"}`, http.StatusBadRequest)
		return
	}

	var lead repository.Lead
	if err := json.NewDecoder(r.Body).Decode(&lead); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	lead.WorkspaceID = wsID
	lead.Stage = "new"
	if lead.Source == "" {
		lead.Source = "website"
	}
	if lead.Name == "" {
		http.Error(w, `{"error":"name is required"}`, http.StatusBadRequest)
		return
	}

	if err := h.repo.Create(r.Context(), &lead); err != nil {
		http.Error(w, `{"error":"failed to capture lead"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusCreated, map[string]string{
		"status":  "captured",
		"lead_id": lead.ID.String(),
	})
}
