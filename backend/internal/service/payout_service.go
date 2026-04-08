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
	repo      *repository.PayoutRepo
	marginSvc *MarginService
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

	// Placeholder revenue — in real impl, aggregate from dealer_attributions + invoices
	grossRevenue := int64(0) // Would come from analytics repo
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
