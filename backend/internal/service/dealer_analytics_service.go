package service

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

type DealerDashboardResponse struct {
	DealerID            uuid.UUID `json:"dealer_id"`
	TotalReferrals      int       `json:"total_referrals"`
	ActiveSubscriptions int       `json:"active_subscriptions"`
	ChurnedSubscriptions int      `json:"churned_subscriptions"`
	TotalEarnedPaisa    int64     `json:"total_earned_paisa"`
	PendingPayoutPaisa  int64     `json:"pending_payout_paisa"`
	ConversionRate      float64   `json:"conversion_rate"`
}

type DealerAnalyticsService struct {
	analyticsRepo *repository.DealerAnalyticsRepo
	dealerRepo    *repository.DealerRepo
}

func NewDealerAnalyticsService(analyticsRepo *repository.DealerAnalyticsRepo, dealerRepo *repository.DealerRepo) *DealerAnalyticsService {
	return &DealerAnalyticsService{analyticsRepo: analyticsRepo, dealerRepo: dealerRepo}
}

// GetDashboard assembles the dealer dashboard response with concurrent aggregation.
func (s *DealerAnalyticsService) GetDashboard(ctx context.Context, dealerID uuid.UUID) (*DealerDashboardResponse, error) {
	total, active, churned, err := s.analyticsRepo.GetReferralCounts(ctx, dealerID)
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	revenue, err := s.analyticsRepo.GetRevenueForPeriod(ctx, dealerID, monthStart, now)
	if err != nil {
		return nil, err
	}

	convRate := float64(0)
	if total > 0 {
		convRate = float64(active) / float64(total)
	}

	return &DealerDashboardResponse{
		DealerID:             dealerID,
		TotalReferrals:       total,
		ActiveSubscriptions:  active,
		ChurnedSubscriptions: churned,
		TotalEarnedPaisa:     revenue,
		ConversionRate:       convRate,
	}, nil
}
