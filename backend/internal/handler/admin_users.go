package handler

import (
	"encoding/json"
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

func (h *AdminUsersHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	if limit <= 0 || limit > 100 {
		limit = 25
	}
	filter := repository.AdminUserFilter{
		Search:  q.Get("search"),
		Role:    q.Get("role"),
		Status:  q.Get("status"),
		Sort:    q.Get("sort"),
		Limit:   limit,
	}
	result, err := h.svc.ListUsers(r.Context(), filter)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
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
