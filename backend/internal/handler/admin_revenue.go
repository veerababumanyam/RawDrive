package handler

import (
	"net/http"
	"time"

	"github.com/rawdrive/backend/internal/service"
)

type AdminRevenueHandler struct {
	svc *service.AdminRevenueService
}

func NewAdminRevenueHandler(svc *service.AdminRevenueService) *AdminRevenueHandler {
	return &AdminRevenueHandler{svc: svc}
}

func (h *AdminRevenueHandler) GetDashboard(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	from, _ := time.Parse(time.RFC3339, q.Get("from"))
	to, _ := time.Parse(time.RFC3339, q.Get("to"))
	if from.IsZero() {
		from = time.Now().AddDate(0, -1, 0)
	}
	if to.IsZero() {
		to = time.Now()
	}
	result, err := h.svc.GetDashboard(r.Context(), from, to, nil)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, result)
}

func (h *AdminRevenueHandler) GetTimeSeries(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	from, _ := time.Parse(time.RFC3339, q.Get("from"))
	to, _ := time.Parse(time.RFC3339, q.Get("to"))
	// The frontend revenue page sends ?period=monthly|weekly|daily (see
	// lib/api/admin.ts getRevenueTimeSeries). The older export handler
	// sends ?granularity=... for CSV exports. Accept both here so neither
	// caller is forced to rename. Prefer granularity when both are set.
	granularity := q.Get("granularity")
	if granularity == "" {
		granularity = q.Get("period")
	}
	if granularity == "" {
		granularity = "day"
	}
	if from.IsZero() {
		from = time.Now().AddDate(0, -1, 0)
	}
	if to.IsZero() {
		to = time.Now()
	}
	result, err := h.svc.GetTimeSeries(r.Context(), from, to, granularity)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, result)
}

func (h *AdminRevenueHandler) GetStateBreakdown(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	from, _ := time.Parse(time.RFC3339, q.Get("from"))
	to, _ := time.Parse(time.RFC3339, q.Get("to"))
	if from.IsZero() {
		from = time.Now().AddDate(0, -1, 0)
	}
	if to.IsZero() {
		to = time.Now()
	}
	result, err := h.svc.GetStateBreakdown(r.Context(), from, to)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, result)
}
