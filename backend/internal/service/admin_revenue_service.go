package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

type RevenueDashboard struct {
	MRRPaisa  int64   `json:"mrr_paisa"`
	ARRPaisa  int64   `json:"arr_paisa"`
	ChurnRate float64 `json:"churn_rate"`
	LTVPaisa  int64   `json:"ltv_paisa"`
	ARPUPaisa int64   `json:"arpu_paisa"`
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
	return &RevenueDashboard{
		MRRPaisa:  metrics.MRR,
		ARRPaisa:  metrics.ARR,
		ChurnRate: metrics.ChurnRate,
		LTVPaisa:  metrics.LTV,
		ARPUPaisa: metrics.ARPU,
	}, nil
}

func (s *AdminRevenueService) GetTimeSeries(ctx context.Context, from, to time.Time, granularity string) ([]repository.RevenueTimeSeries, error) {
	return s.revenueRepo.GetTimeSeries(ctx, from, to, granularity)
}

func (s *AdminRevenueService) GetStateBreakdown(ctx context.Context, from, to time.Time) ([]repository.StateRevenue, error) {
	return s.revenueRepo.GetByState(ctx, from, to)
}
