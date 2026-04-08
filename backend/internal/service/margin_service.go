package service

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

var (
	ErrInvalidMarginSum = errors.New("dealer_pct + platform_pct must equal 100")
	ErrRetroactiveDate  = errors.New("effective_from must be today or in the future")
	ErrNoMarginConfig   = errors.New("no margin configuration found")
)

type ResolvedMargin struct {
	DealerPct        float64   `json:"dealer_pct"`
	PlatformPct      float64   `json:"platform_pct"`
	CalculationBasis string    `json:"calculation_basis"`
	Source           string    `json:"source"` // global|state|dealer
	EffectiveFrom    time.Time `json:"effective_from"`
}

type MarginService struct {
	repo      *repository.MarginRepo
	dealerRepo *repository.DealerRepo
}

func NewMarginService(repo *repository.MarginRepo, dealerRepo *repository.DealerRepo) *MarginService {
	return &MarginService{repo: repo, dealerRepo: dealerRepo}
}

func (s *MarginService) ConfigureMargin(ctx context.Context, m *repository.MarginRatio) error {
	if m.DealerPct+m.PlatformPct != 100 {
		return ErrInvalidMarginSum
	}
	today := time.Now().UTC().Truncate(24 * time.Hour)
	if m.EffectiveFrom.Before(today) {
		return ErrRetroactiveDate
	}
	return s.repo.Create(ctx, m)
}

func (s *MarginService) ResolveMargin(ctx context.Context, dealerID uuid.UUID, stateID int, channel, productType string, asOf time.Time) (*ResolvedMargin, error) {
	// Level 1: Dealer-level override
	dealer, err := s.dealerRepo.GetByID(ctx, dealerID)
	if err == nil && dealer.CommissionRatePct != nil {
		return &ResolvedMargin{
			DealerPct:        *dealer.CommissionRatePct,
			PlatformPct:      100 - *dealer.CommissionRatePct,
			CalculationBasis: "net_of_gst",
			Source:           "dealer",
			EffectiveFrom:    dealer.CreatedAt,
		}, nil
	}

	// Level 2: State-level ratio
	stateRatio, err := s.repo.GetByState(ctx, stateID, channel, productType, asOf)
	if err == nil {
		return &ResolvedMargin{
			DealerPct:        stateRatio.DealerPct,
			PlatformPct:      stateRatio.PlatformPct,
			CalculationBasis: stateRatio.CalculationBasis,
			Source:           "state",
			EffectiveFrom:    stateRatio.EffectiveFrom,
		}, nil
	}

	// Level 3: Global default
	global, err := s.repo.GetGlobalDefault(ctx, channel, productType, asOf)
	if err == nil {
		return &ResolvedMargin{
			DealerPct:        global.DealerPct,
			PlatformPct:      global.PlatformPct,
			CalculationBasis: global.CalculationBasis,
			Source:           "global",
			EffectiveFrom:    global.EffectiveFrom,
		}, nil
	}

	return nil, ErrNoMarginConfig
}

func (s *MarginService) ListCurrentMargins(ctx context.Context, stateID *int) ([]repository.MarginRatio, error) {
	return s.repo.ListCurrent(ctx, stateID)
}

// ListAllMargins returns all margin ratios including expired ones (full version history).
func (s *MarginService) ListAllMargins(ctx context.Context, stateID *int) ([]repository.MarginRatio, error) {
	return s.repo.ListAll(ctx, stateID)
}
