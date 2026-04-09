package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// StorageAccounting tracks per-workspace storage usage with quota enforcement.
type StorageAccounting struct {
	pool *pgxpool.Pool
}

// NewStorageAccounting creates a new StorageAccounting service.
func NewStorageAccounting(pool *pgxpool.Pool) *StorageAccounting {
	return &StorageAccounting{pool: pool}
}

// WorkspaceStorage represents current storage usage for a workspace.
type WorkspaceStorage struct {
	WorkspaceID    uuid.UUID `json:"workspace_id"`
	UsedBytes      int64     `json:"used_bytes"`
	DerivativeBytes int64    `json:"derivative_bytes"`
	QuotaBytes     int64     `json:"quota_bytes"`
	GraceBytes     int64     `json:"grace_bytes"`
	PercentUsed    float64   `json:"percent_used"`
}

// WarningLevel returns the storage warning level.
func (ws *WorkspaceStorage) WarningLevel() string {
	if ws.QuotaBytes == 0 {
		return "none"
	}
	pct := float64(ws.UsedBytes) / float64(ws.QuotaBytes) * 100
	if pct >= 95 {
		return "critical"
	}
	if pct >= 80 {
		return "warning"
	}
	return "none"
}

// GetUsage retrieves current storage usage for a workspace.
func (s *StorageAccounting) GetUsage(ctx context.Context, workspaceID uuid.UUID) (*WorkspaceStorage, error) {
	ws := &WorkspaceStorage{WorkspaceID: workspaceID}
	err := s.pool.QueryRow(ctx,
		`SELECT COALESCE(used_bytes, 0), COALESCE(derivative_bytes, 0), COALESCE(quota_bytes, 0), COALESCE(grace_bytes, 0)
		 FROM workspace_storage WHERE workspace_id = $1`,
		workspaceID,
	).Scan(&ws.UsedBytes, &ws.DerivativeBytes, &ws.QuotaBytes, &ws.GraceBytes)
	if err != nil {
		return nil, fmt.Errorf("storage accounting: get usage: %w", err)
	}
	if ws.QuotaBytes > 0 {
		ws.PercentUsed = float64(ws.UsedBytes) / float64(ws.QuotaBytes) * 100
	}
	return ws, nil
}

// CheckQuota verifies if a workspace can accept additional bytes.
func (s *StorageAccounting) CheckQuota(ctx context.Context, workspaceID uuid.UUID, additionalBytes int64) (bool, error) {
	usage, err := s.GetUsage(ctx, workspaceID)
	if err != nil {
		return false, err
	}
	if usage.QuotaBytes == 0 {
		return true, nil // No quota = unlimited
	}
	return (usage.UsedBytes + additionalBytes) <= usage.QuotaBytes, nil
}

// RecordUpload atomically increases storage usage after a successful upload.
func (s *StorageAccounting) RecordUpload(ctx context.Context, workspaceID uuid.UUID, originalBytes, derivativeBytes int64) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO workspace_storage (workspace_id, used_bytes, derivative_bytes, quota_bytes)
		 VALUES ($1, $2, $3, 0)
		 ON CONFLICT (workspace_id) DO UPDATE
		 SET used_bytes = workspace_storage.used_bytes + $2,
		     derivative_bytes = workspace_storage.derivative_bytes + $3`,
		workspaceID, originalBytes, derivativeBytes,
	)
	if err != nil {
		return fmt.Errorf("storage accounting: record upload: %w", err)
	}
	return nil
}

// RecordDelete atomically decreases storage usage after an asset deletion.
func (s *StorageAccounting) RecordDelete(ctx context.Context, workspaceID uuid.UUID, originalBytes, derivativeBytes int64) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE workspace_storage
		 SET used_bytes = GREATEST(0, used_bytes - $2),
		     derivative_bytes = GREATEST(0, derivative_bytes - $3)
		 WHERE workspace_id = $1`,
		workspaceID, originalBytes, derivativeBytes,
	)
	if err != nil {
		return fmt.Errorf("storage accounting: record delete: %w", err)
	}
	return nil
}

// GalleryStorageBreakdown shows storage used per gallery.
type GalleryStorageBreakdown struct {
	GalleryID   uuid.UUID `json:"gallery_id"`
	GalleryName string    `json:"gallery_name"`
	UsedBytes   int64     `json:"used_bytes"`
}

// StorageTypeBreakdown shows storage used per asset type.
type StorageTypeBreakdown struct {
	Originals   int64 `json:"originals_bytes"`
	Derivatives int64 `json:"derivatives_bytes"`
	Thumbnails  int64 `json:"thumbnails_bytes"`
}

// StorageAnalytics combines usage, per-gallery, and per-type breakdowns.
type StorageAnalytics struct {
	Usage       *WorkspaceStorage       `json:"usage"`
	TopGalleries []GalleryStorageBreakdown `json:"top_galleries"`
	TypeBreakdown StorageTypeBreakdown    `json:"type_breakdown"`
}

// GetAnalytics returns full storage analytics for a workspace.
func (s *StorageAccounting) GetAnalytics(ctx context.Context, workspaceID uuid.UUID) (*StorageAnalytics, error) {
	usage, err := s.GetUsage(ctx, workspaceID)
	if err != nil {
		// If workspace_storage row doesn't exist yet, return zeros
		usage = &WorkspaceStorage{WorkspaceID: workspaceID}
	}

	// Top 5 galleries by storage
	galleries, err := s.getTopGalleries(ctx, workspaceID, 5)
	if err != nil {
		galleries = []GalleryStorageBreakdown{}
	}

	// Type breakdown from assets table
	typeBreak, err := s.getTypeBreakdown(ctx, workspaceID)
	if err != nil {
		typeBreak = &StorageTypeBreakdown{}
	}

	return &StorageAnalytics{
		Usage:         usage,
		TopGalleries:  galleries,
		TypeBreakdown: *typeBreak,
	}, nil
}

func (s *StorageAccounting) getTopGalleries(ctx context.Context, workspaceID uuid.UUID, limit int) ([]GalleryStorageBreakdown, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT g.id, g.title, COALESCE(SUM(a.size_bytes), 0) as total_bytes
		 FROM galleries g
		 LEFT JOIN gallery_assets ga ON ga.gallery_id = g.id
		 LEFT JOIN assets a ON a.id = ga.asset_id AND a.deleted_at IS NULL
		 WHERE g.workspace_id = $1 AND g.deleted_at IS NULL
		 GROUP BY g.id, g.title
		 ORDER BY total_bytes DESC
		 LIMIT $2`,
		workspaceID, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("storage: top galleries: %w", err)
	}
	defer rows.Close()

	var result []GalleryStorageBreakdown
	for rows.Next() {
		var gb GalleryStorageBreakdown
		if err := rows.Scan(&gb.GalleryID, &gb.GalleryName, &gb.UsedBytes); err != nil {
			return nil, err
		}
		result = append(result, gb)
	}
	return result, rows.Err()
}

func (s *StorageAccounting) getTypeBreakdown(ctx context.Context, workspaceID uuid.UUID) (*StorageTypeBreakdown, error) {
	tb := &StorageTypeBreakdown{}
	// Originals = assets.size_bytes
	err := s.pool.QueryRow(ctx,
		`SELECT COALESCE(SUM(size_bytes), 0) FROM assets WHERE workspace_id = $1 AND deleted_at IS NULL`,
		workspaceID,
	).Scan(&tb.Originals)
	if err != nil {
		return tb, err
	}

	// Derivatives = asset_derivatives.size_bytes for this workspace's assets
	err = s.pool.QueryRow(ctx,
		`SELECT COALESCE(SUM(ad.size_bytes), 0)
		 FROM asset_derivatives ad
		 JOIN assets a ON a.id = ad.asset_id
		 WHERE a.workspace_id = $1 AND a.deleted_at IS NULL`,
		workspaceID,
	).Scan(&tb.Derivatives)
	if err != nil {
		// Table might not exist yet — that's OK
		tb.Derivatives = 0
	}

	// Thumbnails are a subset of derivatives but counted separately if variant starts with 'thumb_'
	err = s.pool.QueryRow(ctx,
		`SELECT COALESCE(SUM(ad.size_bytes), 0)
		 FROM asset_derivatives ad
		 JOIN assets a ON a.id = ad.asset_id
		 WHERE a.workspace_id = $1 AND a.deleted_at IS NULL AND ad.variant LIKE 'thumb_%'`,
		workspaceID,
	).Scan(&tb.Thumbnails)
	if err != nil {
		tb.Thumbnails = 0
	}

	return tb, nil
}

// SetQuota updates the storage quota for a workspace (typically from plan changes).
func (s *StorageAccounting) SetQuota(ctx context.Context, workspaceID uuid.UUID, quotaBytes int64) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO workspace_storage (workspace_id, used_bytes, derivative_bytes, quota_bytes)
		 VALUES ($1, 0, 0, $2)
		 ON CONFLICT (workspace_id) DO UPDATE SET quota_bytes = $2`,
		workspaceID, quotaBytes,
	)
	if err != nil {
		return fmt.Errorf("storage accounting: set quota: %w", err)
	}
	return nil
}
