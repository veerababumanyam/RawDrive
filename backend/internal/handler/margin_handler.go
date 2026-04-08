package handler

import (
	"encoding/json"
	"net/http"

	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

type MarginHandler struct {
	svc *service.MarginService
}

func NewMarginHandler(svc *service.MarginService) *MarginHandler {
	return &MarginHandler{svc: svc}
}

func (h *MarginHandler) Configure(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	var m repository.MarginRatio
	if err := json.NewDecoder(r.Body).Decode(&m); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	m.CreatedBy = userID
	if err := h.svc.ConfigureMargin(r.Context(), &m); err != nil {
		switch err {
		case service.ErrInvalidMarginSum:
			http.Error(w, `{"error":"dealer_pct + platform_pct must equal 100"}`, http.StatusBadRequest)
		case service.ErrRetroactiveDate:
			http.Error(w, `{"error":"effective_from must be today or in the future"}`, http.StatusBadRequest)
		default:
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		}
		return
	}
	respondJSON(w, http.StatusOK, m)
}

func (h *MarginHandler) ListMargins(w http.ResponseWriter, r *http.Request) {
	ratios, err := h.svc.ListCurrentMargins(r.Context(), nil)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, ratios)
}

func (h *MarginHandler) GetHistory(w http.ResponseWriter, r *http.Request) {
	// Return all margin ratios (including expired ones) ordered by created_at DESC — full version history
	ratios, err := h.svc.ListAllMargins(r.Context(), nil)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"data": ratios, "total": len(ratios)})
}
