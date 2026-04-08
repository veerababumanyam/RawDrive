package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

type AdminAuditLogsHandler struct {
	svc *service.AuditLogService
}

func NewAdminAuditLogsHandler(svc *service.AuditLogService) *AdminAuditLogsHandler {
	return &AdminAuditLogsHandler{svc: svc}
}

func (h *AdminAuditLogsHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	filter := repository.AuditLogFilter{
		Action:       q.Get("action"),
		ResourceType: q.Get("resource_type"),
		Severity:     q.Get("severity"),
	}
	result, err := h.svc.ListLogs(r.Context(), filter)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, result)
}

func (h *AdminAuditLogsHandler) GetDetail(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	detail, err := h.svc.GetLogDetail(r.Context(), id)
	if err != nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	respondJSON(w, http.StatusOK, detail)
}
