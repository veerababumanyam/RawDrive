package handler

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"strings"
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

// parseAuditLogTime accepts RFC3339 (preferred) or YYYY-MM-DD (backward compat).
// Returns (nil, nil) when the input is empty so the caller can distinguish
// "no filter requested" from "invalid filter supplied". Returns (nil, err)
// on garbage input so the handler can respond with 400 (M39 FR-F05).
func parseAuditLogTime(s string) (*time.Time, error) {
	if s == "" {
		return nil, nil
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return &t, nil
	}
	if t, err := time.Parse("2006-01-02", s); err == nil {
		return &t, nil
	}
	return nil, fmt.Errorf("invalid time value %q: expected RFC3339 or YYYY-MM-DD", s)
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
	// M39 E8-S1: actor_id takes precedence over actor term; if actor_id is
	// supplied AND parses, it wins regardless of actor term. An unparseable
	// actor_id is ignored so that a typo in the id doesn't swallow the request.
	if actorStr := q.Get("actor_id"); actorStr != "" {
		if id, err := uuid.Parse(actorStr); err == nil {
			filter.ActorID = &id
		}
	}
	if filter.ActorID == nil {
		if term := q.Get("actor"); term != "" {
			filter.ActorTerm = term
		}
	}
	// M39 FR-F05: date parsing must reject garbage with 400 rather than
	// silently dropping the filter (previous behavior hid data leaks).
	dateFrom, err := parseAuditLogTime(q.Get("date_from"))
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusBadRequest)
		return
	}
	filter.DateFrom = dateFrom
	dateTo, err := parseAuditLogTime(q.Get("date_to"))
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusBadRequest)
		return
	}
	if dateTo != nil {
		// For date-only input the backward-compat path previously extended to
		// end-of-day. Keep that behavior: if the user supplied a YYYY-MM-DD
		// format (truncated to midnight UTC), push to 23:59:59. RFC3339 times
		// are already explicit so we leave them alone.
		if dateTo.Equal(dateTo.Truncate(24*time.Hour)) && !strings.Contains(q.Get("date_to"), "T") {
			endOfDay := dateTo.Add(24*time.Hour - time.Second)
			filter.DateTo = &endOfDay
		} else {
			filter.DateTo = dateTo
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
