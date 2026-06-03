package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
)

// GalleryAnalyticsService handles gallery analytics tracking and retrieval.
type GalleryAnalyticsService struct {
	analyticsRepo      *repository.GalleryAnalyticsRepo
	assetAnalyticsRepo *repository.GalleryAssetAnalyticsRepo
}

// NewGalleryAnalyticsService creates a new GalleryAnalyticsService.
func NewGalleryAnalyticsService(ar *repository.GalleryAnalyticsRepo) *GalleryAnalyticsService {
	return &GalleryAnalyticsService{analyticsRepo: ar}
}

// WithAssetAnalyticsRepo enables per-photo top asset analytics for gallery
// workspace insights without changing existing constructor call sites.
func (s *GalleryAnalyticsService) WithAssetAnalyticsRepo(repo *repository.GalleryAssetAnalyticsRepo) *GalleryAnalyticsService {
	s.assetAnalyticsRepo = repo
	return s
}

// TrackEvent records a raw analytics event (fire-and-forget pattern).
func (s *GalleryAnalyticsService) TrackEvent(ctx context.Context, galleryID uuid.UUID, eventType string, assetID *uuid.UUID, ip, ua, email, referrer, deviceType string) {
	event := &repository.GalleryAnalyticsEvent{
		GalleryID:        galleryID,
		EventType:        eventType,
		AssetID:          assetID,
		VisitorIP:        ip,
		VisitorUserAgent: ua,
		VisitorEmail:     email,
		Referrer:         referrer,
		DeviceType:       deviceType,
	}
	_ = s.analyticsRepo.TrackEvent(ctx, event) // fire-and-forget
}

// GetDailyStats returns daily analytics for a gallery in a date range.
func (s *GalleryAnalyticsService) GetDailyStats(ctx context.Context, galleryID uuid.UUID, days int) ([]repository.GalleryAnalyticsDaily, error) {
	endDate := time.Now()
	startDate := endDate.AddDate(0, 0, -days)
	return s.analyticsRepo.GetDailyStats(ctx, galleryID, startDate, endDate)
}

// GetSummary returns aggregate analytics for a gallery.
func (s *GalleryAnalyticsService) GetSummary(ctx context.Context, galleryID uuid.UUID, days int) (map[string]int64, error) {
	return s.analyticsRepo.GetGallerySummary(ctx, galleryID, days)
}

// TopViewed returns top viewed gallery assets. A nil repo degrades to an
// empty list so older route wiring remains safe.
func (s *GalleryAnalyticsService) TopViewed(ctx context.Context, galleryID uuid.UUID, limit int) ([]repository.AssetAnalytics, error) {
	if s.assetAnalyticsRepo == nil {
		return []repository.AssetAnalytics{}, nil
	}
	return s.assetAnalyticsRepo.TopViewed(ctx, galleryID, limit)
}

// TopDownloaded returns top downloaded gallery assets.
func (s *GalleryAnalyticsService) TopDownloaded(ctx context.Context, galleryID uuid.UUID, limit int) ([]repository.AssetAnalytics, error) {
	if s.assetAnalyticsRepo == nil {
		return []repository.AssetAnalytics{}, nil
	}
	return s.assetAnalyticsRepo.TopDownloaded(ctx, galleryID, limit)
}
