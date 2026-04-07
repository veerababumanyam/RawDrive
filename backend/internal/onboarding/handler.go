package onboarding

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
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

type contextKey string

const userIDKey contextKey = "user_id"

// UserIDFromRequest extracts user_id from JWT claims in context.
// Expects middleware to set map[string]interface{} with "sub" key.
func UserIDFromRequest(r *http.Request) string {
	// Try direct context value first (for handler tests)
	if v, ok := r.Context().Value(userIDKey).(string); ok && v != "" {
		return v
	}
	// Try plain string key (for cross-package test injection)
	if v, ok := r.Context().Value("user_id").(string); ok && v != "" {
		return v
	}
	// Try JWT claims map (from middleware)
	if claims, ok := r.Context().Value(jwtClaimsKey).(map[string]interface{}); ok {
		if sub, ok := claims["sub"].(string); ok {
			return sub
		}
	}
	// Try any type of "jwt_claims" key
	if claims, ok := r.Context().Value("jwt_claims").(map[string]interface{}); ok {
		if sub, ok := claims["sub"].(string); ok {
			return sub
		}
	}
	return ""
}

type jwtContextKey string

const jwtClaimsKey jwtContextKey = "jwt_claims"

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
