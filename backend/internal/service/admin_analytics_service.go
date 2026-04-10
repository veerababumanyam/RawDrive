package service

import (
	"context"
	"time"

	"github.com/rawdrive/backend/internal/repository"
)

// AnalyticsEngagement matches the frontend EngagementMetrics interface
// (frontend/src/lib/api/admin.ts) exactly — the admin Analytics page
// renders DAU/WAU/MAU plus today's uploads, galleries, and a session
// duration average. All values are non-null integers.
//
// avg_session_minutes is reserved for a future sessions table; returned
// as 0 today so the card renders without crashing.
type AnalyticsEngagement struct {
	DAU               int64 `json:"dau"`
	WAU               int64 `json:"wau"`
	MAU               int64 `json:"mau"`
	UploadsToday      int64 `json:"uploads_today"`
	GalleriesCreated  int64 `json:"galleries_created"`
	AvgSessionMinutes int64 `json:"avg_session_minutes"`
}

// AnalyticsGrowth matches the frontend GrowthMetrics interface. The
// timeseries is a list of daily buckets with cumulative rollup; total
// users and new-users windows are scalar headline cards.
type AnalyticsGrowth struct {
	TotalUsers     int64                                `json:"total_users"`
	NewUsersToday  int64                                `json:"new_users_today"`
	NewUsersWeek   int64                                `json:"new_users_week"`
	NewUsersMonth  int64                                `json:"new_users_month"`
	Timeseries     []repository.GrowthTimeSeriesPoint   `json:"timeseries"`
}

type AdminAnalyticsService struct {
	analyticsRepo *repository.AdminAnalyticsRepo
}

func NewAdminAnalyticsService(analyticsRepo *repository.AdminAnalyticsRepo) *AdminAnalyticsService {
	return &AdminAnalyticsService{analyticsRepo: analyticsRepo}
}

// GetEngagement returns the full 6-field engagement snapshot the admin
// Analytics page expects. Composed of GetActiveUsers (DAU/WAU/MAU) plus
// today's upload + gallery counts.
func (s *AdminAnalyticsService) GetEngagement(ctx context.Context, date time.Time) (*AnalyticsEngagement, error) {
	active, err := s.analyticsRepo.GetActiveUsers(ctx, date)
	if err != nil {
		return nil, err
	}

	// "Today" starts at the beginning of the requested date.
	startOfDay := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, date.Location())

	uploads, err := s.analyticsRepo.CountAssetsCreatedSince(ctx, startOfDay)
	if err != nil {
		return nil, err
	}
	galleries, err := s.analyticsRepo.CountGalleriesCreatedSince(ctx, startOfDay)
	if err != nil {
		return nil, err
	}

	return &AnalyticsEngagement{
		DAU:               active.DAU,
		WAU:               active.WAU,
		MAU:               active.MAU,
		UploadsToday:      uploads,
		GalleriesCreated:  galleries,
		AvgSessionMinutes: 0, // reserved for sessions subsystem
	}, nil
}

// GetGrowth returns the full growth dashboard shape. "Today", "week",
// and "month" windows are computed from the requested `to` bound so the
// numbers are consistent with the timeseries on the same card.
func (s *AdminAnalyticsService) GetGrowth(ctx context.Context, from, to time.Time) (*AnalyticsGrowth, error) {
	total, err := s.analyticsRepo.CountTotalUsers(ctx)
	if err != nil {
		return nil, err
	}

	dayStart := time.Date(to.Year(), to.Month(), to.Day(), 0, 0, 0, 0, to.Location())
	newToday, err := s.analyticsRepo.CountUsersCreatedSince(ctx, dayStart)
	if err != nil {
		return nil, err
	}
	newWeek, err := s.analyticsRepo.CountUsersCreatedSince(ctx, to.AddDate(0, 0, -7))
	if err != nil {
		return nil, err
	}
	newMonth, err := s.analyticsRepo.CountUsersCreatedSince(ctx, to.AddDate(0, -1, 0))
	if err != nil {
		return nil, err
	}
	series, err := s.analyticsRepo.GetUserGrowthTimeSeries(ctx, from, to)
	if err != nil {
		return nil, err
	}
	if series == nil {
		series = []repository.GrowthTimeSeriesPoint{}
	}

	return &AnalyticsGrowth{
		TotalUsers:    total,
		NewUsersToday: newToday,
		NewUsersWeek:  newWeek,
		NewUsersMonth: newMonth,
		Timeseries:    series,
	}, nil
}

// GetFeatureAdoption returns the feature adoption list in the shape the
// frontend FeatureAdoption interface expects (feature / adoption_pct /
// active_users). The repo already matches this shape — this wrapper is
// kept for symmetry and to allow a future post-processing hook.
func (s *AdminAnalyticsService) GetFeatureAdoption(ctx context.Context) ([]repository.AnalyticsFeatureAdoption, error) {
	out, err := s.analyticsRepo.GetFeatureAdoption(ctx)
	if err != nil {
		return nil, err
	}
	if out == nil {
		out = []repository.AnalyticsFeatureAdoption{}
	}
	return out, nil
}
