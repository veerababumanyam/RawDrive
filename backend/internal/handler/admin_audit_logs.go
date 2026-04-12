package handler

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"time"

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
		IPAddress:    q.Get("ip_address"),
		Limit:        500,
	}
	if limitStr := q.Get("limit"); limitStr != "" {
		if n, err := fmt.Sscanf(limitStr, "%d", &filter.Limit); err != nil || n != 1 {
			filter.Limit = 500
		}
	}
	if cursorStr := q.Get("cursor"); cursorStr != "" {
		if id, err := uuid.Parse(cursorStr); err == nil {
			filter.Cursor = &id
		}
	}
	if actorStr := q.Get("actor_id"); actorStr != "" {
		if id, err := uuid.Parse(actorStr); err == nil {
			filter.ActorID = &id
		}
	}
	if dateFrom := q.Get("date_from"); dateFrom != "" {
		if t, err := time.Parse("2006-01-02", dateFrom); err == nil {
			filter.DateFrom = &t
		}
	}
	if dateTo := q.Get("date_to"); dateTo != "" {
		if t, err := time.Parse("2006-01-02", dateTo); err == nil {
			// Set to end of day
			endOfDay := t.Add(24*time.Hour - time.Second)
			filter.DateTo = &endOfDay
		}
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

func (h *AdminAuditLogsHandler) Export(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	filter := repository.AuditLogFilter{
		Action:       q.Get("action"),
		ResourceType: q.Get("resource_type"),
		Severity:     q.Get("severity"),
		Limit:        10000,
	}

	result, err := h.svc.ListLogs(r.Context(), filter)
	if err != nil {
		http.Error(w, `{"error":"export failed"}`, http.StatusInternalServerError)
		return
	}

	filename := fmt.Sprintf("audit_logs_%s.csv", time.Now().Format("20060102_150405"))
	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename))

	cw := csv.NewWriter(w)
	defer cw.Flush()

	_ = cw.Write([]string{"Timestamp", "ActorID", "ActorType", "Action", "ResourceType", "ResourceID", "Severity", "IPAddress", "UserAgent"})
	for _, e := range result.Items {
		ip := ""
		if e.IPAddress != nil {
			ip = *e.IPAddress
		}
		ua := ""
		if e.UserAgent != nil {
			ua = *e.UserAgent
		}
		_ = cw.Write([]string{
			e.CreatedAt.Format(time.RFC3339),
			e.ActorID.String(),
			e.ActorType,
			e.Action,
			e.ResourceType,
			e.ResourceID,
			e.Severity,
			ip,
			ua,
		})
	}
}
