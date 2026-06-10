package handler

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/repository"
)

func TestSharedGalleryReadAccessAllowsSharedWorkspaceAssetRefetch(t *testing.T) {
	ctx := context.Background()
	pool := includeAssetsTestPool(t)

	var stateID int
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM states LIMIT 1`).Scan(&stateID))

	var ownerID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO users (email, display_name, state_id, created_at, updated_at)
		 VALUES ($1, 'Shared Read Owner', $2, NOW(), NOW()) RETURNING id`,
		"shared-read-owner-"+uuid.NewString()+"@rawdrive.test", stateID,
	).Scan(&ownerID))

	var sharedID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO users (email, display_name, state_id, created_at, updated_at)
		 VALUES ($1, 'Shared Read Target', $2, NOW(), NOW()) RETURNING id`,
		"shared-read-target-"+uuid.NewString()+"@rawdrive.test", stateID,
	).Scan(&sharedID))

	var ownerWorkspaceID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO workspaces (name, state_id, owner_id, created_at)
		 VALUES ('Shared Read Owner Workspace', $1, $2, NOW()) RETURNING id`,
		stateID, ownerID,
	).Scan(&ownerWorkspaceID))

	var sharedWorkspaceID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO workspaces (name, state_id, owner_id, created_at)
		 VALUES ('Shared Read Target Workspace', $1, $2, NOW()) RETURNING id`,
		stateID, sharedID,
	).Scan(&sharedWorkspaceID))

	galleryRepo := repository.NewGalleryRepo(pool)
	galleryAssetRepo := repository.NewGalleryAssetRepo(pool)
	assetRepo := repository.NewAssetRepo(pool)
	gallery := &repository.Gallery{
		WorkspaceID: ownerWorkspaceID,
		Title:       "Shared Read Gallery",
		GalleryType: "proofing",
		Status:      "draft",
		CreatedBy:   &ownerID,
	}
	require.NoError(t, galleryRepo.Create(ctx, gallery))
	assetID := seedIncludeAsset(t, ctx, pool, ownerWorkspaceID, "shared-read.jpg", `{"thumb_md_webp":"thumbnails/test/thumb_md_webp.webp"}`)
	require.NoError(t, galleryAssetRepo.Add(ctx, gallery.ID, assetID, ownerWorkspaceID, 0))

	t.Cleanup(func() {
		c := context.Background()
		_, _ = pool.Exec(c, `DELETE FROM gallery_workspace_shares WHERE gallery_id = $1`, gallery.ID)
		_, _ = pool.Exec(c, `DELETE FROM gallery_assets WHERE gallery_id = $1 OR asset_id = $2`, gallery.ID, assetID)
		_, _ = pool.Exec(c, `DELETE FROM asset_derivatives WHERE asset_id = $1`, assetID)
		_, _ = pool.Exec(c, `DELETE FROM assets WHERE id = $1`, assetID)
		_, _ = pool.Exec(c, `DELETE FROM galleries WHERE id = $1`, gallery.ID)
		_, _ = pool.Exec(c, `DELETE FROM workspaces WHERE id IN ($1, $2)`, ownerWorkspaceID, sharedWorkspaceID)
		_, _ = pool.Exec(c, `DELETE FROM users WHERE id IN ($1, $2)`, ownerID, sharedID)
	})

	readable, err := galleryReadableByWorkspace(ctx, pool, gallery.ID, sharedWorkspaceID)
	require.NoError(t, err)
	require.False(t, readable)
	asset, err := assetRepo.GetByIDReadableByWorkspace(ctx, assetID, sharedWorkspaceID)
	require.NoError(t, err)
	require.Nil(t, asset)

	_, err = pool.Exec(ctx,
		`INSERT INTO gallery_workspace_shares (
		   gallery_id, owner_workspace_id, shared_workspace_id,
		   storage_billed_to_workspace_id, migrate_storage_usage, shared_by_user_id
		 ) VALUES ($1, $2, $3, $3, false, $4)`,
		gallery.ID, ownerWorkspaceID, sharedWorkspaceID, ownerID,
	)
	require.NoError(t, err)

	readable, err = galleryReadableByWorkspace(ctx, pool, gallery.ID, sharedWorkspaceID)
	require.NoError(t, err)
	require.True(t, readable)
	asset, err = assetRepo.GetByIDReadableByWorkspace(ctx, assetID, sharedWorkspaceID)
	require.NoError(t, err)
	require.NotNil(t, asset)
	require.Equal(t, assetID, asset.ID)
}
