package service

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrStorageQuotaExceeded is returned when a workspace's accepted upload would
// push used_bytes past quota_bytes. Handlers detect this with errors.Is so
// they can map it to a 403 with the documented JSON shape
// `{"error":"storage_quota_exceeded", "message":"..."}` — same payload the
// (previously unmounted) QuotaEnforcer middleware emits, kept identical so
// the frontend's upload error handler can rely on a stable contract.
var ErrStorageQuotaExceeded = errors.New("storage quota exceeded")

// analyticsCache is a simple in-memory cache with TTL for storage analytics.
type analyticsCache struct {
	mu      sync.RWMutex
	entries map[uuid.UUID]*analyticsCacheEntry
}

type analyticsCacheEntry struct {
	data      *StorageAnalytics
	expiresAt time.Time
}

func newAnalyticsCache() *analyticsCache {
	return &analyticsCache{entries: make(map[uuid.UUID]*analyticsCacheEntry)}
}

func (c *analyticsCache) get(workspaceID uuid.UUID) (*StorageAnalytics, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	entry, ok := c.entries[workspaceID]
	if !ok || time.Now().After(entry.expiresAt) {
		return nil, false
	}
	return entry.data, true
}

func (c *analyticsCache) set(workspaceID uuid.UUID, data *StorageAnalytics, ttl time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries[workspaceID] = &analyticsCacheEntry{data: data, expiresAt: time.Now().Add(ttl)}
}

func (c *analyticsCache) invalidate(workspaceID uuid.UUID) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.entries, workspaceID)
}

// StorageAccounting tracks per-workspace storage usage with quota enforcement.
type StorageAccounting struct {
	pool  *pgxpool.Pool
	cache *analyticsCache
}

// NewStorageAccounting creates a new StorageAccounting service.
func NewStorageAccounting(pool *pgxpool.Pool) *StorageAccounting {
	return &StorageAccounting{pool: pool, cache: newAnalyticsCache()}
}

// WorkspaceStorage represents current storage usage for a workspace.
//
// TotalBytes = UsedBytes + DerivativeBytes. This is the authoritative storage
// footprint because B2 charges for originals plus WebP variants. ReservedBytes
// are in-flight originals and count toward quota decisions while the upload is
// open.
type WorkspaceStorage struct {
	WorkspaceID     uuid.UUID `json:"workspace_id"`
	UsedBytes       int64     `json:"used_bytes"`
	DerivativeBytes int64     `json:"derivative_bytes"`
	ReservedBytes   int64     `json:"reserved_bytes"`
	TotalBytes      int64     `json:"total_bytes"`
	QuotaBytes      int64     `json:"quota_bytes"`
	GraceBytes      int64     `json:"grace_bytes"`
	PercentUsed     float64   `json:"percent_used"`
}

func (ws *WorkspaceStorage) billableBytes() int64 {
	return ws.UsedBytes + ws.DerivativeBytes + ws.ReservedBytes
}

func (ws *WorkspaceStorage) effectiveQuotaBytes() int64 {
	if ws.QuotaBytes == 0 {
		return 0
	}
	return ws.QuotaBytes + ws.GraceBytes
}

// WarningLevel returns the storage warning level.
func (ws *WorkspaceStorage) WarningLevel() string {
	limit := ws.effectiveQuotaBytes()
	if limit == 0 {
		return "none"
	}
	pct := float64(ws.billableBytes()) / float64(limit) * 100
	if pct >= 95 {
		return "critical"
	}
	if pct >= 80 {
		return "warning"
	}
	return "none"
}

// GetUsage retrieves current storage usage for a workspace. When quota_bytes is
// 0 (not yet seeded), it falls back to the plan-tier default so the UI always
// displays a meaningful limit rather than "0 B / 0 B".
func (s *StorageAccounting) GetUsage(ctx context.Context, workspaceID uuid.UUID) (*WorkspaceStorage, error) {
	ws := &WorkspaceStorage{WorkspaceID: workspaceID}
	var planTier string
	err := s.pool.QueryRow(ctx,
		`SELECT COALESCE(ws.used_bytes, 0), COALESCE(ws.derivative_bytes, 0),
		        COALESCE(ws.reserved_bytes, 0),
		        COALESCE(ws.quota_bytes, 0), COALESCE(ws.grace_bytes, 0),
		        COALESCE(w.plan_tier, 'free')
		 FROM workspaces w
		 LEFT JOIN workspace_storage ws ON ws.workspace_id = w.id
		 WHERE w.id = $1`,
		workspaceID,
	).Scan(&ws.UsedBytes, &ws.DerivativeBytes, &ws.ReservedBytes, &ws.QuotaBytes, &ws.GraceBytes, &planTier)
	if err != nil {
		return nil, fmt.Errorf("storage accounting: get usage: %w", err)
	}
	if ws.QuotaBytes == 0 {
		ws.QuotaBytes = PlanDefaultQuotaBytes(planTier)
	}
	ws.TotalBytes = ws.UsedBytes + ws.DerivativeBytes
	if limit := ws.effectiveQuotaBytes(); limit > 0 {
		ws.PercentUsed = float64(ws.billableBytes()) / float64(limit) * 100
	}
	return ws, nil
}

// ApplyDerivativeDelta adjusts a workspace's derivative_bytes by `delta`
// (signed). Idempotent companion to RecordUpload — the thumbnail worker
// computes the delta as (new total for this asset) - (existing total for
// this asset) so re-runs of the same asset produce delta=0 and don't
// double-count. GREATEST(0, ...) guards against the floor going below
// zero if the row somehow gets out of sync.
func (s *StorageAccounting) ApplyDerivativeDelta(ctx context.Context, workspaceID uuid.UUID, delta int64) error {
	if delta == 0 {
		return nil
	}
	_, err := s.pool.Exec(ctx,
		`INSERT INTO workspace_storage (workspace_id, used_bytes, derivative_bytes, quota_bytes)
		 VALUES ($1, 0, GREATEST(0, $2), 0)
		 ON CONFLICT (workspace_id) DO UPDATE
		 SET derivative_bytes = GREATEST(0, workspace_storage.derivative_bytes + $2)`,
		workspaceID, delta,
	)
	if err != nil {
		return fmt.Errorf("storage accounting: apply derivative delta: %w", err)
	}
	s.cache.invalidate(workspaceID)
	return nil
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
	return (usage.TotalBytes + usage.ReservedBytes + additionalBytes) <= (usage.QuotaBytes + usage.GraceBytes), nil
}

// ReserveUpload atomically claims original bytes for an in-flight upload
// session. This closes the CheckQuota/RecordUpload race where several TUS
// sessions could all pass a read-only quota check and then finalize beyond the
// workspace quota. Workspaces without a storage row are seeded from plan_tier.
func (s *StorageAccounting) ReserveUpload(ctx context.Context, workspaceID uuid.UUID, originalBytes int64) error {
	if originalBytes <= 0 {
		return nil
	}
	tag, err := s.pool.Exec(ctx,
		`WITH seeded AS (
		     INSERT INTO workspace_storage (workspace_id, used_bytes, derivative_bytes, quota_bytes, reserved_bytes)
		     SELECT w.id, 0, 0,
		            CASE COALESCE(w.plan_tier, 'free')
		              WHEN 'starter' THEN $3::bigint
		              WHEN 'professional' THEN $4::bigint
		              WHEN 'business' THEN $5::bigint
		              WHEN 'enterprise' THEN $6::bigint
		              ELSE $7::bigint
		            END,
		            0
		       FROM workspaces w
		      WHERE w.id = $1
		     ON CONFLICT (workspace_id) DO NOTHING
		   )
		   UPDATE workspace_storage
		      SET reserved_bytes = reserved_bytes + $2
		    WHERE workspace_id = $1
		      AND (
		        quota_bytes = 0
		        OR used_bytes + derivative_bytes + reserved_bytes + $2 <= quota_bytes + grace_bytes
		      )`,
		workspaceID,
		originalBytes,
		PlanDefaultQuotaBytes("starter"),
		PlanDefaultQuotaBytes("professional"),
		PlanDefaultQuotaBytes("business"),
		PlanDefaultQuotaBytes("enterprise"),
		PlanDefaultQuotaBytes("free"),
	)
	if err != nil {
		return fmt.Errorf("storage accounting: reserve upload: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrStorageQuotaExceeded
	}
	s.cache.invalidate(workspaceID)
	return nil
}

// CommitUploadReservation moves previously reserved original bytes into
// used_bytes after a successful finalize.
func (s *StorageAccounting) CommitUploadReservation(ctx context.Context, workspaceID uuid.UUID, originalBytes, derivativeBytes int64) error {
	if originalBytes < 0 || derivativeBytes < 0 {
		return fmt.Errorf("storage accounting: negative commit")
	}
	tag, err := s.pool.Exec(ctx,
		`UPDATE workspace_storage
		    SET used_bytes = used_bytes + $2,
		        derivative_bytes = derivative_bytes + $3,
		        reserved_bytes = GREATEST(0, reserved_bytes - $2)
		  WHERE workspace_id = $1`,
		workspaceID, originalBytes, derivativeBytes,
	)
	if err != nil {
		return fmt.Errorf("storage accounting: commit upload reservation: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("storage accounting: commit upload reservation: workspace storage row not found")
	}
	s.cache.invalidate(workspaceID)
	return nil
}

// ReleaseUploadReservation returns in-flight bytes to the workspace quota pool
// when a session is cancelled or fails before finalize.
func (s *StorageAccounting) ReleaseUploadReservation(ctx context.Context, workspaceID uuid.UUID, originalBytes int64) error {
	if originalBytes <= 0 {
		return nil
	}
	_, err := s.pool.Exec(ctx,
		`UPDATE workspace_storage
		    SET reserved_bytes = GREATEST(0, reserved_bytes - $2)
		  WHERE workspace_id = $1`,
		workspaceID, originalBytes,
	)
	if err != nil {
		return fmt.Errorf("storage accounting: release upload reservation: %w", err)
	}
	s.cache.invalidate(workspaceID)
	return nil
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
	s.cache.invalidate(workspaceID)
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
	s.cache.invalidate(workspaceID)
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
	Usage         *WorkspaceStorage         `json:"usage"`
	TopGalleries  []GalleryStorageBreakdown `json:"top_galleries"`
	TypeBreakdown StorageTypeBreakdown      `json:"type_breakdown"`
}

// GetAnalytics returns full storage analytics for a workspace (cached for 1 hour).
func (s *StorageAccounting) GetAnalytics(ctx context.Context, workspaceID uuid.UUID) (*StorageAnalytics, error) {
	// Check cache first
	if cached, ok := s.cache.get(workspaceID); ok {
		return cached, nil
	}

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

	result := &StorageAnalytics{
		Usage:         usage,
		TopGalleries:  galleries,
		TypeBreakdown: *typeBreak,
	}

	// Cache for 1 hour
	s.cache.set(workspaceID, result, 1*time.Hour)

	return result, nil
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
	s.InvalidateAnalytics(workspaceID)
	return nil
}

// InvalidateAnalytics drops the in-process cached storage analytics for a
// workspace after quota/usage changes made outside this service's normal
// write path, such as subscription payment settlement.
func (s *StorageAccounting) InvalidateAnalytics(workspaceID uuid.UUID) {
	if s == nil || s.cache == nil {
		return
	}
	s.cache.invalidate(workspaceID)
}
