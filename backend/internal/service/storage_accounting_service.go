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
