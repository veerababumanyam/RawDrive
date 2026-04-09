package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Asset represents a stored file (image, RAW, video).
type Asset struct {
	ID            uuid.UUID              `json:"id"`
	WorkspaceID   uuid.UUID              `json:"workspace_id"`
	Filename      string                 `json:"filename"`
	ContentType   string                 `json:"content_type"`
	SizeBytes     int64                  `json:"size_bytes"`
	StorageKey    string                 `json:"storage_key"`
	StorageDriver string                 `json:"storage_driver"`
	Width         *int                   `json:"width,omitempty"`
	Height        *int                   `json:"height,omitempty"`
	Blurhash      *string                `json:"blurhash,omitempty"`
	ExifData      map[string]interface{} `json:"exif_data"`
	ThumbnailURLs map[string]string      `json:"thumbnail_urls"`
	UploadedBy    *uuid.UUID             `json:"uploaded_by,omitempty"`
	Status        string                 `json:"status"`
	CreatedAt     time.Time              `json:"created_at"`
	UpdatedAt     time.Time              `json:"updated_at"`
	DeletedAt     *time.Time             `json:"deleted_at,omitempty"`
}

// AssetFilter contains composable filters for listing assets.
type AssetFilter struct {
	WorkspaceID    uuid.UUID
	GalleryID      *uuid.UUID
	Status         string
	ContentType    string
	LifecycleState string
	Search         string
	CameraModel    string
	LensModel      string
	FromDate       string // ISO 8601
	ToDate         string // ISO 8601
	MinRating      int
	IsFavorite     *bool
	Sort           string // "created_at", "filename", "size_bytes", "capture_date"
	Order          string // "asc", "desc"
	Limit          int
	Offset         int
	Cursor         *uuid.UUID
}

// AssetRepo handles asset persistence.
type AssetRepo struct {
	pool *pgxpool.Pool
}

// NewAssetRepo creates a new AssetRepo.
func NewAssetRepo(pool *pgxpool.Pool) *AssetRepo {
	return &AssetRepo{pool: pool}
}

// Create inserts a new asset.
func (r *AssetRepo) Create(ctx context.Context, a *Asset) error {
	if a.ID == uuid.Nil {
		a.ID = uuid.New()
	}
	a.CreatedAt = time.Now()
	a.UpdatedAt = a.CreatedAt

	_, err := r.pool.Exec(ctx,
		`INSERT INTO assets (id, workspace_id, filename, content_type, size_bytes, storage_key,
		 storage_driver, width, height, blurhash, exif_data, thumbnail_urls, uploaded_by, status,
		 created_at, updated_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
		a.ID, a.WorkspaceID, a.Filename, a.ContentType, a.SizeBytes, a.StorageKey,
		a.StorageDriver, a.Width, a.Height, a.Blurhash, a.ExifData, a.ThumbnailURLs,
		a.UploadedBy, a.Status, a.CreatedAt, a.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("asset repo create: %w", err)
	}
	return nil
}

// GetByID retrieves an asset by ID (excludes soft-deleted).
func (r *AssetRepo) GetByID(ctx context.Context, id uuid.UUID) (*Asset, error) {
	a := &Asset{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, workspace_id, filename, content_type, size_bytes, storage_key,
		 storage_driver, width, height, blurhash, exif_data, thumbnail_urls, uploaded_by,
		 status, created_at, updated_at, deleted_at
		 FROM assets WHERE id = $1 AND deleted_at IS NULL`, id,
	).Scan(&a.ID, &a.WorkspaceID, &a.Filename, &a.ContentType, &a.SizeBytes, &a.StorageKey,
		&a.StorageDriver, &a.Width, &a.Height, &a.Blurhash, &a.ExifData, &a.ThumbnailURLs,
		&a.UploadedBy, &a.Status, &a.CreatedAt, &a.UpdatedAt, &a.DeletedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("asset repo get: %w", err)
	}
	return a, nil
}

// List retrieves assets matching the filter.
func (r *AssetRepo) List(ctx context.Context, f AssetFilter) ([]Asset, error) {
	limit := f.Limit
	if limit <= 0 {
		limit = 50
	}

	query := `SELECT id, workspace_id, filename, content_type, size_bytes, storage_key,
		storage_driver, width, height, blurhash, exif_data, thumbnail_urls, uploaded_by,
		status, created_at, updated_at, deleted_at
		FROM assets WHERE workspace_id = $1 AND deleted_at IS NULL`
	args := []interface{}{f.WorkspaceID}
	argIdx := 2

	if f.Status != "" {
		query += fmt.Sprintf(" AND status = $%d", argIdx)
		args = append(args, f.Status)
		argIdx++
	}
	if f.ContentType != "" {
		query += fmt.Sprintf(" AND content_type = $%d", argIdx)
		args = append(args, f.ContentType)
		argIdx++
	}
	if f.LifecycleState != "" {
		query += fmt.Sprintf(" AND lifecycle_state = $%d", argIdx)
		args = append(args, f.LifecycleState)
		argIdx++
	}
	if f.GalleryID != nil {
		query += fmt.Sprintf(" AND id IN (SELECT asset_id FROM gallery_assets WHERE gallery_id = $%d)", argIdx)
		args = append(args, *f.GalleryID)
		argIdx++
	}
	if f.Search != "" {
		query += fmt.Sprintf(" AND (filename ILIKE $%d OR exif_data->>'model' ILIKE $%d)", argIdx, argIdx)
		args = append(args, "%"+f.Search+"%")
		argIdx++
	}
	if f.CameraModel != "" {
		query += fmt.Sprintf(" AND exif_data->>'model' ILIKE $%d", argIdx)
		args = append(args, "%"+f.CameraModel+"%")
		argIdx++
	}
	if f.FromDate != "" {
		query += fmt.Sprintf(" AND capture_date >= $%d", argIdx)
		args = append(args, f.FromDate)
		argIdx++
	}
	if f.ToDate != "" {
		query += fmt.Sprintf(" AND capture_date <= $%d", argIdx)
		args = append(args, f.ToDate)
		argIdx++
	}

	sortCol := "created_at"
	if f.Sort == "filename" || f.Sort == "size_bytes" || f.Sort == "capture_date" {
		sortCol = f.Sort
	}
	sortOrder := "DESC"
	if f.Order == "asc" {
		sortOrder = "ASC"
	}
	query += fmt.Sprintf(" ORDER BY %s %s LIMIT $%d OFFSET $%d", sortCol, sortOrder, argIdx, argIdx+1)
	args = append(args, limit, f.Offset)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("asset repo list: %w", err)
	}
	defer rows.Close()

	var assets []Asset
	for rows.Next() {
		var a Asset
		if err := rows.Scan(&a.ID, &a.WorkspaceID, &a.Filename, &a.ContentType, &a.SizeBytes,
			&a.StorageKey, &a.StorageDriver, &a.Width, &a.Height, &a.Blurhash, &a.ExifData,
			&a.ThumbnailURLs, &a.UploadedBy, &a.Status, &a.CreatedAt, &a.UpdatedAt, &a.DeletedAt,
		); err != nil {
			return nil, fmt.Errorf("asset repo list scan: %w", err)
		}
		assets = append(assets, a)
	}
	return assets, rows.Err()
}

// ListByStatus retrieves assets by status across all workspaces (for workers).
func (r *AssetRepo) ListByStatus(ctx context.Context, status string, limit int) ([]Asset, error) {
	if limit <= 0 {
		limit = 10
	}
	rows, err := r.pool.Query(ctx,
		`SELECT id, workspace_id, filename, content_type, size_bytes, storage_key,
		 storage_driver, width, height, blurhash, exif_data, thumbnail_urls, uploaded_by,
		 status, created_at, updated_at, deleted_at
		 FROM assets WHERE status = $1 AND deleted_at IS NULL
		 ORDER BY created_at ASC LIMIT $2`,
		status, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("asset repo list by status: %w", err)
	}
	defer rows.Close()

	var assets []Asset
	for rows.Next() {
		var a Asset
		if err := rows.Scan(&a.ID, &a.WorkspaceID, &a.Filename, &a.ContentType, &a.SizeBytes,
			&a.StorageKey, &a.StorageDriver, &a.Width, &a.Height, &a.Blurhash, &a.ExifData,
			&a.ThumbnailURLs, &a.UploadedBy, &a.Status, &a.CreatedAt, &a.UpdatedAt, &a.DeletedAt,
		); err != nil {
			return nil, fmt.Errorf("asset repo list by status scan: %w", err)
		}
		assets = append(assets, a)
	}
	return assets, rows.Err()
}

// UpdateDimensions sets the width and height of an asset.
func (r *AssetRepo) UpdateDimensions(ctx context.Context, id uuid.UUID, width, height int) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE assets SET width = $1, height = $2, updated_at = now() WHERE id = $3`,
		width, height, id,
	)
	if err != nil {
		return fmt.Errorf("asset repo update dimensions: %w", err)
	}
	return nil
}

// SoftDelete marks an asset as deleted.
func (r *AssetRepo) SoftDelete(ctx context.Context, id uuid.UUID) error {
	now := time.Now()
	tag, err := r.pool.Exec(ctx,
		`UPDATE assets SET deleted_at = $1, updated_at = $1 WHERE id = $2 AND deleted_at IS NULL`,
		now, id,
	)
	if err != nil {
		return fmt.Errorf("asset repo delete: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("asset not found or already deleted")
	}
	return nil
}

// UpdateStatus changes the asset's status.
func (r *AssetRepo) UpdateStatus(ctx context.Context, id uuid.UUID, status string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE assets SET status = $1, updated_at = now() WHERE id = $2`,
		status, id,
	)
	if err != nil {
		return fmt.Errorf("asset repo update status: %w", err)
	}
	return nil
}

// UpdateThumbnails sets the thumbnail URLs and blurhash.
func (r *AssetRepo) UpdateThumbnails(ctx context.Context, id uuid.UUID, thumbnails map[string]string, blurhash string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE assets SET thumbnail_urls = $1, blurhash = $2, updated_at = now() WHERE id = $3`,
		thumbnails, blurhash, id,
	)
	if err != nil {
		return fmt.Errorf("asset repo update thumbnails: %w", err)
	}
	return nil
}

// UpdateExif sets the EXIF metadata for an asset.
func (r *AssetRepo) UpdateExif(ctx context.Context, id uuid.UUID, exifData map[string]interface{}) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE assets SET exif_data = $1, updated_at = now() WHERE id = $2`,
		exifData, id,
	)
	if err != nil {
		return fmt.Errorf("asset repo update exif: %w", err)
	}
	return nil
}

// GetByIDAndWorkspace retrieves an asset by ID scoped to a workspace.
func (r *AssetRepo) GetByIDAndWorkspace(ctx context.Context, id, workspaceID uuid.UUID) (*Asset, error) {
	a := &Asset{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, workspace_id, filename, content_type, size_bytes, storage_key, storage_driver,
		 width, height, blurhash, exif_data, thumbnail_urls, uploaded_by, status,
		 created_at, updated_at, deleted_at
		 FROM assets WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL`,
		id, workspaceID,
	).Scan(&a.ID, &a.WorkspaceID, &a.Filename, &a.ContentType, &a.SizeBytes,
		&a.StorageKey, &a.StorageDriver, &a.Width, &a.Height, &a.Blurhash,
		&a.ExifData, &a.ThumbnailURLs, &a.UploadedBy, &a.Status,
		&a.CreatedAt, &a.UpdatedAt, &a.DeletedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("asset repo get by id and workspace: %w", err)
	}
	return a, nil
}

// BulkUpdateStatus changes status for multiple assets at once.
func (r *AssetRepo) BulkUpdateStatus(ctx context.Context, ids []uuid.UUID, status string, workspaceID uuid.UUID) (int64, error) {
	if len(ids) == 0 {
		return 0, nil
	}
	tag, err := r.pool.Exec(ctx,
		`UPDATE assets SET status = $1, updated_at = now()
		 WHERE id = ANY($2) AND workspace_id = $3 AND deleted_at IS NULL`,
		status, ids, workspaceID,
	)
	if err != nil {
		return 0, fmt.Errorf("asset repo bulk update status: %w", err)
	}
	return tag.RowsAffected(), nil
}

// BulkMoveToGallery moves multiple assets to a different gallery.
func (r *AssetRepo) BulkMoveToGallery(ctx context.Context, assetIDs []uuid.UUID, fromGalleryID, toGalleryID uuid.UUID) error {
	if len(assetIDs) == 0 {
		return nil
	}
	// Remove from old gallery
	_, err := r.pool.Exec(ctx,
		`DELETE FROM gallery_assets WHERE gallery_id = $1 AND asset_id = ANY($2)`,
		fromGalleryID, assetIDs,
	)
	if err != nil {
		return fmt.Errorf("asset repo bulk move remove: %w", err)
	}
	// Add to new gallery
	for i, id := range assetIDs {
		_, err := r.pool.Exec(ctx,
			`INSERT INTO gallery_assets (gallery_id, asset_id, sort_order, added_at)
			 VALUES ($1, $2, $3, now()) ON CONFLICT DO NOTHING`,
			toGalleryID, id, i,
		)
		if err != nil {
			return fmt.Errorf("asset repo bulk move add: %w", err)
		}
	}
	return nil
}

// GetWorkspaceStorageUsed returns total storage bytes used by a workspace.
func (r *AssetRepo) GetWorkspaceStorageUsed(ctx context.Context, workspaceID uuid.UUID) (int64, error) {
	var total int64
	err := r.pool.QueryRow(ctx,
		`SELECT COALESCE(SUM(size_bytes), 0) FROM assets WHERE workspace_id = $1 AND deleted_at IS NULL`,
		workspaceID,
	).Scan(&total)
	if err != nil {
		return 0, fmt.Errorf("asset repo get workspace storage: %w", err)
	}
	return total, nil
}
