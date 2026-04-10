package service

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

var (
	ErrPayoutAlreadyExists  = errors.New("payout already exists for this period")
	ErrBelowThreshold       = errors.New("net payable below minimum threshold")
	ErrInvalidPayoutTransition = errors.New("invalid payout status transition")
)

const DefaultMinPayoutPaisa = int64(100000) // Rs. 1,000

type PayoutService struct {
	repo          *repository.PayoutRepo
	marginSvc     *MarginService
	analyticsRepo *repository.DealerAnalyticsRepo
}

func NewPayoutService(repo *repository.PayoutRepo, marginSvc *MarginService) *PayoutService {
	return &PayoutService{repo: repo, marginSvc: marginSvc}
}

// CalculateMonthlyPayout computes a dealer's payout for the given month.
func (s *PayoutService) CalculateMonthlyPayout(ctx context.Context, dealerID uuid.UUID, stateID int, year, month int) (*repository.Payout, error) {
	periodStart := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.UTC)
	periodEnd := periodStart.AddDate(0, 1, -1) // last day of month

	// Check for existing payout
	_, err := s.repo.GetForPeriod(ctx, dealerID, periodStart, periodEnd)
	if err == nil {
		return nil, ErrPayoutAlreadyExists
	}

	// Resolve margin (simplified — uses state-level margin)
	margin, err := s.marginSvc.ResolveMargin(ctx, dealerID, stateID, "dealer", "subscription", periodStart)
	if err != nil {
		// Fallback to default if no margin configured
		margin = &ResolvedMargin{DealerPct: 15, PlatformPct: 85, CalculationBasis: "net_of_gst", Source: "default"}
	}

	// Aggregate revenue from dealer attributions for the period
	grossRevenue := int64(0)
	if s.analyticsRepo != nil {
		rev, err := s.analyticsRepo.GetRevenueForPeriod(ctx, dealerID, periodStart, periodEnd)
		if err == nil {
			grossRevenue = rev
		}
	}
	commissionEarned := CalculateCommission(grossRevenue, margin.DealerPct)
	tdsWithheld := commissionEarned * 10 / 100 // 10% TDS
	netPayable := commissionEarned - tdsWithheld

	marginSnapshot, _ := json.Marshal(margin)

	payout := &repository.Payout{
		DealerID:               dealerID,
		StateID:                &stateID,
		PeriodStart:            periodStart,
		PeriodEnd:              periodEnd,
		GrossAttributedRevenue: grossRevenue,
		CommissionEarned:       commissionEarned,
		TDSWithheld:            tdsWithheld,
		NetPayable:             netPayable,
		Status:                 "draft",
		MarginRatioSnapshot:    marginSnapshot,
		LineItems:              json.RawMessage(`[]`),
	}

	if err := s.repo.Create(ctx, payout); err != nil {
		return nil, err
	}
	return payout, nil
}

// ApprovePayout transitions pending → approved.
func (s *PayoutService) ApprovePayout(ctx context.Context, payoutID, adminID uuid.UUID) error {
	p, err := s.repo.GetByID(ctx, payoutID)
	if err != nil {
		return err
	}
	if p.Status != "pending" {
		return ErrInvalidPayoutTransition
	}
	return s.repo.UpdateStatus(ctx, payoutID, "approved", &adminID)
}

// CalculateMonthlyPayoutsForAllDealers runs CalculateMonthlyPayout for every
// approved dealer for the previous calendar month, relative to `now`. It's
// the entry point the scheduler calls on the 1st of each month. Individual
// dealer errors are collected but do not halt the batch — the scheduler
// logs the aggregate error count.
//
// dealerRepo is passed explicitly (rather than stored on the service) so we
// don't have to modify the existing NewPayoutService signature that tests
// depend on.
func (s *PayoutService) CalculateMonthlyPayoutsForAllDealers(ctx context.Context, dealerRepo *repository.DealerRepo, now time.Time) (processed, failed int, err error) {
	// Previous month relative to `now`.
	firstOfThisMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	prevMonth := firstOfThisMonth.AddDate(0, -1, 0)
	year, month := prevMonth.Year(), int(prevMonth.Month())

	// Paginate through approved dealers.
	var cursor *time.Time
	for {
		page, listErr := dealerRepo.List(ctx, repository.DealerFilter{
			Status: "approved",
			Limit:  100,
			Cursor: cursor,
		})
		if listErr != nil {
			return processed, failed, listErr
		}
		if len(page) == 0 {
			break
		}
		for _, d := range page {
			_, perDealerErr := s.CalculateMonthlyPayout(ctx, d.ID, d.StateID, year, month)
			if perDealerErr != nil {
				// Skip dealers that already have a payout for the period;
				// count only genuine failures.
				if errors.Is(perDealerErr, ErrPayoutAlreadyExists) {
					continue
				}
				failed++
				continue
			}
			processed++
		}
		if len(page) < 100 {
			break
		}
		// Cursor = last created_at of the page for next iteration.
		last := page[len(page)-1].CreatedAt
		cursor = &last
	}
	return processed, failed, nil
}

// ConfirmPayment transitions processing → paid.
func (s *PayoutService) ConfirmPayment(ctx context.Context, payoutID uuid.UUID, paymentRef string) error {
	p, err := s.repo.GetByID(ctx, payoutID)
	if err != nil {
		return err
	}
	if p.Status != "processing" {
		return ErrInvalidPayoutTransition
	}
	return s.repo.MarkPaid(ctx, payoutID, paymentRef)
}
