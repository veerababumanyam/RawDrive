package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
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

// ErrAssetNotInWorkspace is returned by GalleryAssetRepo.Add and
// AlbumRepo.AddAsset when the asset id does not belong to the same workspace as
// the gallery (or the album's parent gallery) it is being linked into. This is
// the cross-tenant linkage guard (S2-G6 / S3-G1 / S3-G2 / AREA-UPLOADER-4): a
// caller in workspace A must not be able to attach a workspace-B asset to one
// of its own galleries/albums and read it back. Handlers map this to a 404/skip
// rather than disclosing the foreign id's existence.
var ErrAssetNotInWorkspace = fmt.Errorf("asset does not belong to gallery workspace")

// sqlGalleryAssetAdd is the DB-level tenant guard for linking an asset into a
// gallery. Instead of an unconditional INSERT ... VALUES, it inserts only when
// the gallery and the asset resolve to the SAME workspace_id (joined here, in
// the database, so the check can never be skipped by a caller). The RETURNING
// clause lets the repo distinguish "inserted/updated" from "rejected because the
// asset is foreign or missing": the WHERE prunes the row to zero before the
// INSERT runs, so a cross-workspace or non-existent asset yields no returned row.
const sqlGalleryAssetAdd = `INSERT INTO gallery_assets (id, gallery_id, asset_id, sort_order, added_at)
		 SELECT $1, g.id, a.id, $4, $5
		 FROM galleries g
		 JOIN assets a ON a.workspace_id = g.workspace_id
		 WHERE g.id = $2 AND a.id = $3 AND a.deleted_at IS NULL
		   AND g.workspace_id = $6
		 ON CONFLICT (gallery_id, asset_id) DO UPDATE SET sort_order = EXCLUDED.sort_order
		 RETURNING id`

// Add links an asset to a gallery, but only when the asset belongs to the same
// workspace as the gallery.
//
// workspaceID is the caller's JWT workspace (resolved by the handler via the
// gallery ownership guard). It is asserted to match the gallery's workspace as
// a defense-in-depth check before the DB-level join enforces that the asset
// shares that workspace. A cross-workspace or missing asset inserts no row and
// returns ErrAssetNotInWorkspace instead of silently linking foreign data.
func (r *GalleryAssetRepo) Add(ctx context.Context, galleryID, assetID, workspaceID uuid.UUID, sortOrder int) error {
	var inserted uuid.UUID
	err := r.pool.QueryRow(ctx, sqlGalleryAssetAdd,
		uuid.New(), galleryID, assetID, sortOrder, time.Now(), workspaceID,
	).Scan(&inserted)
	if err == pgx.ErrNoRows {
		// No row matched the workspace-join: the asset is foreign to the
		// gallery's workspace (or does not exist / is deleted). Reject.
		return ErrAssetNotInWorkspace
	}
	if err != nil {
		return fmt.Errorf("gallery asset add: %w", err)
	}
	return nil
}

// sqlGalleryAssetLinkServer is the server-side finalize-time link used by the
// chunked upload path (S3-G4 / AREA-UPLOADER-3). It differs from
// sqlGalleryAssetAdd in three load-bearing ways:
//
//   - sort_order is assigned server-side as COALESCE(MAX(sort_order),0)+1 within
//     the gallery (S3-G5) so newly finalized assets append deterministically to
//     the end of the grid instead of all colliding on the client-passed 0.
//   - ON CONFLICT DO NOTHING (not DO UPDATE): if the asset is already linked
//     (e.g. the legacy client addAssetToGallery call won the race) the
//     server-side link is a harmless no-op that must NOT clobber the existing
//     sort_order. This is what makes the dual-path (server + legacy client)
//     linkage idempotent.
//   - if the gallery has no valid cover_asset_id yet, the query sets it to the
//     first active gallery asset by sort_order/added_at. This makes the first
//     uploaded photo the persistent default cover while preserving any
//     photographer-set cover that still points at a live asset.
//
// The same workspace-join tenant guard as sqlGalleryAssetAdd is retained: the
// row is pruned to zero unless the gallery and asset resolve to the SAME
// workspace_id, so a cross-workspace asset can never be linked even via this
// path. The MAX subquery is correlated to the gallery so it scans only that
// gallery's link rows (idx_gallery_assets_gallery_id).
const sqlGalleryAssetLinkServer = `WITH inserted AS (
		 INSERT INTO gallery_assets (id, gallery_id, asset_id, sort_order, added_at)
		 SELECT $1, g.id, a.id,
		        COALESCE((SELECT MAX(ga.sort_order) FROM gallery_assets ga WHERE ga.gallery_id = g.id), 0) + 1,
		        $4
		 FROM galleries g
		 JOIN assets a ON a.workspace_id = g.workspace_id
		 WHERE g.id = $2 AND a.id = $3 AND a.deleted_at IS NULL
		   AND g.workspace_id = $5
		 ON CONFLICT (gallery_id, asset_id) DO NOTHING
		 RETURNING gallery_id, asset_id, sort_order, added_at
		),
		linked AS (
		 SELECT gallery_id, asset_id FROM inserted
		 UNION ALL
		 SELECT ga.gallery_id, ga.asset_id
		 FROM gallery_assets ga
		 JOIN galleries g ON g.id = ga.gallery_id
		 JOIN assets a ON a.id = ga.asset_id AND a.workspace_id = g.workspace_id
		 WHERE ga.gallery_id = $2
		   AND ga.asset_id = $3
		   AND g.workspace_id = $5
		   AND a.deleted_at IS NULL
		   AND NOT EXISTS (SELECT 1 FROM inserted)
		),
		cover_candidates AS (
		 SELECT gallery_id, asset_id, sort_order, added_at FROM inserted
		 UNION ALL
		 SELECT ga.gallery_id, ga.asset_id, ga.sort_order, ga.added_at
		 FROM gallery_assets ga
		 JOIN galleries g ON g.id = ga.gallery_id
		 JOIN assets a ON a.id = ga.asset_id AND a.workspace_id = g.workspace_id
		 WHERE ga.gallery_id = $2
		   AND g.workspace_id = $5
		   AND a.deleted_at IS NULL
		),
		default_cover AS (
		 UPDATE galleries g
		 SET cover_asset_id = (
		       SELECT cc.asset_id
		       FROM cover_candidates cc
		       WHERE cc.gallery_id = g.id
		       ORDER BY cc.sort_order ASC, cc.added_at ASC, cc.asset_id ASC
		       LIMIT 1
		     ),
		     updated_at = $4
		 WHERE g.id = $2
		   AND g.workspace_id = $5
		   AND NOT EXISTS (
		     SELECT 1
		     FROM assets current_cover
		     WHERE current_cover.id = g.cover_asset_id
		       AND current_cover.workspace_id = g.workspace_id
		       AND current_cover.deleted_at IS NULL
		   )
		   AND EXISTS (SELECT 1 FROM linked)
		 RETURNING g.id
		)
		SELECT EXISTS (SELECT 1 FROM inserted),
		       EXISTS (SELECT 1 FROM linked),
		       EXISTS (SELECT 1 FROM default_cover)`

// LinkFinalizedAsset links a just-finalized upload asset into a gallery
// server-side, assigning the next sort_order within the gallery and treating an
// already-linked asset as a no-op (idempotent). workspaceID is the session's
// workspace (already validated to own the gallery at CreateSession time); the
// DB-level workspace join is the authoritative guard. A cross-workspace or
// missing/deleted asset links no row and returns ErrAssetNotInWorkspace.
//
// Unlike Add, a no-op caused by an existing link is NOT an error: ON CONFLICT
// DO NOTHING means the legacy client link winning the race still leaves this
// call successful. The SQL returns whether the asset is now linked (new insert
// or pre-existing active link); if neither is true, the asset was foreign,
// missing, or deleted.
func (r *GalleryAssetRepo) LinkFinalizedAsset(ctx context.Context, galleryID, assetID, workspaceID uuid.UUID) error {
	var inserted bool
	var linked bool
	var defaulted bool
	err := r.pool.QueryRow(ctx, sqlGalleryAssetLinkServer,
		uuid.New(), galleryID, assetID, time.Now(), workspaceID,
	).Scan(&inserted, &linked, &defaulted)
	if err != nil {
		return fmt.Errorf("gallery asset link finalized: %w", err)
	}
	_ = defaulted // scanned so the data-modifying CTE is part of the query contract.
	if inserted || linked {
		return nil
	}
	return ErrAssetNotInWorkspace
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

// sqlGalleryAssetListByGallery hides stale junction rows for assets that have
// already been soft-deleted. The purge worker eventually removes those rows,
// but the dashboard list must not surface them as unresolved cards in the
// meantime.
const sqlGalleryAssetListByGallery = `SELECT ga.id, ga.gallery_id, ga.asset_id, ga.sort_order, ga.is_hero, ga.added_at
		 FROM gallery_assets ga
		 JOIN assets a ON a.id = ga.asset_id
		 WHERE ga.gallery_id = $1 AND a.deleted_at IS NULL
		 ORDER BY ga.sort_order ASC`

const sqlGalleryAssetDeletableIDsForGallery = `SELECT DISTINCT ga.asset_id
		 FROM gallery_assets ga
		 JOIN assets a ON a.id = ga.asset_id
		 WHERE ga.gallery_id = $1
		   AND a.deleted_at IS NULL
		   AND NOT EXISTS (
		     SELECT 1
		     FROM gallery_assets other_ga
		     JOIN galleries other_g ON other_g.id = other_ga.gallery_id
		     WHERE other_ga.asset_id = ga.asset_id
		       AND other_ga.gallery_id <> ga.gallery_id
		       AND other_g.deleted_at IS NULL
		   )`

const sqlGalleryAssetOrphanedIDsForWorkspace = `SELECT DISTINCT ga.asset_id
		 FROM gallery_assets ga
		 JOIN assets a ON a.id = ga.asset_id
		 WHERE a.workspace_id = $1
		   AND a.deleted_at IS NULL
		   AND NOT EXISTS (
		     SELECT 1
		     FROM gallery_assets live_ga
		     JOIN galleries live_g ON live_g.id = live_ga.gallery_id
		     WHERE live_ga.asset_id = ga.asset_id
		       AND live_g.workspace_id = $1
		       AND live_g.deleted_at IS NULL
		   )`

// ListByGallery returns all active assets in a gallery ordered by sort_order.
func (r *GalleryAssetRepo) ListByGallery(ctx context.Context, galleryID uuid.UUID) ([]GalleryAsset, error) {
	rows, err := r.pool.Query(ctx, sqlGalleryAssetListByGallery, galleryID)
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

// ListDeletableAssetIDsForGallery returns active assets whose only live gallery
// membership is the gallery being deleted. Assets shared with any other live
// gallery are preserved.
func (r *GalleryAssetRepo) ListDeletableAssetIDsForGallery(ctx context.Context, galleryID uuid.UUID) ([]uuid.UUID, error) {
	rows, err := r.pool.Query(ctx, sqlGalleryAssetDeletableIDsForGallery, galleryID)
	if err != nil {
		return nil, fmt.Errorf("gallery asset deletable ids: %w", err)
	}
	defer rows.Close()

	var ids []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("gallery asset deletable ids scan: %w", err)
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// ListOrphanedAssetIDsForWorkspace returns active workspace assets that were
// linked to at least one gallery but no longer belong to any live gallery.
// Running this after gallery deletion closes the "delete all galleries" race
// where concurrent deletes could each see the other gallery as live before both
// are soft-deleted, and it also repairs older orphaned gallery photos.
func (r *GalleryAssetRepo) ListOrphanedAssetIDsForWorkspace(ctx context.Context, workspaceID uuid.UUID) ([]uuid.UUID, error) {
	rows, err := r.pool.Query(ctx, sqlGalleryAssetOrphanedIDsForWorkspace, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("gallery asset orphaned ids: %w", err)
	}
	defer rows.Close()

	var ids []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("gallery asset orphaned ids scan: %w", err)
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// GetFirstAssetID returns the first asset ID in a gallery (by sort_order).
func (r *GalleryAssetRepo) GetFirstAssetID(ctx context.Context, galleryID uuid.UUID) (*uuid.UUID, error) {
	var assetID uuid.UUID
	err := r.pool.QueryRow(ctx,
		`SELECT ga.asset_id
		 FROM gallery_assets ga
		 JOIN assets a ON a.id = ga.asset_id
		 WHERE ga.gallery_id = $1 AND a.deleted_at IS NULL
		 ORDER BY ga.sort_order ASC LIMIT 1`,
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

// reorderSQL is the single set-based statement that applies every sort_order
// update in one round-trip via parallel arrays, avoiding N UPDATEs in a loop.
const reorderSQL = `UPDATE gallery_assets AS ga
	SET sort_order = v.sort_order
	FROM unnest($1::uuid[], $2::int[]) AS v(asset_id, sort_order)
	WHERE ga.gallery_id = $3 AND ga.asset_id = v.asset_id`

// buildReorderArrays splits reorder items into parallel asset_id / sort_order
// slices for the unnest-based UPDATE. Kept pure so it can be unit-tested
// independently of the database.
func buildReorderArrays(items []ReorderItem) ([]uuid.UUID, []int32) {
	assetIDs := make([]uuid.UUID, len(items))
	sortOrders := make([]int32, len(items))
	for i, item := range items {
		assetIDs[i] = item.AssetID
		sortOrders[i] = int32(item.SortOrder)
	}
	return assetIDs, sortOrders
}

// Reorder updates sort_order for multiple assets in a single round-trip.
//
// Instead of issuing one UPDATE per item (N round-trips holding a transaction
// open and increasing lock contention), it sends two parallel arrays and joins
// them server-side via unnest, so a 500-photo re-sort is a single statement.
func (r *GalleryAssetRepo) Reorder(ctx context.Context, galleryID uuid.UUID, items []ReorderItem) error {
	if len(items) == 0 {
		return nil
	}

	assetIDs, sortOrders := buildReorderArrays(items)

	if _, err := r.pool.Exec(ctx, reorderSQL, assetIDs, sortOrders, galleryID); err != nil {
		return fmt.Errorf("gallery asset reorder: %w", err)
	}
	return nil
}
