package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/rawdrive/backend/internal/service"
)

// GSTReportHandler handles GST report endpoints.
type GSTReportHandler struct {
	svc *service.GSTReportService
}

func NewGSTReportHandler(svc *service.GSTReportService) *GSTReportHandler {
	return &GSTReportHandler{svc: svc}
}

// GSTR1 handles GET /api/v1/billing/reports/gstr1?year=2026&month=4
func (h *GSTReportHandler) GSTR1(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	year, _ := strconv.Atoi(r.URL.Query().Get("year"))
	month, _ := strconv.Atoi(r.URL.Query().Get("month"))
	if year == 0 || month == 0 {
		now := time.Now()
		year = now.Year()
		month = int(now.Month())
	}
	entries, err := h.svc.GenerateGSTR1(r.Context(), workspaceID, year, time.Month(month))
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, entries)
}

// GSTR3B handles GET /api/v1/billing/reports/gstr3b?year=2026&month=4
func (h *GSTReportHandler) GSTR3B(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	year, _ := strconv.Atoi(r.URL.Query().Get("year"))
	month, _ := strconv.Atoi(r.URL.Query().Get("month"))
	if year == 0 || month == 0 {
		now := time.Now()
		year = now.Year()
		month = int(now.Month())
	}
	summary, err := h.svc.GenerateGSTR3B(r.Context(), workspaceID, year, time.Month(month))
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, summary)
}

// Revenue handles GET /api/v1/billing/reports/revenue?from=2026-04-01&to=2026-04-30
func (h *GSTReportHandler) Revenue(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	from, _ := time.Parse("2006-01-02", r.URL.Query().Get("from"))
	to, _ := time.Parse("2006-01-02", r.URL.Query().Get("to"))
	if from.IsZero() {
		from = time.Now().AddDate(0, -1, 0)
	}
	if to.IsZero() {
		to = time.Now()
	}
	summary, err := h.svc.GetRevenueSummary(r.Context(), workspaceID, from, to)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, summary)
}
