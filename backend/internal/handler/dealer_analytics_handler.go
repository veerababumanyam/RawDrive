package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"

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

// EmailAdminStateReportToDealer sends one statewide monthly report to the
// specific dealer selected by platform staff.
// POST /api/v1/admin/dealers/reports/statewide/email
func (h *DealerAnalyticsHandler) EmailAdminStateReportToDealer(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		http.Error(w, `{"error":"dealer analytics unavailable"}`, http.StatusServiceUnavailable)
		return
	}

	now := time.Now().UTC()
	body := struct {
		DealerID          string  `json:"dealer_id"`
		Year              int     `json:"year"`
		Month             int     `json:"month"`
		CommissionRatePct float64 `json:"commission_rate_pct"`
	}{
		Year:              now.Year(),
		Month:             int(now.Month()),
		CommissionRatePct: service.DefaultDealerReportCommissionRatePct,
	}
	if r.Body != nil {
		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&body); err != nil {
			http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
			return
		}
	}
	dealerID, err := uuid.Parse(body.DealerID)
	if err != nil {
		http.Error(w, `{"error":"invalid dealer_id"}`, http.StatusBadRequest)
		return
	}
	if body.Year < 2000 {
		http.Error(w, `{"error":"invalid year"}`, http.StatusBadRequest)
		return
	}
	if body.Month < 1 || body.Month > 12 {
		http.Error(w, `{"error":"invalid month"}`, http.StatusBadRequest)
		return
	}
	if body.CommissionRatePct <= 0 || body.CommissionRatePct > 100 {
		http.Error(w, `{"error":"invalid commission_rate_pct"}`, http.StatusBadRequest)
		return
	}

	resp, err := h.svc.EmailAdminStateReportToDealer(
		r.Context(),
		dealerID,
		body.Year,
		body.Month,
		body.CommissionRatePct,
	)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrRevenueReportEmailDisabled):
			http.Error(w, `{"error":"email is not configured"}`, http.StatusServiceUnavailable)
		case errors.Is(err, service.ErrRevenueReportDealerMissing):
			http.Error(w, `{"error":"dealer report not found"}`, http.StatusNotFound)
		case errors.Is(err, service.ErrRevenueReportDealerNoEmail):
			http.Error(w, `{"error":"dealer has no email"}`, http.StatusUnprocessableEntity)
		default:
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		}
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

// AdminStateReports returns statewide monthly dealer reports for platform
// admins. The route is mounted behind RequirePlatformRole("admin",
// "super_admin") in routes_m6.go.
// GET /api/v1/admin/dealers/reports/statewide?year=2026&month=6
func (h *DealerAnalyticsHandler) AdminStateReports(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		http.Error(w, `{"error":"dealer analytics unavailable"}`, http.StatusServiceUnavailable)
		return
	}

	now := time.Now().UTC()
	year := now.Year()
	month := int(now.Month())

	if y := r.URL.Query().Get("year"); y != "" {
		parsed, err := strconv.Atoi(y)
		if err != nil || parsed < 2000 {
			http.Error(w, `{"error":"invalid year"}`, http.StatusBadRequest)
			return
		}
		year = parsed
	}
	if m := r.URL.Query().Get("month"); m != "" {
		parsed, err := strconv.Atoi(m)
		if err != nil || parsed < 1 || parsed > 12 {
			http.Error(w, `{"error":"invalid month"}`, http.StatusBadRequest)
			return
		}
		month = parsed
	}

	fallbackCommission := service.DefaultDealerReportCommissionRatePct
	if c := r.URL.Query().Get("commission_rate_pct"); c != "" {
		parsed, err := strconv.ParseFloat(c, 64)
		if err != nil || parsed <= 0 || parsed > 100 {
			http.Error(w, `{"error":"invalid commission_rate_pct"}`, http.StatusBadRequest)
			return
		}
		fallbackCommission = parsed
	}

	resp, err := h.svc.GetAdminStateReports(r.Context(), year, month, fallbackCommission)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, resp)
}
