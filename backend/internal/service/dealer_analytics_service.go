package service

import (
	"context"
	"errors"
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
}

func NewDealerAnalyticsService(analyticsRepo *repository.DealerAnalyticsRepo, dealerRepo *repository.DealerRepo) *DealerAnalyticsService {
	return &DealerAnalyticsService{analyticsRepo: analyticsRepo, dealerRepo: dealerRepo}
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
