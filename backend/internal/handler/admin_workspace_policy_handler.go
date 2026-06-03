package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/service"
)

// ─────────────────────────────────────────────────────────────────────────────
// M16 E49-S1 / E49-S2: Admin workspace upload-policy handler
//
// Exposes super-admin/admin endpoints for reading and updating a workspace's
// upload_policy_mode (the column added in migration 055). Backed by
// service.WorkspacePolicyService for caching and audit emission.
//
// Round 3 RED: skeleton implementation returning 501 Not Implemented.
// Round 3 GREEN: full read/write with payload validation and audit linkage.
//
// Routes (registered in admin_routes.go inside the /api/v1/admin group):
//   GET /api/v1/admin/workspaces/{id}/upload-policy
//   PUT /api/v1/admin/workspaces/{id}/upload-policy
// ─────────────────────────────────────────────────────────────────────────────

// AdminWorkspacePolicyHandler exposes admin CRUD over workspace upload policy.
type AdminWorkspacePolicyHandler struct {
	policySvc *service.WorkspacePolicyService
}

// NewAdminWorkspacePolicyHandler constructs the handler. Pass a nil policy
// service in tests that only exercise route registration / middleware.
func NewAdminWorkspacePolicyHandler(policySvc *service.WorkspacePolicyService) *AdminWorkspacePolicyHandler {
	return &AdminWorkspacePolicyHandler{policySvc: policySvc}
}

// SetWorkspacePolicyRequest is the JSON body shape for PUT.
type SetWorkspacePolicyRequest struct {
	Mode string `json:"mode"`
}

// WorkspacePolicyResponse is the JSON body shape for GET / PUT response.
type WorkspacePolicyResponse struct {
	WorkspaceID string `json:"workspace_id"`
	Mode        string `json:"mode"`
}

// GetWorkspacePolicy returns the configured policy mode for a workspace.
//
// Round 3 RED: returns 501. Round 3 GREEN: real read.
func (h *AdminWorkspacePolicyHandler) GetWorkspacePolicy(w http.ResponseWriter, r *http.Request) {
	// Round 3 RED skeleton — proper implementation lands in GREEN.
	if h.policySvc == nil {
		writeJSONError(w, http.StatusNotImplemented, "SCAN_POLICY_HANDLER_NOT_WIRED",
			"workspace policy service not wired (Round 3 GREEN)")
		return
	}

	wsIDRaw := chi.URLParam(r, "id")
	wsID, err := uuid.Parse(wsIDRaw)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "INVALID_WORKSPACE_ID", "workspace id is not a valid UUID")
		return
	}

	mode, err := h.policySvc.Get(r.Context(), wsID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "POLICY_LOOKUP_FAILED", err.Error())
		return
	}

	writeJSON(w, http.StatusOK, WorkspacePolicyResponse{
		WorkspaceID: wsID.String(),
		Mode:        string(mode),
	})
}

// SetWorkspacePolicy updates the configured policy mode for a workspace and
// emits an audit event with before/after state. Restricted to platform admins.
//
// Round 3 RED: returns 501. Round 3 GREEN: real write + audit.
func (h *AdminWorkspacePolicyHandler) SetWorkspacePolicy(w http.ResponseWriter, r *http.Request) {
	// Round 3 RED skeleton — proper implementation lands in GREEN.
	if h.policySvc == nil {
		writeJSONError(w, http.StatusNotImplemented, "SCAN_POLICY_HANDLER_NOT_WIRED",
			"workspace policy service not wired (Round 3 GREEN)")
		return
	}

	wsIDRaw := chi.URLParam(r, "id")
	wsID, err := uuid.Parse(wsIDRaw)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "INVALID_WORKSPACE_ID", "workspace id is not a valid UUID")
		return
	}

	var req SetWorkspacePolicyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "INVALID_BODY", "request body is not valid JSON")
		return
	}

	if !service.IsValidPolicyMode(req.Mode) {
		writeJSONError(w, http.StatusBadRequest, "INVALID_POLICY_MODE",
			"mode must be one of: standard, strict_client_scan, strict_original_preservation")
		return
	}

	// M16-BUG-04 fix: read the real super_admin/admin UUID from JWT claims
	// instead of the placeholder actorIDFromContext() helper which always
	// returned uuid.Nil. The audit log entry's actor_id needs the real UUID
	// otherwise the workspace.policy.changed audit row would be anonymous
	// (and may violate FK constraints on audit_logs.actor_id in some
	// schemas).
	actorID := adminActorID(r)
	if actorID == uuid.Nil {
		writeJSONError(w, http.StatusUnauthorized, "MISSING_ACTOR_ID", "unable to resolve admin actor id from JWT claims")
		return
	}

	if err := h.policySvc.Set(r.Context(), wsID, service.PolicyMode(req.Mode), actorID); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "POLICY_WRITE_FAILED", err.Error())
		return
	}

	writeJSON(w, http.StatusOK, WorkspacePolicyResponse{
		WorkspaceID: wsID.String(),
		Mode:        req.Mode,
	})
}

// writeJSON serializes payload and writes the response with the given status.
// Defined here so the file is self-contained for review; if duplicates already
// exist in another handler file the linter will flag them in Step 04.
func writeJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

// writeJSONError writes a structured error response.
func writeJSONError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]string{
		"error":   code,
		"message": message,
	})
}
