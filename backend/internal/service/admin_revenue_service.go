package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

type RevenueDashboard struct {
	MRRPaisa         int64                      `json:"mrr_paisa"`
	ARRPaisa         int64                      `json:"arr_paisa"`
	ChurnRate        float64                    `json:"churn_rate"`
	LTVPaisa         int64                      `json:"ltv_paisa"`
	ARPUPaisa        int64                      `json:"arpu_paisa"`
	TotalSubscribers int64                      `json:"total_subscribers"`
	StateBreakdown   []repository.StateRevenue  `json:"state_breakdown"`
}

type AdminRevenueService struct {
	revenueRepo *repository.AdminRevenueRepo
}

func NewAdminRevenueService(revenueRepo *repository.AdminRevenueRepo) *AdminRevenueService {
	return &AdminRevenueService{revenueRepo: revenueRepo}
}

func (s *AdminRevenueService) GetDashboard(ctx context.Context, from, to time.Time, stateID *uuid.UUID) (*RevenueDashboard, error) {
	metrics, err := s.revenueRepo.GetMetrics(ctx, from, to, stateID)
	if err != nil {
		return nil, fmt.Errorf("fetching revenue metrics: %w", err)
	}
	// The admin revenue page renders MRR/ARR, Subscribers, and a
	// state-breakdown table in one go. Previously the dashboard only
	// returned the metrics row and the page had to either call two more
	// endpoints or render "undefined" — which is exactly what it did
	// until the 2026-04-12 UAT caught it. Aggregating the state bucket
	// and a subscriber count here turns one /admin/revenue call into a
	// complete payload.
	state, err := s.revenueRepo.GetByState(ctx, from, to)
	if err != nil {
		return nil, fmt.Errorf("fetching state breakdown: %w", err)
	}
	var totalSubs int64
	for _, row := range state {
		totalSubs += row.SubscriberCount
	}
	// Preserve the old empty-but-non-nil contract: the frontend defaults
	// state_breakdown to [] and will happily iterate, but nil would be
	// encoded as JSON null and produce a .map() crash on the client.
	if state == nil {
		state = []repository.StateRevenue{}
	}
	return &RevenueDashboard{
		MRRPaisa:         metrics.MRR,
		ARRPaisa:         metrics.ARR,
		ChurnRate:        metrics.ChurnRate,
		LTVPaisa:         metrics.LTV,
		ARPUPaisa:        metrics.ARPU,
		TotalSubscribers: totalSubs,
		StateBreakdown:   state,
	}, nil
}

func (s *AdminRevenueService) GetTimeSeries(ctx context.Context, from, to time.Time, granularity string) ([]repository.RevenueTimeSeries, error) {
	return s.revenueRepo.GetTimeSeries(ctx, from, to, granularity)
}

func (s *AdminRevenueService) GetStateBreakdown(ctx context.Context, from, to time.Time) ([]repository.StateRevenue, error) {
	return s.revenueRepo.GetByState(ctx, from, to)
}
