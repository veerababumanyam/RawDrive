package handler

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

type AdminUsersHandler struct {
	svc *service.AdminUserService
}

func NewAdminUsersHandler(svc *service.AdminUserService) *AdminUsersHandler {
	return &AdminUsersHandler{svc: svc}
}

// M39 E5-S1 (FR-F01): admin user create.
type adminUserCreateRequest struct {
	Email           string  `json:"email"`
	FullName        string  `json:"full_name"`
	Role            string  `json:"role"`
	InitialPassword *string `json:"initial_password,omitempty"`
	SendInvite      bool    `json:"send_invite,omitempty"`
	// 2026-05-19 admin-granted plan comp (migration 113). Optional;
	// when non-empty the service validates it against the canonical
	// tier whitelist and persists to users.pending_plan_tier. Only
	// valid for role="photographer" — other roles return 400
	// invalid_plan_tier because they don't own a workspace to apply
	// the grant against.
	PlanTier *string `json:"plan_tier,omitempty"`
}

// Create handles POST /api/v1/admin/users. Returns 202 for invite flow,
// 201 for password flow. Rejects superadmin role with 400, duplicate email
// with 409. Emits audit.admin.user.create on success (SEC-F10).
func (h *AdminUsersHandler) Create(w http.ResponseWriter, r *http.Request) {
	actorID := middleware.GetActorID(r.Context())
	if actorID == uuid.Nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	var req adminUserCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	detail, err := h.svc.Create(r.Context(), service.CreateInput{
		Email:           req.Email,
		FullName:        req.FullName,
		Role:            req.Role,
		InitialPassword: req.InitialPassword,
		SendInvite:      req.SendInvite,
		PlanTier:        req.PlanTier,
		ActorID:         actorID,
	})
	if err != nil {
		switch err {
		case service.ErrInvalidRole:
			http.Error(w, `{"error":"invalid role","code":"invalid_role"}`, http.StatusBadRequest)
		case service.ErrInvalidEmail:
			http.Error(w, `{"error":"invalid email","code":"invalid_email"}`, http.StatusBadRequest)
		case service.ErrWeakPassword:
			http.Error(w, `{"error":"password does not meet complexity","code":"weak_password"}`, http.StatusBadRequest)
		case service.ErrMissingPasswordOrInvite:
			http.Error(w, `{"error":"supply either initial_password or send_invite","code":"missing_auth_path"}`, http.StatusBadRequest)
		case service.ErrInvalidPlanTier:
			http.Error(w, `{"error":"invalid plan tier (must be one of free|starter|professional|business|enterprise, and only for role=photographer)","code":"invalid_plan_tier"}`, http.StatusBadRequest)
		case service.ErrDuplicateEmail:
			http.Error(w, `{"error":"email already registered","code":"duplicate_email"}`, http.StatusConflict)
		default:
			log.Printf("admin: user create failed: %v", err)
			http.Error(w, `{"error":"failed to create user"}`, http.StatusInternalServerError)
		}
		return
	}
	if req.InitialPassword != nil {
		respondJSON(w, http.StatusCreated, detail)
		return
	}
	respondJSON(w, http.StatusAccepted, detail)
}

func (h *AdminUsersHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	if limit <= 0 || limit > 100 {
		limit = 25
	}
	filter := repository.AdminUserFilter{
		Search: q.Get("search"),
		Role:   q.Get("role"),
		Status: q.Get("status"),
		Sort:   q.Get("sort"),
		Limit:  limit,
	}
	result, err := h.svc.ListUsers(r.Context(), filter)
	if err != nil {
		log.Printf("admin users list: %v", err)
		http.Error(w, fmt.Sprintf(`{"error":"list users failed: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, result)
}

func (h *AdminUsersHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid user id"}`, http.StatusBadRequest)
		return
	}
	user, err := h.svc.GetUser(r.Context(), id)
	if err != nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	respondJSON(w, http.StatusOK, user)
}

func (h *AdminUsersHandler) Suspend(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid user id"}`, http.StatusBadRequest)
		return
	}
	var body struct {
		Reason string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Reason == "" {
		http.Error(w, `{"error":"reason is required"}`, http.StatusBadRequest)
		return
	}
	actorID := middleware.GetActorID(r.Context())
	if actorID == uuid.Nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	if err := h.svc.SuspendUser(r.Context(), id, body.Reason, actorID); err != nil {
		log.Printf("admin: suspend user %s failed: %v", id, err)
		http.Error(w, `{"error":"failed to suspend user"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "suspended"})
}

func (h *AdminUsersHandler) Reactivate(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid user id"}`, http.StatusBadRequest)
		return
	}
	actorID := middleware.GetActorID(r.Context())
	if err := h.svc.ReactivateUser(r.Context(), id, actorID); err != nil {
		log.Printf("admin: reactivate user %s failed: %v", id, err)
		http.Error(w, `{"error":"failed to reactivate user"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "active"})
}

func (h *AdminUsersHandler) Impersonate(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid user id"}`, http.StatusBadRequest)
		return
	}
	actorID := middleware.GetActorID(r.Context())
	token, err := h.svc.ImpersonateUser(r.Context(), id, actorID)
	if err != nil {
		log.Printf("admin: impersonate user %s failed: %v", id, err)
		http.Error(w, `{"error":"failed to impersonate user"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"token": token})
}

// Delete handles DELETE /api/v1/admin/users/{id} (M7 E20-S1 GDPR erasure).
// Marks the user as deleted, cascades through dependent tables via FK
// ON DELETE CASCADE, logs a high-severity audit entry.
func (h *AdminUsersHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid user id"}`, http.StatusBadRequest)
		return
	}
	actorID := middleware.GetActorID(r.Context())
	if err := h.svc.DeleteUser(r.Context(), id, actorID); err != nil {
		log.Printf("admin: delete user %s failed: %v", id, err)
		// Bubble up specific errors so the admin UI can show accurate messages.
		if err.Error() == "cannot delete a super_admin" ||
			err.Error() == "cannot delete your own account via admin panel" {
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusForbidden)
			return
		}
		http.Error(w, `{"error":"failed to delete user"}`, http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Activity handles GET /api/v1/admin/users/{id}/activity (M7 E20-S1 timeline).
// Returns the user's audit log trail — both actions they performed and
// actions taken against them. Query param ?limit=20 (max 100).
func (h *AdminUsersHandler) Activity(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid user id"}`, http.StatusBadRequest)
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	entries, err := h.svc.GetUserActivity(r.Context(), id, limit)
	if err != nil {
		log.Printf("admin: activity for user %s failed: %v", id, err)
		http.Error(w, `{"error":"failed to fetch activity"}`, http.StatusInternalServerError)
		return
	}
	if entries == nil {
		entries = []repository.AuditLogEntry{}
	}
	respondJSON(w, http.StatusOK, entries)
}

func (h *AdminUsersHandler) ChangeTier(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid user id"}`, http.StatusBadRequest)
		return
	}
	var body struct {
		Tier string `json:"tier"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Tier == "" {
		http.Error(w, `{"error":"tier is required"}`, http.StatusBadRequest)
		return
	}
	actorID := middleware.GetActorID(r.Context())
	if err := h.svc.ChangeTier(r.Context(), id, body.Tier, actorID); err != nil {
		switch err {
		case service.ErrInvalidPlanTier:
			http.Error(w, `{"error":"invalid plan tier","code":"invalid_plan_tier"}`, http.StatusBadRequest)
		default:
			log.Printf("admin: change tier user %s to %s failed: %v", id, body.Tier, err)
			http.Error(w, `{"error":"failed to change tier"}`, http.StatusInternalServerError)
		}
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "tier_updated"})
}

func (h *AdminUsersHandler) ChangeRole(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid user id"}`, http.StatusBadRequest)
		return
	}
	var body struct {
		Role string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Role == "" {
		http.Error(w, `{"error":"role is required"}`, http.StatusBadRequest)
		return
	}
	actorID := middleware.GetActorID(r.Context())
	if err := h.svc.ChangeRole(r.Context(), id, body.Role, actorID); err != nil {
		log.Printf("admin: change role user %s to %s failed: %v", id, body.Role, err)
		http.Error(w, `{"error":"failed to change role"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "role_updated"})
}
