package team

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/rawdrive/backend/internal/middleware"
)

// ──────────────────────────── Request / Response Types ────────────────────────────

type InviteRequest struct {
	Email       string `json:"email"`
	WorkspaceID string `json:"workspace_id"`
	Role        string `json:"role"`
}

type AcceptInviteRequest struct {
	Token string `json:"token"`
}

type MemberResponse struct {
	UserID      string `json:"user_id"`
	WorkspaceID string `json:"workspace_id"`
	Role        string `json:"role"`
}

// ──────────────────────────── Context Helpers ────────────────────────────

func jwtClaimsFromContext(ctx context.Context) map[string]interface{} {
	return middleware.JWTClaimsFromContext(ctx)
}

// ──────────────────────────── Permission Checker ────────────────────────────

type PermissionChecker interface {
	Evaluate(ctx context.Context, userID, workspaceID, resource, action string) (bool, error)
}

// WorkspaceScopedRevoker is an optional capability an InvitationService may
// implement to scope invitation revocation to a single workspace. When the
// injected service satisfies it, RevokeInvite uses the scoped path so the
// caller's workspace_id is enforced at the data layer (preventing cross-tenant
// revocation — F-061). Services that do not implement it fall back to the
// legacy unscoped RevokeInvitation, and the handler still enforces the
// workspace permission check below as defense-in-depth.
type WorkspaceScopedRevoker interface {
	RevokeInvitationInWorkspace(ctx context.Context, workspaceID, invitationID string) error
}

// MemberLister lists members for a workspace.
type MemberLister interface {
	ListMembers(workspaceID string) ([]MemberResponse, error)
}

// ──────────────────────────── Handler ────────────────────────────

type Handler struct {
	svc     InvitationService
	perm    PermissionChecker
	members MemberLister
}

func NewHandler(svc InvitationService, perm PermissionChecker, members MemberLister) *Handler {
	return &Handler{svc: svc, perm: perm, members: members}
}

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/invite", h.Invite)
	r.Post("/accept", h.AcceptInvite)
	r.Delete("/members/{id}", h.RemoveMember)
	r.Get("/members", h.ListMembers)
	r.Delete("/invites/{id}", h.RevokeInvite)
	return r
}

func (h *Handler) Invite(w http.ResponseWriter, r *http.Request) {
	claims := jwtClaimsFromContext(r.Context())
	if claims == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
		return
	}

	userID, _ := claims["sub"].(string)

	var req InviteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	// Check permission
	if h.perm != nil {
		allowed, err := h.perm.Evaluate(r.Context(), userID, req.WorkspaceID, "team", "manage")
		if err != nil || !allowed {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "permission denied"})
			return
		}
	}

	role := Role(req.Role)
	if err := h.svc.Invite(r.Context(), req.Email, req.WorkspaceID, role); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to send invitation"})
		return
	}

	writeJSON(w, http.StatusCreated, map[string]string{"message": "invitation sent"})
}

func (h *Handler) AcceptInvite(w http.ResponseWriter, r *http.Request) {
	var req AcceptInviteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	if err := h.svc.AcceptInvitation(r.Context(), req.Token); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to accept invitation"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "invitation accepted"})
}

func (h *Handler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	claims := jwtClaimsFromContext(r.Context())
	if claims == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
		return
	}

	userID, _ := claims["sub"].(string)
	wsID, _ := claims["workspace_id"].(string)
	memberID := chi.URLParam(r, "id")

	// Check permission
	if h.perm != nil {
		allowed, err := h.perm.Evaluate(r.Context(), userID, wsID, "team", "manage")
		if err != nil || !allowed {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "permission denied"})
			return
		}
	}

	if err := h.svc.RemoveMember(r.Context(), wsID, memberID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to remove member"})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) ListMembers(w http.ResponseWriter, r *http.Request) {
	claims := jwtClaimsFromContext(r.Context())
	if claims == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
		return
	}

	wsID, _ := claims["workspace_id"].(string)

	if h.members == nil {
		writeJSON(w, http.StatusOK, []MemberResponse{})
		return
	}

	members, err := h.members.ListMembers(wsID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to list members"})
		return
	}

	writeJSON(w, http.StatusOK, members)
}

func (h *Handler) RevokeInvite(w http.ResponseWriter, r *http.Request) {
	claims := jwtClaimsFromContext(r.Context())
	if claims == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
		return
	}

	userID, _ := claims["sub"].(string)

	// F-061: the caller's workspace must be known to scope the revocation.
	// Without it we cannot prevent a user in workspace A from revoking an
	// invitation in workspace B, so a request with no workspace_id is rejected.
	wsID, _ := claims["workspace_id"].(string)
	if wsID == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "workspace context required"})
		return
	}

	inviteID := chi.URLParam(r, "id")
	if inviteID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invitation id required"})
		return
	}

	// Defense-in-depth: require team:manage on the caller's own workspace.
	if h.perm != nil {
		allowed, err := h.perm.Evaluate(r.Context(), userID, wsID, "team", "manage")
		if err != nil || !allowed {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "permission denied"})
			return
		}
	}

	// Prefer the workspace-scoped revoker when available so the workspace_id
	// is enforced at the data layer (the only reliable cross-tenant backstop).
	if scoped, ok := h.svc.(WorkspaceScopedRevoker); ok {
		err := scoped.RevokeInvitationInWorkspace(r.Context(), wsID, inviteID)
		switch {
		case err == ErrInvitationNotFound:
			// Either the invite does not exist or it belongs to another
			// workspace — both look identical to this tenant by design.
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "invitation not found"})
			return
		case err != nil:
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to revoke invitation"})
			return
		}
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// Legacy fallback: unscoped revoke. The handler-level permission check
	// above is the only guard until the service implements WorkspaceScopedRevoker.
	if err := h.svc.RevokeInvitation(r.Context(), inviteID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to revoke invitation"})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// ──────────────────────────── Helpers ────────────────────────────

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
