package handler

import (
	"net/http"
	"time"

	"github.com/rawdrive/backend/internal/service"
)

type AdminSystemHealthHandler struct {
	svc *service.AdminHealthService
}

func NewAdminSystemHealthHandler(svc *service.AdminHealthService) *AdminSystemHealthHandler {
	return &AdminSystemHealthHandler{svc: svc}
}

// GetMetrics returns the flat SystemSummary snapshot consumed by the
// admin System Health page. Prior to this handler the route returned a
// []MetricPoint time-series array, which the frontend could never
// actually consume — every field on the System Health page read as
// undefined. See admin_health_service.GetSummary for the data sources.
func (h *AdminSystemHealthHandler) GetMetrics(w http.ResponseWriter, r *http.Request) {
	summary, err := h.svc.GetSummary(r.Context())
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, summary)
}

// GetMetricsTimeSeries exposes the historical time-series view of a
// single metric. Kept for future internal tooling; not currently wired
// to the admin UI. Query params: service, type, from, to (RFC3339).
func (h *AdminSystemHealthHandler) GetMetricsTimeSeries(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	svcName := q.Get("service")
	metricType := q.Get("type")
	from, _ := time.Parse(time.RFC3339, q.Get("from"))
	to, _ := time.Parse(time.RFC3339, q.Get("to"))
	if from.IsZero() {
		from = time.Now().Add(-1 * time.Hour)
	}
	if to.IsZero() {
		to = time.Now()
	}
	result, err := h.svc.GetMetricsTimeSeries(r.Context(), svcName, metricType, from, to)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, result)
}

func (h *AdminSystemHealthHandler) GetThresholds(w http.ResponseWriter, r *http.Request) {
	result, err := h.svc.GetAlertThresholds(r.Context())
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, result)
}
