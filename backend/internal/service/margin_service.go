package service

import (
	"context"
	"errors"
	"math"
	"time"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
)

// marginSumTolerance is the allowed absolute deviation when validating that
// dealer_pct + platform_pct == 100. Percentages are stored as float64, and
// IEEE-754 addition cannot always represent a decimal sum of exactly 100.0
// (e.g. operands carrying accumulated representation error). An exact equality
// check (`sum != 100`) would wrongly reject otherwise-valid fractional splits,
// so we compare within a small tolerance instead. 0.001 (0.001 percentage
// points) is far larger than the ~1e-13 float error yet far smaller than any
// meaningful business split granularity.
const marginSumTolerance = 0.001

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
	repo       *repository.MarginRepo
	dealerRepo *repository.DealerRepo
}

func NewMarginService(repo *repository.MarginRepo, dealerRepo *repository.DealerRepo) *MarginService {
	return &MarginService{repo: repo, dealerRepo: dealerRepo}
}

func (s *MarginService) ConfigureMargin(ctx context.Context, m *repository.MarginRatio) error {
	if math.Abs(m.DealerPct+m.PlatformPct-100) > marginSumTolerance {
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
