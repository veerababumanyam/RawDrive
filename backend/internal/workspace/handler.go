package workspace

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/rawdrive/backend/internal/middleware"
)

// SentinelPendingOnboarding is the JWT claim value carried by a session
// whose user has not yet completed onboarding (no workspace, no state).
// It is intentionally non-numeric so it can never be coerced into the
// INTEGER workspaces.state_id column. State-gated paths must reject it.
const SentinelPendingOnboarding = "pending-onboarding"

// defaultWorkspaceQuotaBytes is the storage quota granted to a workspace
// created through the self-serve POST /workspace path. This path does not
// carry a plan tier, so it gets the free-tier default (1 GiB), matching
// service.PlanDefaultQuotaBytes("free"). It is duplicated here rather than
// imported to avoid an import cycle (internal/service imports nothing from
// workspace today, but the workspace package must not depend on service).
const defaultWorkspaceQuotaBytes int64 = 1 << 30

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

	// AREA-CUSTOMER-2 (audit 2026-05-31): the state_id claim is a string
	// but workspaces.state_id is an INTEGER column. An un-onboarded session
	// carries the "pending-onboarding" sentinel (and any non-numeric value
	// would garbage the INT column / fail the insert). Reject anything that
	// is not a positive integer with 400 BEFORE touching the DB, so a
	// pending-onboarding session can never corrupt a workspace row here.
	if stateID == SentinelPendingOnboarding {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "complete onboarding before creating a workspace"})
		return
	}
	if n, err := strconv.Atoi(stateID); err != nil || n <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid state"})
		return
	}

	var req CreateWorkspaceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	// AREA-CUSTOMER-1 (audit 2026-05-31): route through the single canonical
	// atomic co-creation so this path can NEVER produce a workspace without
	// its Owner membership + storage quota rows. Previously this path only
	// created the workspace + bucket, violating the lifecycle invariant.
	// No plan tier flows through self-serve creation, so the free-tier
	// default quota applies.
	ws, err := h.svc.CreateWithBootstrap(r.Context(), CreateWorkspaceInput{
		Name:         req.Name,
		StateID:      stateID,
		OwnerID:      userID,
		BusinessName: req.BusinessName,
	}, defaultWorkspaceQuotaBytes)
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
