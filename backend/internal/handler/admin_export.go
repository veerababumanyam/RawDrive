package handler

import (
	"bytes"
	"fmt"
	"net/http"
	"strings"
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
	format := strings.ToLower(strings.TrimSpace(q.Get("format")))
	if format == "" {
		format = "csv"
	}
	if format != "csv" && format != "pdf" {
		http.Error(w, `{"error":"format must be csv or pdf"}`, http.StatusBadRequest)
		return
	}

	timestamp := time.Now().Format("20060102_150405")
	if format == "pdf" {
		pdf, err := h.svc.ExportRevenuePDF(r.Context(), from, to, granularity)
		if err != nil {
			http.Error(w, `{"error":"export failed"}`, http.StatusInternalServerError)
			return
		}
		filename := fmt.Sprintf("revenue_export_%s.pdf", timestamp)
		w.Header().Set("Content-Type", "application/pdf")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename))
		_, _ = w.Write(pdf)
		return
	}

	var buf bytes.Buffer
	if err := h.svc.ExportRevenueCSV(r.Context(), from, to, granularity, &buf); err != nil {
		http.Error(w, `{"error":"export failed"}`, http.StatusInternalServerError)
		return
	}
	filename := fmt.Sprintf("revenue_export_%s.csv", timestamp)
	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename))
	_, _ = w.Write(buf.Bytes())
}
