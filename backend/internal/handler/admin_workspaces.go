package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
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
