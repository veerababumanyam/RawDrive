package handler

import (
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/rawdrive/backend/internal/service"
)

type AdminBillingAnalyticsHandler struct {
	svc *service.AdminBillingAnalyticsService
}

func NewAdminBillingAnalyticsHandler(svc *service.AdminBillingAnalyticsService) *AdminBillingAnalyticsHandler {
	return &AdminBillingAnalyticsHandler{svc: svc}
}

func (h *AdminBillingAnalyticsHandler) GetDashboard(w http.ResponseWriter, r *http.Request) {
	if h == nil || h.svc == nil {
		http.Error(w, `{"error":"billing analytics unavailable"}`, http.StatusServiceUnavailable)
		return
	}
	windowDays := 30
	rawWindow := strings.TrimSpace(r.URL.Query().Get("window_days"))
	if rawWindow != "" {
		parsed, err := strconv.Atoi(rawWindow)
		if err != nil || parsed <= 0 {
			http.Error(w, `{"error":"window_days must be a positive integer"}`, http.StatusBadRequest)
			return
		}
		windowDays = parsed
	}
	out, err := h.svc.GetDashboard(r.Context(), windowDays)
	if err != nil {
		log.Printf("admin billing analytics dashboard failed: %v", err)
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, out)
}
