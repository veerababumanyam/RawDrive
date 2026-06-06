package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
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

func (h *AdminRevenueHandler) GetRecords(w http.ResponseWriter, r *http.Request) {
	stateID, district, ok := parseRevenueReportQuery(w, r)
	if !ok {
		return
	}
	result, err := h.svc.GetRevenueRecords(r.Context(), stateID, district)
	if err != nil {
		writeRevenueReportError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, result)
}

func (h *AdminRevenueHandler) DownloadRecordsPDF(w http.ResponseWriter, r *http.Request) {
	stateID, district, ok := parseRevenueReportQuery(w, r)
	if !ok {
		return
	}
	pdf, report, err := h.svc.RenderRevenueRecordsPDF(r.Context(), stateID, district)
	if err != nil {
		writeRevenueReportError(w, err)
		return
	}
	filename := "revenue_report_" + reportFilenamePart(report.StateName)
	if report.District != "" {
		filename += "_" + reportFilenamePart(report.District)
	}
	filename += "_" + time.Now().Format("20060102_150405") + ".pdf"
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename))
	_, _ = w.Write(pdf)
}

func (h *AdminRevenueHandler) EmailRecordsToDealer(w http.ResponseWriter, r *http.Request) {
	stateID, district, ok := parseRevenueReportBody(w, r)
	if !ok {
		return
	}
	result, err := h.svc.EmailRevenueRecordsToDealer(r.Context(), stateID, district)
	if err != nil {
		writeRevenueReportError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, result)
}

func parseRevenueReportQuery(w http.ResponseWriter, r *http.Request) (int, string, bool) {
	stateID, err := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("state_id")))
	if err != nil || stateID <= 0 {
		http.Error(w, `{"error":"state_id is required"}`, http.StatusBadRequest)
		return 0, "", false
	}
	return stateID, strings.TrimSpace(r.URL.Query().Get("district")), true
}

func parseRevenueReportBody(w http.ResponseWriter, r *http.Request) (int, string, bool) {
	var body struct {
		StateID  int    `json:"state_id"`
		District string `json:"district"`
	}
	if r.Body != nil {
		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&body); err != nil {
			http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
			return 0, "", false
		}
	}
	if body.StateID <= 0 {
		http.Error(w, `{"error":"state_id is required"}`, http.StatusBadRequest)
		return 0, "", false
	}
	return body.StateID, strings.TrimSpace(body.District), true
}

func writeRevenueReportError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, service.ErrRevenueStateNotFound):
		http.Error(w, `{"error":"state not found"}`, http.StatusNotFound)
	case errors.Is(err, service.ErrRevenueReportEmailDisabled):
		http.Error(w, `{"error":"email is not configured"}`, http.StatusServiceUnavailable)
	case errors.Is(err, service.ErrRevenueReportDealerMissing):
		http.Error(w, `{"error":"no approved dealer for this state"}`, http.StatusNotFound)
	case errors.Is(err, service.ErrRevenueReportDealerNoEmail):
		http.Error(w, `{"error":"approved dealer has no email"}`, http.StatusUnprocessableEntity)
	default:
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
	}
}

func reportFilenamePart(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	var b strings.Builder
	for _, r := range value {
		switch {
		case r >= 'a' && r <= 'z':
			b.WriteRune(r)
		case r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == ' ' || r == '-' || r == '_':
			b.WriteByte('_')
		}
	}
	out := strings.Trim(b.String(), "_")
	if out == "" {
		return "report"
	}
	return out
}
