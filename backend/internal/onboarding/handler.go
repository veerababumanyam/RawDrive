package onboarding

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/rawdrive/backend/internal/middleware"
)

// ──────────────────────────── Request / Response Types ────────────────────────────

type StateSelectionRequest struct {
	StateID string `json:"state_id"`
}

type ProfileRequest struct {
	BusinessName string `json:"business_name"`
	GSTIN        string `json:"gstin"`
	DisplayName  string `json:"display_name"`
}

// ──────────────────────────── Context helpers ────────────────────────────

// UserIDFromRequest extracts user_id from JWT claims set by middleware.JWTAuth.
func UserIDFromRequest(r *http.Request) string {
	claims := middleware.JWTClaimsFromContext(r.Context())
	if claims != nil {
		if sub, ok := claims["sub"].(string); ok {
			return sub
		}
	}
	return ""
}

// ──────────────────────────── Handler ────────────────────────────

type Handler struct {
	svc Service
}

func NewHandler(svc Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/state", h.SelectState)
	r.Post("/profile", h.SetProfile)
	r.Get("/status", h.GetStatus)
	return r
}

func (h *Handler) SelectState(w http.ResponseWriter, r *http.Request) {
	userID := UserIDFromRequest(r)
	if userID == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
		return
	}

	var req StateSelectionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	err := h.svc.SelectState(r.Context(), userID, StateSelectionInput{StateID: req.StateID})
	if err != nil {
		if errors.Is(err, ErrInvalidState) {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid state"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "state selected"})
}

func (h *Handler) SetProfile(w http.ResponseWriter, r *http.Request) {
	userID := UserIDFromRequest(r)
	if userID == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
		return
	}

	var req ProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	err := h.svc.SetProfile(r.Context(), userID, ProfileInput{
		BusinessName: req.BusinessName,
		GSTIN:        req.GSTIN,
		DisplayName:  req.DisplayName,
	})
	if err != nil {
		if errors.Is(err, ErrInvalidGSTIN) {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid GSTIN"})
			return
		}
		if errors.Is(err, ErrStepRequired) {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "previous step required"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "profile updated"})
}

func (h *Handler) GetStatus(w http.ResponseWriter, r *http.Request) {
	userID := UserIDFromRequest(r)
	if userID == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
		return
	}

	status, err := h.svc.GetStatus(r.Context(), userID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
		return
	}

	writeJSON(w, http.StatusOK, status)
}

// ──────────────────────────── Helpers ────────────────────────────

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
