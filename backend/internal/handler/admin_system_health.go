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

func (h *AdminSystemHealthHandler) GetMetrics(w http.ResponseWriter, r *http.Request) {
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
	result, err := h.svc.GetMetrics(r.Context(), svcName, metricType, from, to)
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
