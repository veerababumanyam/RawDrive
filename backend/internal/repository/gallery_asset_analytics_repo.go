package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AssetAnalytics represents per-photo analytics for a gallery asset.
type AssetAnalytics struct {
	ID           uuid.UUID  `json:"id"`
	GalleryID    uuid.UUID  `json:"gallery_id"`
	AssetID      uuid.UUID  `json:"asset_id"`
	Views        int        `json:"views"`
	Downloads    int        `json:"downloads"`
	Favorites    int        `json:"favorites"`
	LastViewedAt *time.Time `json:"last_viewed_at,omitempty"`
}

// GalleryAssetAnalyticsRepo provides persistence for per-photo analytics.
type GalleryAssetAnalyticsRepo struct {
	pool *pgxpool.Pool
}

// NewGalleryAssetAnalyticsRepo creates a new repo.
func NewGalleryAssetAnalyticsRepo(pool *pgxpool.Pool) *GalleryAssetAnalyticsRepo {
	return &GalleryAssetAnalyticsRepo{pool: pool}
}

// IncrementView atomically increments the view count for an asset.
func (r *GalleryAssetAnalyticsRepo) IncrementView(ctx context.Context, galleryID, assetID uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO gallery_asset_analytics (gallery_id, asset_id, views, last_viewed_at)
		 VALUES ($1, $2, 1, NOW())
		 ON CONFLICT (gallery_id, asset_id)
		 DO UPDATE SET views = gallery_asset_analytics.views + 1, last_viewed_at = NOW()`,
		galleryID, assetID,
	)
	if err != nil {
		return fmt.Errorf("increment asset view: %w", err)
	}
	return nil
}

// IncrementDownload atomically increments the download count for an asset.
func (r *GalleryAssetAnalyticsRepo) IncrementDownload(ctx context.Context, galleryID, assetID uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO gallery_asset_analytics (gallery_id, asset_id, downloads)
		 VALUES ($1, $2, 1)
		 ON CONFLICT (gallery_id, asset_id)
		 DO UPDATE SET downloads = gallery_asset_analytics.downloads + 1`,
		galleryID, assetID,
	)
	if err != nil {
		return fmt.Errorf("increment asset download: %w", err)
	}
	return nil
}

// TopViewed returns the most-viewed assets in a gallery.
func (r *GalleryAssetAnalyticsRepo) TopViewed(ctx context.Context, galleryID uuid.UUID, limit int) ([]AssetAnalytics, error) {
	if limit <= 0 {
		limit = 10
	}
	rows, err := r.pool.Query(ctx,
		`SELECT id, gallery_id, asset_id, views, downloads, favorites, last_viewed_at
		 FROM gallery_asset_analytics
		 WHERE gallery_id = $1 AND views > 0
		 ORDER BY views DESC LIMIT $2`,
		galleryID, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("top viewed: %w", err)
	}
	defer rows.Close()
	return scanAssetAnalytics(rows)
}

// TopDownloaded returns the most-downloaded assets in a gallery.
func (r *GalleryAssetAnalyticsRepo) TopDownloaded(ctx context.Context, galleryID uuid.UUID, limit int) ([]AssetAnalytics, error) {
	if limit <= 0 {
		limit = 10
	}
	rows, err := r.pool.Query(ctx,
		`SELECT id, gallery_id, asset_id, views, downloads, favorites, last_viewed_at
		 FROM gallery_asset_analytics
		 WHERE gallery_id = $1 AND downloads > 0
		 ORDER BY downloads DESC LIMIT $2`,
		galleryID, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("top downloaded: %w", err)
	}
	defer rows.Close()
	return scanAssetAnalytics(rows)
}

func scanAssetAnalytics(rows interface {
	Next() bool
	Scan(...any) error
	Err() error
}) ([]AssetAnalytics, error) {
	var results []AssetAnalytics
	for rows.Next() {
		var a AssetAnalytics
		if err := rows.Scan(&a.ID, &a.GalleryID, &a.AssetID, &a.Views, &a.Downloads, &a.Favorites, &a.LastViewedAt); err != nil {
			return nil, fmt.Errorf("scan asset analytics: %w", err)
		}
		results = append(results, a)
	}
	return results, rows.Err()
}
