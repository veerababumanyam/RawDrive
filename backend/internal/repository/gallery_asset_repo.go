package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// GalleryAsset represents the junction between galleries and assets.
type GalleryAsset struct {
	ID        uuid.UUID `json:"id"`
	GalleryID uuid.UUID `json:"gallery_id"`
	AssetID   uuid.UUID `json:"asset_id"`
	SortOrder int       `json:"sort_order"`
	IsHero    bool      `json:"is_hero"`
	AddedAt   time.Time `json:"added_at"`
}

// GalleryAssetRepo handles gallery-asset relationships.
type GalleryAssetRepo struct {
	pool *pgxpool.Pool
}

// NewGalleryAssetRepo creates a new GalleryAssetRepo.
func NewGalleryAssetRepo(pool *pgxpool.Pool) *GalleryAssetRepo {
	return &GalleryAssetRepo{pool: pool}
}

// Add links an asset to a gallery.
func (r *GalleryAssetRepo) Add(ctx context.Context, galleryID, assetID uuid.UUID, sortOrder int) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO gallery_assets (id, gallery_id, asset_id, sort_order, added_at)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (gallery_id, asset_id) DO UPDATE SET sort_order = EXCLUDED.sort_order`,
		uuid.New(), galleryID, assetID, sortOrder, time.Now(),
	)
	if err != nil {
		return fmt.Errorf("gallery asset add: %w", err)
	}
	return nil
}

// Remove unlinks an asset from a gallery.
func (r *GalleryAssetRepo) Remove(ctx context.Context, galleryID, assetID uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM gallery_assets WHERE gallery_id = $1 AND asset_id = $2`,
		galleryID, assetID,
	)
	if err != nil {
		return fmt.Errorf("gallery asset remove: %w", err)
	}
	return nil
}

// ListByGallery returns all assets in a gallery ordered by sort_order.
func (r *GalleryAssetRepo) ListByGallery(ctx context.Context, galleryID uuid.UUID) ([]GalleryAsset, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, gallery_id, asset_id, sort_order, is_hero, added_at
		 FROM gallery_assets WHERE gallery_id = $1 ORDER BY sort_order ASC`,
		galleryID,
	)
	if err != nil {
		return nil, fmt.Errorf("gallery asset list: %w", err)
	}
	defer rows.Close()

	var items []GalleryAsset
	for rows.Next() {
		var ga GalleryAsset
		if err := rows.Scan(&ga.ID, &ga.GalleryID, &ga.AssetID, &ga.SortOrder, &ga.IsHero, &ga.AddedAt); err != nil {
			return nil, fmt.Errorf("gallery asset list scan: %w", err)
		}
		items = append(items, ga)
	}
	return items, rows.Err()
}

// GetFirstAssetID returns the first asset ID in a gallery (by sort_order).
func (r *GalleryAssetRepo) GetFirstAssetID(ctx context.Context, galleryID uuid.UUID) (*uuid.UUID, error) {
	var assetID uuid.UUID
	err := r.pool.QueryRow(ctx,
		`SELECT asset_id FROM gallery_assets WHERE gallery_id = $1 ORDER BY sort_order ASC LIMIT 1`,
		galleryID,
	).Scan(&assetID)
	if err != nil {
		return nil, nil // no assets in gallery
	}
	return &assetID, nil
}

// ReorderItem represents a single asset sort order update.
type ReorderItem struct {
	AssetID   uuid.UUID
	SortOrder int
}

// Reorder updates sort_order for multiple assets in a single transaction.
func (r *GalleryAssetRepo) Reorder(ctx context.Context, galleryID uuid.UUID, items []ReorderItem) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("gallery asset reorder begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	for _, item := range items {
		if _, err := tx.Exec(ctx,
			`UPDATE gallery_assets SET sort_order=$1 WHERE gallery_id=$2 AND asset_id=$3`,
			item.SortOrder, galleryID, item.AssetID); err != nil {
			return fmt.Errorf("gallery asset reorder: %w", err)
		}
	}

	return tx.Commit(ctx)
}
