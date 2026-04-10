package handler

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

type AdminWorkspacesHandler struct {
	svc *service.AdminWorkspaceService
}

func NewAdminWorkspacesHandler(svc *service.AdminWorkspaceService) *AdminWorkspacesHandler {
	return &AdminWorkspacesHandler{svc: svc}
}

func (h *AdminWorkspacesHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	filter := repository.AdminWorkspaceFilter{
		Search: q.Get("search"),
		Status: q.Get("status"),
	}
	result, err := h.svc.ListWorkspaces(r.Context(), filter)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, result)
}

func (h *AdminWorkspacesHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid workspace id"}`, http.StatusBadRequest)
		return
	}
	ws, err := h.svc.GetWorkspace(r.Context(), id)
	if err != nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	respondJSON(w, http.StatusOK, ws)
}

// Suspend handles POST /api/v1/admin/workspaces/{id}/suspend (M7 E20-S3).
// Blocks workspace access while preserving data. Reason required.
func (h *AdminWorkspacesHandler) Suspend(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid workspace id"}`, http.StatusBadRequest)
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
	if err := h.svc.SuspendWorkspace(r.Context(), id, body.Reason, actorID); err != nil {
		log.Printf("admin: suspend workspace %s failed: %v", id, err)
		http.Error(w, `{"error":"failed to suspend workspace"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "suspended"})
}

// Unsuspend handles POST /api/v1/admin/workspaces/{id}/unsuspend.
func (h *AdminWorkspacesHandler) Unsuspend(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid workspace id"}`, http.StatusBadRequest)
		return
	}
	actorID := middleware.GetActorID(r.Context())
	if err := h.svc.UnsuspendWorkspace(r.Context(), id, actorID); err != nil {
		log.Printf("admin: unsuspend workspace %s failed: %v", id, err)
		http.Error(w, `{"error":"failed to unsuspend workspace"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "active"})
}

// Delete handles DELETE /api/v1/admin/workspaces/{id}. Soft-deletes with a
// retention window — hard purge is performed by the background purge worker.
func (h *AdminWorkspacesHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid workspace id"}`, http.StatusBadRequest)
		return
	}
	actorID := middleware.GetActorID(r.Context())
	if err := h.svc.DeleteWorkspace(r.Context(), id, actorID); err != nil {
		log.Printf("admin: delete workspace %s failed: %v", id, err)
		http.Error(w, `{"error":"failed to delete workspace"}`, http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
