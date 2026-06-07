package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrGalleryUploadWindowClosed = errors.New("gallery upload window closed")
var ErrGalleryEventQuotaExceeded = errors.New("gallery event storage quota exceeded")

type EventGalleryUploadGate struct {
	db *pgxpool.Pool
}

func NewEventGalleryUploadGate(db *pgxpool.Pool) *EventGalleryUploadGate {
	return &EventGalleryUploadGate{db: db}
}

func (g *EventGalleryUploadGate) CheckGalleryUpload(ctx context.Context, workspaceID, galleryID uuid.UUID, additionalBytes int64) error {
	if g == nil || g.db == nil {
		return nil
	}
	if additionalBytes < 0 {
		additionalBytes = 0
	}

	var quotaBytes int64
	var uploadWindowEndsAt, activeEndsAt, cleanupDueAt time.Time
	err := g.db.QueryRow(ctx, `
		SELECT quota_bytes, upload_window_ends_at, active_ends_at, cleanup_due_at
		  FROM gallery_event_entitlements
		 WHERE workspace_id = $1
		   AND gallery_id = $2
		   AND status IN ('active', 'view_only')
		   AND converted_at IS NULL
		   AND cancelled_at IS NULL
		   AND cleanup_completed_at IS NULL
		 ORDER BY created_at DESC
		 LIMIT 1`,
		workspaceID, galleryID,
	).Scan(&quotaBytes, &uploadWindowEndsAt, &activeEndsAt, &cleanupDueAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("gallery event entitlement lookup: %w", err)
	}

	now := time.Now().UTC()
	if !now.Before(uploadWindowEndsAt) || !now.Before(activeEndsAt) || !now.Before(cleanupDueAt) {
		_, _ = g.db.Exec(ctx, `
			UPDATE gallery_event_entitlements
			   SET status = 'view_only', updated_at = now()
			 WHERE workspace_id = $1
			   AND gallery_id = $2
			   AND status = 'active'`,
			workspaceID, galleryID,
		)
		return ErrGalleryUploadWindowClosed
	}
	if quotaBytes <= 0 {
		return ErrGalleryEventQuotaExceeded
	}

	var usedBytes int64
	err = g.db.QueryRow(ctx, `
		WITH gallery_asset_ids AS (
			SELECT DISTINCT ga.asset_id
			  FROM gallery_assets ga
			  JOIN assets a ON a.id = ga.asset_id
			 WHERE ga.gallery_id = $1
			   AND a.workspace_id = $2
			   AND a.deleted_at IS NULL
		),
		originals AS (
			SELECT COALESCE(SUM(a.size_bytes), 0)::bigint AS bytes
			  FROM assets a
			 WHERE a.id IN (SELECT asset_id FROM gallery_asset_ids)
			   AND a.deleted_at IS NULL
		),
		derivatives AS (
			SELECT COALESCE(SUM(ad.size_bytes), 0)::bigint AS bytes
			  FROM asset_derivatives ad
			 WHERE ad.asset_id IN (SELECT asset_id FROM gallery_asset_ids)
		)
		SELECT originals.bytes + derivatives.bytes
		  FROM originals, derivatives`,
		galleryID, workspaceID,
	).Scan(&usedBytes)
	if err != nil {
		return fmt.Errorf("gallery event storage usage: %w", err)
	}
	if usedBytes+additionalBytes > quotaBytes {
		return ErrGalleryEventQuotaExceeded
	}
	return nil
}
