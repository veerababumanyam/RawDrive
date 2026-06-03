package onboarding

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/rawdrive/backend/internal/middleware"
)

// ──────────────────────────── Request / Response Types ────────────────────────────

// StateSelectionRequest accepts state_id as either a JSON number
// (preferred: the canonical id from /api/v1/states) or a JSON string
// (legacy: 2-letter code, ISO code, or state name). json.RawMessage
// lets us inspect the raw bytes and forward them to the service-layer
// resolver without locking into one type. The resolver normalizes.
type StateSelectionRequest struct {
	StateID  json.RawMessage `json:"state_id"`
	District string          `json:"district,omitempty"`
}

type ProfileRequest struct {
	BusinessName string `json:"business_name"`
	GSTIN        string `json:"gstin"`
	DisplayName  string `json:"display_name"`
	Phone        string `json:"phone,omitempty"`
	Plan         string `json:"plan,omitempty"`
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

	// Normalize the raw state_id into a plain string for the service-
	// layer resolver. JSON numbers arrive as `14`, JSON strings as
	// `"MH"`. Stripping surrounding quotes on the raw bytes handles
	// both without a type switch: `14` → "14", `"MH"` → "MH".
	raw := strings.Trim(strings.TrimSpace(string(req.StateID)), `"`)
	if raw == "" || raw == "null" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid state"})
		return
	}

	err := h.svc.SelectState(r.Context(), userID, StateSelectionInput{StateID: raw, District: req.District})
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

	// Paid plans are not applied directly at workspace creation — the user
	// must complete payment via the upgrade flow before gaining paid-tier
	// access. We record the intended plan, create the workspace as "free",
	// and return intended_plan so the client can redirect to the payment flow.
	intendedPlan := req.Plan
	workspacePlan := req.Plan
	if workspacePlan != "free" && workspacePlan != "" {
		workspacePlan = "free"
	}

	err := h.svc.SetProfile(r.Context(), userID, ProfileInput{
		BusinessName: req.BusinessName,
		GSTIN:        req.GSTIN,
		DisplayName:  req.DisplayName,
		Phone:        req.Phone,
		PlanTier:     workspacePlan,
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
		if errors.Is(err, ErrWorkspaceCreateFail) {
			// Workspace creation failed — the onboarding step did NOT
			// advance, so the client can safely retry. We return 503
			// (Service Unavailable) rather than 500 to hint at the
			// retryable nature: the user's form data validated fine,
			// but a downstream dependency blocked completion.
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{
				"error": "could not create workspace, please try again",
			})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
		return
	}

	resp := map[string]string{"message": "profile updated"}
	if intendedPlan != "" && intendedPlan != "free" {
		resp["intended_plan"] = intendedPlan
	}
	writeJSON(w, http.StatusOK, resp)
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
