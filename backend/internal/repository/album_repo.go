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

// UpdateMetadata updates editable album fields.
func (r *AlbumRepo) UpdateMetadata(ctx context.Context, a *Album) error {
	a.UpdatedAt = time.Now()
	tag, err := r.pool.Exec(ctx,
		`UPDATE albums
		 SET name = $2, description = $3, updated_at = $4
		 WHERE id = $1`,
		a.ID, a.Name, a.Description, a.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("album repo update metadata: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("album repo update metadata: album not found")
	}
	return nil
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

// sqlAlbumAssetAdd is the DB-level tenant guard for linking an asset into an
// album. Albums have no workspace_id of their own; ownership flows through the
// parent gallery (album_assets -> albums -> galleries). The INSERT ... SELECT
// joins the album's gallery to the asset on workspace_id, so a row is produced
// only when the asset shares the album's workspace AND that workspace matches
// the caller's ($4). The RETURNING clause lets the repo distinguish an
// inserted/updated link from a rejected one (cross-workspace, missing, or
// deleted asset -> zero rows -> ErrAssetNotInWorkspace).
const sqlAlbumAssetAdd = `INSERT INTO album_assets (album_id, asset_id, position, added_at)
		 SELECT al.id, a.id, $3, now()
		 FROM albums al
		 JOIN galleries g ON g.id = al.gallery_id
		 JOIN assets a ON a.workspace_id = g.workspace_id
		 WHERE al.id = $1 AND a.id = $2 AND a.deleted_at IS NULL
		   AND g.workspace_id = $4
		 ON CONFLICT (album_id, asset_id) DO UPDATE SET position = EXCLUDED.position
		 RETURNING album_id`

// AddAsset adds an asset to an album, but only when the asset belongs to the
// same workspace as the album's parent gallery.
//
// workspaceID is the caller's JWT workspace (resolved by the handler via the
// album ownership guard). A cross-workspace or missing asset inserts no row and
// returns ErrAssetNotInWorkspace instead of silently linking foreign data.
func (r *AlbumRepo) AddAsset(ctx context.Context, albumID, assetID, workspaceID uuid.UUID, position int) error {
	var inserted uuid.UUID
	err := r.pool.QueryRow(ctx, sqlAlbumAssetAdd,
		albumID, assetID, position, workspaceID,
	).Scan(&inserted)
	if err == pgx.ErrNoRows {
		// No row matched the workspace-join: the asset is foreign to the
		// album's workspace (or does not exist / is deleted). Reject.
		return ErrAssetNotInWorkspace
	}
	if err != nil {
		return fmt.Errorf("album repo add asset: %w", err)
	}
	return nil
}

// ListAssets returns all asset links for an album ordered by position.
func (r *AlbumRepo) ListAssets(ctx context.Context, albumID uuid.UUID) ([]AlbumAsset, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT aa.album_id, aa.asset_id, aa.position, aa.added_at
		 FROM album_assets aa
		 JOIN assets a ON a.id = aa.asset_id
		 WHERE aa.album_id = $1 AND a.deleted_at IS NULL
		 ORDER BY aa.position ASC, aa.added_at ASC`,
		albumID,
	)
	if err != nil {
		return nil, fmt.Errorf("album repo list assets: %w", err)
	}
	defer rows.Close()

	var items []AlbumAsset
	for rows.Next() {
		var item AlbumAsset
		if err := rows.Scan(&item.AlbumID, &item.AssetID, &item.Position, &item.AddedAt); err != nil {
			return nil, fmt.Errorf("album repo list assets scan: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

// ListAssetIDsByGallery returns manual album membership (album_id -> []asset_id)
// for every album in a gallery in a SINGLE query, replacing the per-album
// ListAssets fan-out (F-091). Smart-album membership is resolved separately by
// the service. Albums with no manual members are simply absent from the map.
func (r *AlbumRepo) ListAssetIDsByGallery(ctx context.Context, galleryID uuid.UUID) (map[uuid.UUID][]uuid.UUID, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT aa.album_id, aa.asset_id
		 FROM album_assets aa
		 JOIN albums al ON al.id = aa.album_id
		 JOIN assets a ON a.id = aa.asset_id
		 WHERE al.gallery_id = $1 AND a.deleted_at IS NULL
		 ORDER BY aa.album_id, aa.position ASC, aa.added_at ASC`,
		galleryID,
	)
	if err != nil {
		return nil, fmt.Errorf("album repo list asset ids by gallery: %w", err)
	}
	defer rows.Close()

	out := make(map[uuid.UUID][]uuid.UUID)
	for rows.Next() {
		var albumID, assetID uuid.UUID
		if err := rows.Scan(&albumID, &assetID); err != nil {
			return nil, fmt.Errorf("album repo list asset ids by gallery scan: %w", err)
		}
		out[albumID] = append(out[albumID], assetID)
	}
	return out, rows.Err()
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
