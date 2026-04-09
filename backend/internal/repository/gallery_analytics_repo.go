package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// GalleryAnalyticsEvent represents a raw analytics event.
type GalleryAnalyticsEvent struct {
	ID               uuid.UUID  `json:"id"`
	GalleryID        uuid.UUID  `json:"gallery_id"`
	EventType        string     `json:"event_type"`
	AssetID          *uuid.UUID `json:"asset_id,omitempty"`
	VisitorIP        string     `json:"visitor_ip,omitempty"`
	VisitorUserAgent string     `json:"visitor_user_agent,omitempty"`
	VisitorEmail     string     `json:"visitor_email,omitempty"`
	Referrer         string     `json:"referrer,omitempty"`
	DeviceType       string     `json:"device_type,omitempty"`
	Metadata         []byte     `json:"metadata,omitempty"`
	CreatedAt        time.Time  `json:"created_at"`
}

// GalleryAnalyticsDaily represents an aggregated daily analytics row.
type GalleryAnalyticsDaily struct {
	ID                uuid.UUID `json:"id"`
	GalleryID         uuid.UUID `json:"gallery_id"`
	Date              time.Time `json:"date"`
	Views             int       `json:"views"`
	UniqueVisitors    int       `json:"unique_visitors"`
	Downloads         int       `json:"downloads"`
	Favorites         int       `json:"favorites"`
	Shares            int       `json:"shares"`
	ProofingActions   int       `json:"proofing_actions"`
	DeviceBreakdown   []byte    `json:"device_breakdown,omitempty"`
	ReferrerBreakdown []byte    `json:"referrer_breakdown,omitempty"`
}

// GalleryAnalyticsRepo handles analytics persistence.
type GalleryAnalyticsRepo struct {
	pool *pgxpool.Pool
}

// NewGalleryAnalyticsRepo creates a new GalleryAnalyticsRepo.
func NewGalleryAnalyticsRepo(pool *pgxpool.Pool) *GalleryAnalyticsRepo {
	return &GalleryAnalyticsRepo{pool: pool}
}

// TrackEvent records a raw analytics event.
func (r *GalleryAnalyticsRepo) TrackEvent(ctx context.Context, event *GalleryAnalyticsEvent) error {
	if event.ID == uuid.Nil {
		event.ID = uuid.New()
	}
	event.CreatedAt = time.Now()

	_, err := r.pool.Exec(ctx,
		`INSERT INTO gallery_analytics_events (id, gallery_id, event_type, asset_id, visitor_ip, visitor_user_agent, visitor_email, referrer, device_type, metadata, created_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
		event.ID, event.GalleryID, event.EventType, event.AssetID, event.VisitorIP, event.VisitorUserAgent, event.VisitorEmail, event.Referrer, event.DeviceType, event.Metadata, event.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("analytics event track: %w", err)
	}
	return nil
}

// GetDailyStats returns daily analytics for a gallery in a date range.
func (r *GalleryAnalyticsRepo) GetDailyStats(ctx context.Context, galleryID uuid.UUID, startDate, endDate time.Time) ([]GalleryAnalyticsDaily, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, gallery_id, date, views, unique_visitors, downloads, favorites, shares, proofing_actions, device_breakdown, referrer_breakdown
		 FROM gallery_analytics_daily WHERE gallery_id = $1 AND date >= $2 AND date <= $3 ORDER BY date`,
		galleryID, startDate, endDate,
	)
	if err != nil {
		return nil, fmt.Errorf("analytics daily get: %w", err)
	}
	defer rows.Close()

	var stats []GalleryAnalyticsDaily
	for rows.Next() {
		var s GalleryAnalyticsDaily
		if err := rows.Scan(&s.ID, &s.GalleryID, &s.Date, &s.Views, &s.UniqueVisitors, &s.Downloads, &s.Favorites, &s.Shares, &s.ProofingActions, &s.DeviceBreakdown, &s.ReferrerBreakdown); err != nil {
			return nil, fmt.Errorf("analytics daily scan: %w", err)
		}
		stats = append(stats, s)
	}
	return stats, nil
}

// GetGallerySummary returns aggregate analytics for a gallery (last N days).
func (r *GalleryAnalyticsRepo) GetGallerySummary(ctx context.Context, galleryID uuid.UUID, days int) (map[string]int64, error) {
	var views, uniqueVisitors, downloads, favorites, shares int64
	err := r.pool.QueryRow(ctx,
		`SELECT COALESCE(SUM(views),0), COALESCE(SUM(unique_visitors),0), COALESCE(SUM(downloads),0), COALESCE(SUM(favorites),0), COALESCE(SUM(shares),0)
		 FROM gallery_analytics_daily WHERE gallery_id = $1 AND date >= now() - ($2 || ' days')::interval`,
		galleryID, fmt.Sprintf("%d", days),
	).Scan(&views, &uniqueVisitors, &downloads, &favorites, &shares)
	if err != nil {
		return nil, fmt.Errorf("analytics summary: %w", err)
	}
	return map[string]int64{
		"views": views, "unique_visitors": uniqueVisitors, "downloads": downloads,
		"favorites": favorites, "shares": shares,
	}, nil
}

// UpsertDaily upserts a daily analytics row.
func (r *GalleryAnalyticsRepo) UpsertDaily(ctx context.Context, daily *GalleryAnalyticsDaily) error {
	if daily.ID == uuid.Nil {
		daily.ID = uuid.New()
	}
	_, err := r.pool.Exec(ctx,
		`INSERT INTO gallery_analytics_daily (id, gallery_id, date, views, unique_visitors, downloads, favorites, shares, proofing_actions, device_breakdown, referrer_breakdown)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
		 ON CONFLICT (gallery_id, date) DO UPDATE SET
		   views = gallery_analytics_daily.views + EXCLUDED.views,
		   unique_visitors = EXCLUDED.unique_visitors,
		   downloads = gallery_analytics_daily.downloads + EXCLUDED.downloads,
		   favorites = gallery_analytics_daily.favorites + EXCLUDED.favorites,
		   shares = gallery_analytics_daily.shares + EXCLUDED.shares,
		   proofing_actions = gallery_analytics_daily.proofing_actions + EXCLUDED.proofing_actions`,
		daily.ID, daily.GalleryID, daily.Date, daily.Views, daily.UniqueVisitors, daily.Downloads, daily.Favorites, daily.Shares, daily.ProofingActions, daily.DeviceBreakdown, daily.ReferrerBreakdown,
	)
	if err != nil {
		return fmt.Errorf("analytics daily upsert: %w", err)
	}
	return nil
}
