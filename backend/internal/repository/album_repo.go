package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Album represents a collection of assets within a gallery.
type Album struct {
	ID           uuid.UUID              `json:"id"`
	GalleryID    uuid.UUID              `json:"gallery_id"`
	ParentID     *uuid.UUID             `json:"parent_id,omitempty"`
	Name         string                 `json:"name"`
	Description  string                 `json:"description"`
	CoverAssetID *uuid.UUID             `json:"cover_asset_id,omitempty"`
	Position     int                    `json:"position"`
	SmartFilter  map[string]interface{} `json:"smart_filter,omitempty"`
	AssetCount   int                    `json:"asset_count"`
	CreatedAt    time.Time              `json:"created_at"`
	UpdatedAt    time.Time              `json:"updated_at"`
}

// AlbumAsset represents the junction between albums and assets.
type AlbumAsset struct {
	AlbumID  uuid.UUID `json:"album_id"`
	AssetID  uuid.UUID `json:"asset_id"`
	Position int       `json:"position"`
	AddedAt  time.Time `json:"added_at"`
}

// AlbumRepo handles album persistence.
type AlbumRepo struct {
	pool *pgxpool.Pool
}

// NewAlbumRepo creates a new AlbumRepo.
func NewAlbumRepo(pool *pgxpool.Pool) *AlbumRepo {
	return &AlbumRepo{pool: pool}
}

// Create inserts a new album.
func (r *AlbumRepo) Create(ctx context.Context, a *Album) error {
	if a.ID == uuid.Nil {
		a.ID = uuid.New()
	}
	a.CreatedAt = time.Now()
	a.UpdatedAt = a.CreatedAt

	_, err := r.pool.Exec(ctx,
		`INSERT INTO albums (id, gallery_id, parent_id, name, description, cover_asset_id, position, smart_filter, created_at, updated_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		a.ID, a.GalleryID, a.ParentID, a.Name, a.Description, a.CoverAssetID, a.Position, a.SmartFilter, a.CreatedAt, a.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("album repo create: %w", err)
	}
	return nil
}

// GetByID retrieves an album by ID.
func (r *AlbumRepo) GetByID(ctx context.Context, id uuid.UUID) (*Album, error) {
	a := &Album{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, gallery_id, parent_id, name, description, cover_asset_id, position, smart_filter, created_at, updated_at
		 FROM albums WHERE id = $1`, id,
	).Scan(&a.ID, &a.GalleryID, &a.ParentID, &a.Name, &a.Description, &a.CoverAssetID, &a.Position, &a.SmartFilter, &a.CreatedAt, &a.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("album repo get: %w", err)
	}
	return a, nil
}

// ListByGallery returns all albums for a gallery.
func (r *AlbumRepo) ListByGallery(ctx context.Context, galleryID uuid.UUID) ([]Album, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, gallery_id, parent_id, name, description, cover_asset_id, position, smart_filter, created_at, updated_at
		 FROM albums WHERE gallery_id = $1 ORDER BY position ASC`, galleryID,
	)
	if err != nil {
		return nil, fmt.Errorf("album repo list: %w", err)
	}
	defer rows.Close()

	var albums []Album
	for rows.Next() {
		var a Album
		if err := rows.Scan(&a.ID, &a.GalleryID, &a.ParentID, &a.Name, &a.Description, &a.CoverAssetID, &a.Position, &a.SmartFilter, &a.CreatedAt, &a.UpdatedAt); err != nil {
			return nil, fmt.Errorf("album repo scan: %w", err)
		}
		albums = append(albums, a)
	}
	return albums, rows.Err()
}

// GetBreadcrumb returns the parent chain for an album (recursive CTE).
func (r *AlbumRepo) GetBreadcrumb(ctx context.Context, albumID uuid.UUID) ([]Album, error) {
	rows, err := r.pool.Query(ctx,
		`WITH RECURSIVE chain AS (
			SELECT id, gallery_id, parent_id, name, description, cover_asset_id, position, smart_filter, created_at, updated_at
			FROM albums WHERE id = $1
			UNION ALL
			SELECT a.id, a.gallery_id, a.parent_id, a.name, a.description, a.cover_asset_id, a.position, a.smart_filter, a.created_at, a.updated_at
			FROM albums a INNER JOIN chain c ON a.id = c.parent_id
		) SELECT * FROM chain ORDER BY created_at ASC`, albumID,
	)
	if err != nil {
		return nil, fmt.Errorf("album repo breadcrumb: %w", err)
	}
	defer rows.Close()

	var chain []Album
	for rows.Next() {
		var a Album
		if err := rows.Scan(&a.ID, &a.GalleryID, &a.ParentID, &a.Name, &a.Description, &a.CoverAssetID, &a.Position, &a.SmartFilter, &a.CreatedAt, &a.UpdatedAt); err != nil {
			return nil, fmt.Errorf("album repo breadcrumb scan: %w", err)
		}
		chain = append(chain, a)
	}
	return chain, rows.Err()
}

// AddAsset adds an asset to an album.
func (r *AlbumRepo) AddAsset(ctx context.Context, albumID, assetID uuid.UUID, position int) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO album_assets (album_id, asset_id, position, added_at)
		 VALUES ($1, $2, $3, now())
		 ON CONFLICT (album_id, asset_id) DO UPDATE SET position = $3`,
		albumID, assetID, position,
	)
	if err != nil {
		return fmt.Errorf("album repo add asset: %w", err)
	}
	return nil
}

// RemoveAsset removes an asset from an album.
func (r *AlbumRepo) RemoveAsset(ctx context.Context, albumID, assetID uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM album_assets WHERE album_id = $1 AND asset_id = $2`,
		albumID, assetID,
	)
	if err != nil {
		return fmt.Errorf("album repo remove asset: %w", err)
	}
	return nil
}

// Delete removes an album.
func (r *AlbumRepo) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM albums WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("album repo delete: %w", err)
	}
	return nil
}
