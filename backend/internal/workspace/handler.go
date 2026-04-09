package workspace

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/rawdrive/backend/internal/middleware"
)

// ──────────────────────────── Request / Response Types ────────────────────────────

type CreateWorkspaceRequest struct {
	Name         string `json:"name"`
	BusinessName string `json:"business_name"`
}

type WorkspaceResponse struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	StateID      string `json:"state_id"`
	OwnerID      string `json:"owner_id"`
	BusinessName string `json:"business_name"`
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
	r.Post("/", h.Create)
	r.Get("/{id}", h.GetByID)
	return r
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	claims := jwtClaimsFromContext(r.Context())
	if claims == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
		return
	}

	userID, _ := claims["sub"].(string)
	stateID, _ := claims["state_id"].(string)

	var req CreateWorkspaceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	ws, err := h.svc.Create(r.Context(), CreateWorkspaceInput{
		Name:         req.Name,
		StateID:      stateID,
		OwnerID:      userID,
		BusinessName: req.BusinessName,
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create workspace"})
		return
	}

	writeJSON(w, http.StatusCreated, WorkspaceResponse{
		ID:           ws.ID,
		Name:         ws.Name,
		StateID:      ws.StateID,
		OwnerID:      ws.OwnerID,
		BusinessName: ws.BusinessName,
	})
}

func (h *Handler) GetByID(w http.ResponseWriter, r *http.Request) {
	claims := jwtClaimsFromContext(r.Context())
	if claims == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
		return
	}

	wsID := chi.URLParam(r, "id")

	// Cross-tenant protection: check if the JWT's workspace_id matches
	claimsWS, _ := claims["workspace_id"].(string)
	if claimsWS != "" && claimsWS != wsID {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "access denied"})
		return
	}

	ws, err := h.svc.GetByID(r.Context(), wsID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "workspace not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
		return
	}

	writeJSON(w, http.StatusOK, WorkspaceResponse{
		ID:           ws.ID,
		Name:         ws.Name,
		StateID:      ws.StateID,
		OwnerID:      ws.OwnerID,
		BusinessName: ws.BusinessName,
	})
}

// ──────────────────────────── Context Helpers ────────────────────────────

func jwtClaimsFromContext(ctx context.Context) map[string]interface{} {
	return middleware.JWTClaimsFromContext(ctx)
}

// WithJWTClaims sets JWT claims into context (for testing).
func WithJWTClaims(ctx context.Context, claims map[string]interface{}) context.Context {
	return middleware.WithJWTClaims(ctx, claims)
}

// ──────────────────────────── Helpers ────────────────────────────

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
