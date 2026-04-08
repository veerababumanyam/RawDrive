package handler

import (
	"fmt"
	"net/http"
	"time"

	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

type AdminExportHandler struct {
	svc *service.AdminExportService
}

func NewAdminExportHandler(svc *service.AdminExportService) *AdminExportHandler {
	return &AdminExportHandler{svc: svc}
}

func (h *AdminExportHandler) ExportUsers(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	filter := repository.AdminUserFilter{
		Role:   q.Get("role"),
		Status: q.Get("status"),
		Limit:  10000,
	}
	filename := fmt.Sprintf("users_export_%s.csv", time.Now().Format("20060102_150405"))
	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename))
	if err := h.svc.ExportUsersCSV(r.Context(), filter, w); err != nil {
		http.Error(w, `{"error":"export failed"}`, http.StatusInternalServerError)
	}
}

func (h *AdminExportHandler) ExportRevenue(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	from, _ := time.Parse(time.RFC3339, q.Get("from"))
	to, _ := time.Parse(time.RFC3339, q.Get("to"))
	if from.IsZero() {
		from = time.Now().AddDate(0, -1, 0)
	}
	if to.IsZero() {
		to = time.Now()
	}
	granularity := q.Get("granularity")
	if granularity == "" {
		granularity = "day"
	}
	filename := fmt.Sprintf("revenue_export_%s.csv", time.Now().Format("20060102_150405"))
	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename))
	if err := h.svc.ExportRevenueCSV(r.Context(), from, to, granularity, w); err != nil {
		http.Error(w, `{"error":"export failed"}`, http.StatusInternalServerError)
	}
}
