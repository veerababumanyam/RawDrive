package handler

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

// DealerAnalyticsHandler serves the dealer dashboard with period selection.
// GET /api/v1/dealer/analytics
//
//	?period=current_month|last_month|last_7_days|last_30_days|last_quarter|custom
//	&from=RFC3339 (custom only)
//	&to=RFC3339   (custom only)
type DealerAnalyticsHandler struct {
	svc        *service.DealerAnalyticsService
	dealerRepo *repository.DealerRepo
}

func NewDealerAnalyticsHandler(svc *service.DealerAnalyticsService, dealerRepo *repository.DealerRepo) *DealerAnalyticsHandler {
	return &DealerAnalyticsHandler{svc: svc, dealerRepo: dealerRepo}
}

func (h *DealerAnalyticsHandler) Dashboard(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	dealer, err := h.dealerRepo.GetByUserID(r.Context(), userID)
	if err != nil {
		http.Error(w, `{"error":"not a registered dealer"}`, http.StatusNotFound)
		return
	}

	q := r.URL.Query()
	period := service.Period(q.Get("period"))

	var fromPtr, toPtr *time.Time
	if period == service.PeriodCustom {
		fromStr := q.Get("from")
		toStr := q.Get("to")
		if fromStr == "" || toStr == "" {
			http.Error(w, `{"error":"from and to required for custom period"}`, http.StatusBadRequest)
			return
		}
		fromT, err := time.Parse(time.RFC3339, fromStr)
		if err != nil {
			http.Error(w, `{"error":"invalid from (must be RFC3339)"}`, http.StatusBadRequest)
			return
		}
		toT, err := time.Parse(time.RFC3339, toStr)
		if err != nil {
			http.Error(w, `{"error":"invalid to (must be RFC3339)"}`, http.StatusBadRequest)
			return
		}
		fromPtr = &fromT
		toPtr = &toT
	}

	resp, err := h.svc.GetDashboard(r.Context(), dealer.ID, period, fromPtr, toPtr)
	if err != nil {
		if errors.Is(err, service.ErrInvalidPeriod) || errors.Is(err, service.ErrInvalidCustomRange) {
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
			return
		}
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, resp)
}

// Photographers returns all photographers in the same state as the authenticated dealer.
// GET /api/v1/dealer/photographers
func (h *DealerAnalyticsHandler) Photographers(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	dealer, err := h.dealerRepo.GetByUserID(r.Context(), userID)
	if err != nil {
		http.Error(w, `{"error":"not a registered dealer"}`, http.StatusNotFound)
		return
	}

	photographers, err := h.svc.GetStatePhotographers(r.Context(), dealer.ID)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, photographers)
}

// RevenueCalendar returns per-day revenue share data for the authenticated dealer.
// GET /api/v1/dealer/revenue-calendar?year=2026&month=5
func (h *DealerAnalyticsHandler) RevenueCalendar(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	dealer, err := h.dealerRepo.GetByUserID(r.Context(), userID)
	if err != nil {
		http.Error(w, `{"error":"not a registered dealer"}`, http.StatusNotFound)
		return
	}

	now := time.Now()
	year := now.Year()
	month := int(now.Month())

	if y := r.URL.Query().Get("year"); y != "" {
		if parsed, err := strconv.Atoi(y); err == nil && parsed > 2000 {
			year = parsed
		}
	}
	if m := r.URL.Query().Get("month"); m != "" {
		if parsed, err := strconv.Atoi(m); err == nil && parsed >= 1 && parsed <= 12 {
			month = parsed
		}
	}

	resp, err := h.svc.GetRevenueCalendar(r.Context(), dealer.ID, year, month)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, resp)
}
