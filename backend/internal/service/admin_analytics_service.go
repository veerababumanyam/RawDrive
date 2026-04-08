package service

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

type EngagementDashboard struct {
	DAU int64 `json:"dau"`
	WAU int64 `json:"wau"`
	MAU int64 `json:"mau"`
}

type AdminAnalyticsService struct {
	analyticsRepo *repository.AdminAnalyticsRepo
}

func NewAdminAnalyticsService(analyticsRepo *repository.AdminAnalyticsRepo) *AdminAnalyticsService {
	return &AdminAnalyticsService{analyticsRepo: analyticsRepo}
}

func (s *AdminAnalyticsService) GetEngagement(ctx context.Context, date time.Time, stateID *uuid.UUID) (*EngagementDashboard, error) {
	active, err := s.analyticsRepo.GetActiveUsers(ctx, date, stateID)
	if err != nil {
		return nil, err
	}
	return &EngagementDashboard{DAU: active.DAU, WAU: active.WAU, MAU: active.MAU}, nil
}

func (s *AdminAnalyticsService) GetEngagementMetrics(ctx context.Context, from, to time.Time) (*repository.EngagementMetrics, error) {
	return s.analyticsRepo.GetEngagement(ctx, from, to)
}

func (s *AdminAnalyticsService) GetGrowth(ctx context.Context, from, to time.Time) ([]repository.TimeSeriesPoint, error) {
	return s.analyticsRepo.GetUserGrowthTimeSeries(ctx, from, to)
}

func (s *AdminAnalyticsService) GetFeatureAdoption(ctx context.Context) ([]repository.FeatureAdoption, error) {
	return s.analyticsRepo.GetFeatureAdoption(ctx)
}
