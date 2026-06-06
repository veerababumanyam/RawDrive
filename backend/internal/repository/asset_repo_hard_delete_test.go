package repository

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestHardDelete_CascadesDependentsAndClearsRestrictRefs proves the synchronous
// hard-delete path that replaced the soft-delete + 30-day AssetPurgeWorker:
//
//   - ON DELETE CASCADE dependents (asset_derivatives, gallery_assets) are removed
//     automatically by deleting the asset row.
//   - The two ON DELETE RESTRICT references that would otherwise block the delete —
//     products.asset_id and burst_groups.best_pick_id — are pre-nulled, so the
//     DELETE succeeds and those parent rows survive with a cleared reference.
//
// DB-backed; skips when no database is available (see getRetryTestPool).
func TestHardDelete_CascadesDependentsAndClearsRestrictRefs(t *testing.T) {
	pool := getRetryTestPool(t)
	repo := NewAssetRepo(pool)
	ctx := context.Background()

	workspaceID := newRetryWorkspace(t, ctx, repo, "HardDelete")
	assetID := seedRetryAsset(t, ctx, repo, workspaceID, "ready", 0, nil)

	// Gallery + membership (gallery_assets is ON DELETE CASCADE).
	galleryID := uuid.New()
	_, err := pool.Exec(ctx,
		`INSERT INTO galleries (id, workspace_id, title, slug, created_at, updated_at)
		 VALUES ($1, $2, 'HD Gallery', $3, NOW(), NOW())`,
		galleryID, workspaceID, "hd-gallery-"+uuid.NewString())
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM galleries WHERE id = $1`, galleryID)
	})

	_, err = pool.Exec(ctx,
		`INSERT INTO gallery_assets (gallery_id, asset_id, sort_order) VALUES ($1, $2, 0)`,
		galleryID, assetID)
	require.NoError(t, err)

	// CASCADE dependent: a WebP derivative.
	_, err = pool.Exec(ctx,
		`INSERT INTO asset_derivatives (asset_id, variant, storage_key, size_bytes, format)
		 VALUES ($1, 'thumb_sm', $2, 1024, 'webp')`,
		assetID, "ws/"+workspaceID.String()+"/thumb_"+uuid.NewString())
	require.NoError(t, err)

	// RESTRICT ref 1: a sale product that featured this photo.
	productID := uuid.New()
	_, err = pool.Exec(ctx,
		`INSERT INTO gallery_products (id, gallery_id, workspace_id, name, asset_id)
		 VALUES ($1, $2, $3, 'Print', $4)`,
		productID, galleryID, workspaceID, assetID)
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM gallery_products WHERE id = $1`, productID)
	})

	// RESTRICT ref 2: a burst group whose AI best-pick is this photo.
	burstID := uuid.New()
	_, err = pool.Exec(ctx,
		`INSERT INTO burst_groups (id, gallery_id, best_pick_id) VALUES ($1, $2, $3)`,
		burstID, galleryID, assetID)
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM burst_groups WHERE id = $1`, burstID)
	})

	// Act: permanent hard delete.
	require.NoError(t, repo.HardDelete(ctx, assetID))

	// The asset row is gone.
	var assetCount int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT count(*) FROM assets WHERE id = $1`, assetID).Scan(&assetCount))
	assert.Equal(t, 0, assetCount, "asset row must be hard-deleted")

	// CASCADE dependents are gone.
	var derivCount, gaCount int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT count(*) FROM asset_derivatives WHERE asset_id = $1`, assetID).Scan(&derivCount))
	assert.Equal(t, 0, derivCount, "derivatives must cascade-delete")
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT count(*) FROM gallery_assets WHERE asset_id = $1`, assetID).Scan(&gaCount))
	assert.Equal(t, 0, gaCount, "gallery_assets must cascade-delete")

	// RESTRICT parents survive with the reference cleared (not deleted).
	var productAsset *uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT asset_id FROM gallery_products WHERE id = $1`, productID).Scan(&productAsset))
	assert.Nil(t, productAsset, "gallery_products.asset_id must be nulled and the product preserved")

	var burstPick *uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT best_pick_id FROM burst_groups WHERE id = $1`, burstID).Scan(&burstPick))
	assert.Nil(t, burstPick, "burst_groups.best_pick_id must be nulled and the group preserved")
}

// TestHardDelete_MissingAssetReturnsError ensures deleting an unknown id is an
// error (RowsAffected == 0), so callers never silently believe a no-op succeeded.
func TestHardDelete_MissingAssetReturnsError(t *testing.T) {
	pool := getRetryTestPool(t)
	repo := NewAssetRepo(pool)
	require.Error(t, repo.HardDelete(context.Background(), uuid.New()))
}
