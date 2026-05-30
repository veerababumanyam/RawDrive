package repository

import (
	"context"
	"encoding/json"
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

	// F-004 (audit 2026-04-10): M16 Tier D upload-scan metadata. These fields
	// are persisted on Create when the upload came through a path that has a
	// verified scan manifest attached (e.g. chunked upload with Tier D wired).
	// Zero values (nil pointers) mean "no manifest" — the moderation dashboard
	// treats that as unscanned legacy data.
	UploadScanStatus        *string                  `json:"upload_scan_status,omitempty"`
	UploadScanEngine        *string                  `json:"upload_scan_engine,omitempty"`
	UploadScanPolicyVersion *string                  `json:"upload_scan_policy_version,omitempty"`
	UploadScanRiskScore     *float64                 `json:"upload_scan_risk_score,omitempty"`
	UploadScanFindings      []map[string]interface{} `json:"upload_scan_findings,omitempty"`
	UploadScanManifestHash  *string                  `json:"upload_scan_manifest_hash,omitempty"`
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

// Pool returns the underlying database pool.
func (r *AssetRepo) Pool() *pgxpool.Pool {
	return r.pool
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
		 created_at, updated_at,
		 upload_scan_status, upload_scan_engine, upload_scan_policy_version,
		 upload_scan_risk_score, upload_scan_findings, upload_scan_manifest_hash)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
		a.ID, a.WorkspaceID, a.Filename, a.ContentType, a.SizeBytes, a.StorageKey,
		a.StorageDriver, a.Width, a.Height, a.Blurhash, a.ExifData, a.ThumbnailURLs,
		a.UploadedBy, a.Status, a.CreatedAt, a.UpdatedAt,
		a.UploadScanStatus, a.UploadScanEngine, a.UploadScanPolicyVersion,
		a.UploadScanRiskScore, a.UploadScanFindings, a.UploadScanManifestHash,
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
//
// The thumbnail worker polls this with status='processing' on a 1s loop. The predicate
// (status = $1 AND deleted_at IS NULL ORDER BY created_at ASC) is backed by the partial
// index idx_assets_status_created ON assets(status, created_at)
// WHERE deleted_at IS NULL AND status = 'processing' (migration 129, F-033). Do NOT assume
// the older idx_assets_workspace_status / idx_assets_processing_status indexes serve this query:
// the former leads on workspace_id (absent here) and the latter is on the processing_status
// column, not status. If the partial index is dropped this query reverts to a full table scan
// plus top-N sort on every tick.
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

// SoftDelete marks an asset as deleted (sets deleted_at and status).
func (r *AssetRepo) SoftDelete(ctx context.Context, id uuid.UUID) error {
	now := time.Now()
	tag, err := r.pool.Exec(ctx,
		`UPDATE assets SET deleted_at = $1, status = 'deleted', updated_at = $1 WHERE id = $2 AND deleted_at IS NULL`,
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

// UpdateProcessingError persists a processing error message on an asset.
func (r *AssetRepo) UpdateProcessingError(ctx context.Context, id uuid.UUID, errMsg string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE assets SET processing_error = $1, updated_at = now() WHERE id = $2`,
		errMsg, id,
	)
	if err != nil {
		return fmt.Errorf("asset repo update processing error: %w", err)
	}
	return nil
}

// Restore clears the deleted_at timestamp and sets status back to active.
func (r *AssetRepo) Restore(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE assets SET deleted_at = NULL, status = 'active', updated_at = now() WHERE id = $1`,
		id,
	)
	if err != nil {
		return fmt.Errorf("asset repo restore: %w", err)
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

// TimelineGroup represents a date bucket with its assets.
type TimelineGroup struct {
	Date       string  `json:"date"`
	AssetCount int     `json:"asset_count"`
	Assets     []Asset `json:"assets"`
}

// ListGroupedByDate returns assets for a gallery grouped by capture date (or created_at fallback).
func (r *AssetRepo) ListGroupedByDate(ctx context.Context, galleryID uuid.UUID, limit int) ([]TimelineGroup, error) {
	if limit <= 0 {
		limit = 100
	}
	rows, err := r.pool.Query(ctx,
		`SELECT a.id, a.workspace_id, a.filename, a.content_type, a.size_bytes, a.storage_key,
		 a.storage_driver, a.width, a.height, a.blurhash, a.exif_data, a.thumbnail_urls,
		 a.uploaded_by, a.status, a.created_at, a.updated_at, a.deleted_at,
		 COALESCE(a.capture_date::date, a.created_at::date) as group_date
		 FROM assets a
		 JOIN gallery_assets ga ON ga.asset_id = a.id
		 WHERE ga.gallery_id = $1 AND a.deleted_at IS NULL
		 ORDER BY group_date DESC, a.created_at DESC
		 LIMIT $2`,
		galleryID, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("asset repo timeline: %w", err)
	}
	defer rows.Close()

	groupMap := map[string]*TimelineGroup{}
	var groupOrder []string
	for rows.Next() {
		var a Asset
		var groupDate time.Time
		if err := rows.Scan(&a.ID, &a.WorkspaceID, &a.Filename, &a.ContentType, &a.SizeBytes,
			&a.StorageKey, &a.StorageDriver, &a.Width, &a.Height, &a.Blurhash, &a.ExifData,
			&a.ThumbnailURLs, &a.UploadedBy, &a.Status, &a.CreatedAt, &a.UpdatedAt, &a.DeletedAt,
			&groupDate,
		); err != nil {
			return nil, fmt.Errorf("asset repo timeline scan: %w", err)
		}
		dateKey := groupDate.Format("2006-01-02")
		if _, exists := groupMap[dateKey]; !exists {
			groupMap[dateKey] = &TimelineGroup{Date: dateKey}
			groupOrder = append(groupOrder, dateKey)
		}
		groupMap[dateKey].Assets = append(groupMap[dateKey].Assets, a)
		groupMap[dateKey].AssetCount++
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	result := make([]TimelineGroup, 0, len(groupOrder))
	for _, key := range groupOrder {
		result = append(result, *groupMap[key])
	}
	return result, nil
}

// GetGalleriesForAsset returns the gallery IDs that contain this asset.
func (r *AssetRepo) GetGalleriesForAsset(ctx context.Context, assetID uuid.UUID) ([]uuid.UUID, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT gallery_id FROM gallery_assets WHERE asset_id = $1`, assetID,
	)
	if err != nil {
		return nil, fmt.Errorf("asset repo get galleries: %w", err)
	}
	defer rows.Close()
	var ids []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
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

// BulkMoveToGallery moves multiple assets from one gallery to another,
// but only for assets and galleries owned by the given workspaceID.
//
// ISSUE-007 (brownfield P2, tenant isolation): previously this method
// took no workspaceID and the SQL unconditionally modified
// gallery_assets rows, which meant a caller in workspace A could
// supply asset_ids and gallery_ids belonging to workspace B and have
// them moved. The fix enforces workspace scoping in three places:
//
//  1. Both fromGalleryID and toGalleryID must belong to workspaceID.
//     If either does not, the call is a silent no-op (returns 0).
//  2. The asset list is filtered to assets that belong to
//     workspaceID before any mutation. IDs that do not belong to the
//     workspace are silently dropped.
//  3. The whole operation runs inside a transaction so the DELETE
//     and INSERT cannot be observed in a partial state.
//
// The return value is the number of assets that were actually moved
// (which may be less than len(assetIDs) when cross-workspace IDs are
// filtered). Callers should surface this to clients rather than
// assuming every supplied ID was moved.
func (r *AssetRepo) BulkMoveToGallery(ctx context.Context, assetIDs []uuid.UUID, fromGalleryID, toGalleryID, workspaceID uuid.UUID) (int64, error) {
	if len(assetIDs) == 0 {
		return 0, nil
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return 0, fmt.Errorf("asset repo bulk move begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Guard 1: both galleries must belong to workspaceID.
	var gCount int
	if err := tx.QueryRow(ctx,
		`SELECT COUNT(*) FROM galleries WHERE id = ANY($1) AND workspace_id = $2`,
		[]uuid.UUID{fromGalleryID, toGalleryID}, workspaceID,
	).Scan(&gCount); err != nil {
		return 0, fmt.Errorf("asset repo bulk move gallery check: %w", err)
	}
	if gCount != 2 {
		// Either gallery does not belong to this workspace. Silently
		// drop the whole operation — returning an error would leak
		// information about the existence of cross-workspace IDs.
		return 0, nil
	}

	// Guard 2: fetch the intersection of assetIDs and workspace-owned,
	// non-deleted assets. Preserve the client's input order for the
	// subsequent sort_order assignment so drag-and-drop reorderings
	// survive the move.
	rows, err := tx.Query(ctx,
		`SELECT id FROM assets WHERE id = ANY($1) AND workspace_id = $2 AND deleted_at IS NULL`,
		assetIDs, workspaceID,
	)
	if err != nil {
		return 0, fmt.Errorf("asset repo bulk move filter: %w", err)
	}
	ownedSet := make(map[uuid.UUID]struct{})
	for rows.Next() {
		var id uuid.UUID
		if scanErr := rows.Scan(&id); scanErr != nil {
			rows.Close()
			return 0, fmt.Errorf("asset repo bulk move scan: %w", scanErr)
		}
		ownedSet[id] = struct{}{}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, fmt.Errorf("asset repo bulk move filter rows: %w", err)
	}

	owned := make([]uuid.UUID, 0, len(assetIDs))
	for _, id := range assetIDs {
		if _, ok := ownedSet[id]; ok {
			owned = append(owned, id)
		}
	}
	if len(owned) == 0 {
		return 0, nil
	}

	// Remove owned assets from the source gallery.
	if _, err := tx.Exec(ctx,
		`DELETE FROM gallery_assets WHERE gallery_id = $1 AND asset_id = ANY($2)`,
		fromGalleryID, owned,
	); err != nil {
		return 0, fmt.Errorf("asset repo bulk move remove: %w", err)
	}

	// Insert into the target gallery preserving the client-supplied
	// ordering. ON CONFLICT DO NOTHING keeps the call idempotent if
	// the client retries after a partial failure.
	for i, id := range owned {
		if _, err := tx.Exec(ctx,
			`INSERT INTO gallery_assets (gallery_id, asset_id, sort_order, added_at)
			 VALUES ($1, $2, $3, now()) ON CONFLICT DO NOTHING`,
			toGalleryID, id, i,
		); err != nil {
			return 0, fmt.Errorf("asset repo bulk move add: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("asset repo bulk move commit: %w", err)
	}

	return int64(len(owned)), nil
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

func (r *AssetRepo) BulkSetRating(ctx context.Context, ids []uuid.UUID, rating int, workspaceID uuid.UUID) (int64, error) {
	tag, err := r.pool.Exec(ctx, `UPDATE assets SET rating = $1, updated_at = now() WHERE id = ANY($2) AND workspace_id = $3 AND deleted_at IS NULL`, rating, ids, workspaceID)
	if err != nil {
		return 0, fmt.Errorf("bulk set rating: %w", err)
	}
	return tag.RowsAffected(), nil
}

func (r *AssetRepo) BulkSetColorLabel(ctx context.Context, ids []uuid.UUID, label string, workspaceID uuid.UUID) (int64, error) {
	tag, err := r.pool.Exec(ctx, `UPDATE assets SET color_label = $1, updated_at = now() WHERE id = ANY($2) AND workspace_id = $3 AND deleted_at IS NULL`, label, ids, workspaceID)
	if err != nil {
		return 0, fmt.Errorf("bulk set color label: %w", err)
	}
	return tag.RowsAffected(), nil
}

func (r *AssetRepo) BulkAddTags(ctx context.Context, ids []uuid.UUID, tags []string, workspaceID uuid.UUID) (int64, error) {
	type tagObj struct {
		Tag        string  `json:"tag"`
		Category   string  `json:"category"`
		Confidence float64 `json:"confidence"`
		Source     string  `json:"source"`
		Status     string  `json:"status"`
	}
	tagObjects := make([]tagObj, len(tags))
	for i, t := range tags {
		tagObjects[i] = tagObj{Tag: t, Category: "manual", Confidence: 1.0, Source: "user", Status: "accepted"}
	}
	tagsJSON, err := json.Marshal(tagObjects)
	if err != nil {
		return 0, fmt.Errorf("bulk add tags marshal: %w", err)
	}
	tag, err := r.pool.Exec(ctx, `UPDATE assets SET ai_tags = COALESCE(ai_tags, '[]'::jsonb) || $1::jsonb, updated_at = now() WHERE id = ANY($2) AND workspace_id = $3 AND deleted_at IS NULL`, string(tagsJSON), ids, workspaceID)
	if err != nil {
		return 0, fmt.Errorf("bulk add tags: %w", err)
	}
	return tag.RowsAffected(), nil
}

func (r *AssetRepo) BulkRemoveTags(ctx context.Context, ids []uuid.UUID, tags []string, workspaceID uuid.UUID) (int64, error) {
	for _, tagName := range tags {
		_, err := r.pool.Exec(ctx, `UPDATE assets SET ai_tags = (SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb) FROM jsonb_array_elements(COALESCE(ai_tags, '[]'::jsonb)) elem WHERE elem->>'tag' != $1), updated_at = now() WHERE id = ANY($2) AND workspace_id = $3 AND deleted_at IS NULL`, tagName, ids, workspaceID)
		if err != nil {
			return 0, fmt.Errorf("bulk remove tag %s: %w", tagName, err)
		}
	}
	return int64(len(ids)), nil
}
