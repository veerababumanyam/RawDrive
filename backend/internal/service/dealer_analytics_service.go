package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
)

// ─── Period selection ────────────────────────────────────────────────────

// Period is a named date range for dealer analytics queries. All ranges are
// half-open [start, end) where end is the moment of the query.
type Period string

const (
	PeriodCurrentMonth Period = "current_month"
	PeriodLastMonth    Period = "last_month"
	PeriodLast7Days    Period = "last_7_days"
	PeriodLast30Days   Period = "last_30_days"
	PeriodLastQuarter  Period = "last_quarter"
	PeriodCustom       Period = "custom"
)

// ErrInvalidPeriod is returned by ResolvePeriodRange for unknown period names.
var ErrInvalidPeriod = errors.New("invalid period")

// ErrInvalidCustomRange is returned when a custom range is missing/reversed.
var ErrInvalidCustomRange = errors.New("custom period requires from < to")

// DefaultDealerReportCommissionRatePct is the statewide dealer report default
// used for pending/unconfigured dealers. Approved dealers keep their configured
// commission.
const DefaultDealerReportCommissionRatePct = 20.0

// PeriodRange is an inclusive-start / exclusive-end time window.
type PeriodRange struct {
	Start time.Time
	End   time.Time
}

// ResolvePeriodRange converts a Period + optional custom bounds into a
// concrete time window anchored at `now`. It's pure (no DB, no clock) so it
// can be tested deterministically with a fixed `now`.
//
// Rules:
//   - current_month: 1st of current month 00:00 UTC → now
//   - last_month: 1st of previous month → 1st of current month
//   - last_7_days: now-7d → now
//   - last_30_days: now-30d → now
//   - last_quarter: start of previous calendar quarter → start of current quarter
//   - custom: from/to as given; both required, from < to
func ResolvePeriodRange(p Period, now time.Time, customFrom, customTo *time.Time) (PeriodRange, error) {
	now = now.UTC()
	switch p {
	case "", PeriodCurrentMonth:
		start := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
		return PeriodRange{Start: start, End: now}, nil

	case PeriodLastMonth:
		firstOfThisMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
		start := firstOfThisMonth.AddDate(0, -1, 0)
		return PeriodRange{Start: start, End: firstOfThisMonth}, nil

	case PeriodLast7Days:
		return PeriodRange{Start: now.AddDate(0, 0, -7), End: now}, nil

	case PeriodLast30Days:
		return PeriodRange{Start: now.AddDate(0, 0, -30), End: now}, nil

	case PeriodLastQuarter:
		// Quarter months: Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec.
		// Last quarter = 3 months before current quarter start.
		currentQuarterStartMonth := ((int(now.Month())-1)/3)*3 + 1
		currentQuarterStart := time.Date(now.Year(), time.Month(currentQuarterStartMonth), 1, 0, 0, 0, 0, time.UTC)
		lastQuarterStart := currentQuarterStart.AddDate(0, -3, 0)
		return PeriodRange{Start: lastQuarterStart, End: currentQuarterStart}, nil

	case PeriodCustom:
		if customFrom == nil || customTo == nil {
			return PeriodRange{}, ErrInvalidCustomRange
		}
		if !customFrom.Before(*customTo) {
			return PeriodRange{}, ErrInvalidCustomRange
		}
		return PeriodRange{Start: customFrom.UTC(), End: customTo.UTC()}, nil
	}
	return PeriodRange{}, ErrInvalidPeriod
}

// ─── Dashboard service ───────────────────────────────────────────────────

type DealerDashboardResponse struct {
	DealerID             uuid.UUID `json:"dealer_id"`
	Period               Period    `json:"period"`
	PeriodStart          time.Time `json:"period_start"`
	PeriodEnd            time.Time `json:"period_end"`
	TotalReferrals       int       `json:"total_referrals"`
	ActiveSubscriptions  int       `json:"active_subscriptions"`
	ChurnedSubscriptions int       `json:"churned_subscriptions"`
	TotalEarnedPaisa     int64     `json:"total_earned_paisa"`
	PendingPayoutPaisa   int64     `json:"pending_payout_paisa"`
	ConversionRate       float64   `json:"conversion_rate"`
}

type DealerAnalyticsService struct {
	analyticsRepo *repository.DealerAnalyticsRepo
	dealerRepo    *repository.DealerRepo
	pdf           *PDFService
	reportEmail   RevenueReportEmailSender
}

func NewDealerAnalyticsService(analyticsRepo *repository.DealerAnalyticsRepo, dealerRepo *repository.DealerRepo) *DealerAnalyticsService {
	return &DealerAnalyticsService{analyticsRepo: analyticsRepo, dealerRepo: dealerRepo, pdf: NewPDFService()}
}

func (s *DealerAnalyticsService) WithPDFService(pdf *PDFService) *DealerAnalyticsService {
	if pdf != nil {
		s.pdf = pdf
	}
	return s
}

func (s *DealerAnalyticsService) WithReportEmailSender(sender RevenueReportEmailSender) *DealerAnalyticsService {
	s.reportEmail = sender
	return s
}

// RevenueCalendarResponse wraps per-day revenue shares for a calendar month.
type RevenueCalendarResponse struct {
	Year              int                            `json:"year"`
	Month             int                            `json:"month"`
	CommissionRatePct float64                        `json:"commission_rate_pct"`
	TotalRevenuePaisa int64                          `json:"total_revenue_paisa"`
	TotalSharePaisa   int64                          `json:"total_share_paisa"`
	Days              []repository.DailyRevenueShare `json:"days"`
}

type AdminDealerStateReportsResponse struct {
	Year                           int                                 `json:"year"`
	Month                          int                                 `json:"month"`
	PeriodStart                    time.Time                           `json:"period_start"`
	PeriodEnd                      time.Time                           `json:"period_end"`
	DefaultCommissionRatePct       float64                             `json:"default_commission_rate_pct"`
	TotalSubscriptionPaisa         int64                               `json:"total_subscription_paisa"`
	TotalProjectedDealerSharePaisa int64                               `json:"total_projected_dealer_share_paisa"`
	Reports                        []repository.AdminDealerStateReport `json:"reports"`
}

type AdminDealerStateReportEmailResponse struct {
	SentTo       string `json:"sent_to"`
	DealerID     string `json:"dealer_id"`
	BusinessName string `json:"business_name"`
}

// GetStatePhotographers returns all photographers registered in the same state as the dealer.
func (s *DealerAnalyticsService) GetStatePhotographers(ctx context.Context, dealerID uuid.UUID) ([]repository.StatePhotographer, error) {
	dealer, err := s.dealerRepo.GetByID(ctx, dealerID)
	if err != nil {
		return nil, err
	}
	return s.analyticsRepo.GetPhotographersByState(ctx, dealer.StateID)
}

// GetRevenueCalendar returns per-day subscription revenue and the dealer's share for a month.
func (s *DealerAnalyticsService) GetRevenueCalendar(ctx context.Context, dealerID uuid.UUID, year, month int) (*RevenueCalendarResponse, error) {
	dealer, err := s.dealerRepo.GetByID(ctx, dealerID)
	if err != nil {
		return nil, err
	}

	commissionRate := float64(0)
	if dealer.CommissionRatePct != nil {
		commissionRate = *dealer.CommissionRatePct
	}

	days, err := s.analyticsRepo.GetDailyRevenueShares(ctx, dealer.StateID, commissionRate, year, month)
	if err != nil {
		return nil, err
	}
	if days == nil {
		days = []repository.DailyRevenueShare{}
	}

	var totalRevenue, totalShare int64
	for _, d := range days {
		totalRevenue += d.TotalSubscriptionPaisa
		totalShare += d.RevenueSharePaisa
	}

	return &RevenueCalendarResponse{
		Year:              year,
		Month:             month,
		CommissionRatePct: commissionRate,
		TotalRevenuePaisa: totalRevenue,
		TotalSharePaisa:   totalShare,
		Days:              days,
	}, nil
}

// GetAdminStateReports returns super-admin statewide dealer reports for a
// calendar month. Missing/zero year or month are defaulted by the handler.
func (s *DealerAnalyticsService) GetAdminStateReports(ctx context.Context, year, month int, fallbackCommissionRatePct float64) (*AdminDealerStateReportsResponse, error) {
	if fallbackCommissionRatePct <= 0 {
		fallbackCommissionRatePct = DefaultDealerReportCommissionRatePct
	}
	periodStart := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.UTC)
	periodEnd := periodStart.AddDate(0, 1, 0)

	reports, err := s.analyticsRepo.GetAdminStateReports(ctx, periodStart, periodEnd, fallbackCommissionRatePct)
	if err != nil {
		return nil, err
	}
	if reports == nil {
		reports = []repository.AdminDealerStateReport{}
	}

	totalSubscription, totalDealerShare := summarizeAdminStateReportTotals(reports)

	return &AdminDealerStateReportsResponse{
		Year:                           year,
		Month:                          month,
		PeriodStart:                    periodStart,
		PeriodEnd:                      periodEnd,
		DefaultCommissionRatePct:       fallbackCommissionRatePct,
		TotalSubscriptionPaisa:         totalSubscription,
		TotalProjectedDealerSharePaisa: totalDealerShare,
		Reports:                        reports,
	}, nil
}

func (s *DealerAnalyticsService) EmailAdminStateReportToDealer(ctx context.Context, dealerID uuid.UUID, year, month int, fallbackCommissionRatePct float64) (*AdminDealerStateReportEmailResponse, error) {
	if s.reportEmail == nil {
		return nil, ErrRevenueReportEmailDisabled
	}
	reportSet, err := s.GetAdminStateReports(ctx, year, month, fallbackCommissionRatePct)
	if err != nil {
		return nil, err
	}

	var selected *repository.AdminDealerStateReport
	for i := range reportSet.Reports {
		if reportSet.Reports[i].DealerID == dealerID {
			selected = &reportSet.Reports[i]
			break
		}
	}
	if selected == nil {
		return nil, ErrRevenueReportDealerMissing
	}
	if strings.TrimSpace(selected.Email) == "" {
		return nil, ErrRevenueReportDealerNoEmail
	}

	scope := fmt.Sprintf("%s - %04d-%02d", selected.StateName, reportSet.Year, reportSet.Month)
	subject := "RawDrive dealer revenue report - " + scope
	body := buildAdminDealerStateReportText(reportSet, *selected)
	if sender, ok := s.reportEmail.(RevenueReportAttachmentEmailSender); ok {
		renderer := s.pdf
		if renderer == nil {
			renderer = NewPDFService()
		}
		pdf, err := renderer.RenderText(body)
		if err != nil {
			return nil, err
		}
		if err := sender.SendWithAttachment(
			ctx,
			selected.Email,
			subject,
			body,
			"",
			adminDealerStateReportPDFName(reportSet, *selected),
			"application/pdf",
			pdf,
		); err != nil {
			return nil, err
		}
	} else if err := s.reportEmail.Send(ctx, selected.Email, subject, body, ""); err != nil {
		return nil, err
	}

	return &AdminDealerStateReportEmailResponse{
		SentTo:       selected.Email,
		DealerID:     selected.DealerID.String(),
		BusinessName: selected.BusinessName,
	}, nil
}

func summarizeAdminStateReportTotals(reports []repository.AdminDealerStateReport) (totalSubscription, totalDealerShare int64) {
	seenState := map[int]struct{}{}
	for _, report := range reports {
		if _, seen := seenState[report.StateID]; seen {
			continue
		}
		seenState[report.StateID] = struct{}{}
		totalSubscription += report.TotalSubscriptionPaisa
		totalDealerShare += report.DealerSharePaisa
	}
	return totalSubscription, totalDealerShare
}

func buildAdminDealerStateReportText(reportSet *AdminDealerStateReportsResponse, report repository.AdminDealerStateReport) string {
	var b strings.Builder
	fmt.Fprintf(&b, "RawDrive Dealer Revenue Report\n")
	fmt.Fprintf(&b, "Dealer: %s\n", report.BusinessName)
	fmt.Fprintf(&b, "Dealer email: %s\n", report.Email)
	fmt.Fprintf(&b, "State: %s\n", report.StateName)
	fmt.Fprintf(&b, "Report month: %04d-%02d\n", reportSet.Year, reportSet.Month)
	fmt.Fprintf(&b, "Period: %s to %s\n\n",
		reportSet.PeriodStart.Format(time.RFC3339),
		reportSet.PeriodEnd.Format(time.RFC3339),
	)
	fmt.Fprintf(&b, "Status: %s\n", report.Status)
	fmt.Fprintf(&b, "Territory: %s\n", report.TerritoryType)
	fmt.Fprintf(&b, "Commission rate: %.2f%%\n", report.CommissionRatePct)
	fmt.Fprintf(&b, "State revenue: %s\n", formatReportINR(report.TotalSubscriptionPaisa))
	fmt.Fprintf(&b, "Subscribers: %d\n", report.SubscriberCount)
	fmt.Fprintf(&b, "Projected dealer share: %s\n", formatReportINR(report.DealerSharePaisa))
	fmt.Fprintf(&b, "\nThis report is generated from active, paid subscriptions attributed to the dealer's state for the selected month.\n")
	return b.String()
}

func adminDealerStateReportPDFName(reportSet *AdminDealerStateReportsResponse, report repository.AdminDealerStateReport) string {
	return fmt.Sprintf(
		"dealer-revenue-report-%s-%04d-%02d.pdf",
		revenueReportFilenamePart(report.BusinessName),
		reportSet.Year,
		reportSet.Month,
	)
}

// GetDashboard returns dealer dashboard metrics for the given period. Missing
// period defaults to current_month, matching the legacy behavior.
func (s *DealerAnalyticsService) GetDashboard(ctx context.Context, dealerID uuid.UUID, period Period, customFrom, customTo *time.Time) (*DealerDashboardResponse, error) {
	rng, err := ResolvePeriodRange(period, time.Now().UTC(), customFrom, customTo)
	if err != nil {
		return nil, err
	}

	total, active, churned, err := s.analyticsRepo.GetReferralCounts(ctx, dealerID)
	if err != nil {
		return nil, err
	}

	revenue, err := s.analyticsRepo.GetRevenueForPeriod(ctx, dealerID, rng.Start, rng.End)
	if err != nil {
		return nil, err
	}

	convRate := float64(0)
	if total > 0 {
		convRate = float64(active) / float64(total)
	}

	resolved := period
	if resolved == "" {
		resolved = PeriodCurrentMonth
	}
	return &DealerDashboardResponse{
		DealerID:             dealerID,
		Period:               resolved,
		PeriodStart:          rng.Start,
		PeriodEnd:            rng.End,
		TotalReferrals:       total,
		ActiveSubscriptions:  active,
		ChurnedSubscriptions: churned,
		TotalEarnedPaisa:     revenue,
		ConversionRate:       convRate,
	}, nil
}
