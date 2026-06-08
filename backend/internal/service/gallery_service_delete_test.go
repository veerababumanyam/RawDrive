package service

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/repository"
)

func TestGalleryServiceSoftDeleteForWorkspaceClearsSharedAssetAfterLastGalleryDelete(t *testing.T) {
	pool := getServiceTestPool(t)
	ctx := context.Background()
	workspaceID, ownerID := seedGalleryDeleteWorkspace(t, ctx, pool)

	t.Cleanup(func() {
		c := context.Background()
		_, _ = pool.Exec(c, `DELETE FROM storage_deletion_jobs WHERE workspace_id = $1`, workspaceID)
		_, _ = pool.Exec(c, `DELETE FROM gallery_assets WHERE gallery_id IN (SELECT id FROM galleries WHERE workspace_id = $1)`, workspaceID)
		_, _ = pool.Exec(c, `DELETE FROM galleries WHERE workspace_id = $1`, workspaceID)
		_, _ = pool.Exec(c, `DELETE FROM asset_derivatives WHERE asset_id IN (SELECT id FROM assets WHERE workspace_id = $1)`, workspaceID)
		_, _ = pool.Exec(c, `DELETE FROM assets WHERE workspace_id = $1`, workspaceID)
		_, _ = pool.Exec(c, `DELETE FROM workspace_storage WHERE workspace_id = $1`, workspaceID)
		_, _ = pool.Exec(c, `DELETE FROM workspaces WHERE id = $1`, workspaceID)
		_, _ = pool.Exec(c, `DELETE FROM users WHERE id = $1`, ownerID)
	})

	assetRepo := repository.NewAssetRepo(pool)
	derivativeRepo := repository.NewAssetDerivativeRepo(pool)
	galleryRepo := repository.NewGalleryRepo(pool)
	galleryAssetRepo := repository.NewGalleryAssetRepo(pool)
	assetSvc := NewAssetService(assetRepo, nil).WithDerivativeRepo(derivativeRepo)
	gallerySvc := NewGalleryService(galleryRepo, galleryAssetRepo, nil).WithAssetDeleteService(assetSvc)

	assetID := seedGalleryDeleteAsset(t, ctx, pool, workspaceID, 1024)
	seedGalleryDeleteDerivative(t, ctx, pool, assetID, 256)
	require.NoError(t, seedGalleryDeleteStorageRow(ctx, pool, workspaceID, 1024, 256))

	firstGallery := seedGalleryDeleteGallery(t, ctx, galleryRepo, galleryAssetRepo, workspaceID, assetID, "Delete Shared A")
	secondGallery := seedGalleryDeleteGallery(t, ctx, galleryRepo, galleryAssetRepo, workspaceID, assetID, "Delete Shared B")

	require.NoError(t, gallerySvc.SoftDeleteForWorkspace(ctx, firstGallery.ID, workspaceID))
	assert.True(t, galleryDeleteAssetExists(t, ctx, pool, assetID), "asset shared by another live gallery must stay")
	usedBytes, derivativeBytes := galleryDeleteStorageBytes(t, ctx, pool, workspaceID)
	assert.Equal(t, int64(1024), usedBytes)
	assert.Equal(t, int64(256), derivativeBytes)

	require.NoError(t, gallerySvc.SoftDeleteForWorkspace(ctx, secondGallery.ID, workspaceID))
	assert.False(t, galleryDeleteAssetExists(t, ctx, pool, assetID), "last gallery delete must clear now-orphaned photo")
	usedBytes, derivativeBytes = galleryDeleteStorageBytes(t, ctx, pool, workspaceID)
	assert.Equal(t, int64(0), usedBytes)
	assert.Equal(t, int64(0), derivativeBytes)
	assert.Equal(t, 2, galleryDeleteStorageJobCount(t, ctx, pool, workspaceID, assetID))
}

func seedGalleryDeleteWorkspace(t *testing.T, ctx context.Context, pool *pgxpool.Pool) (uuid.UUID, uuid.UUID) {
	t.Helper()
	var stateID int
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM states LIMIT 1`).Scan(&stateID))
	var ownerID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO users (display_name, state_id, created_at, updated_at)
		 VALUES ('Gallery Delete Owner', $1, NOW(), NOW()) RETURNING id`,
		stateID).Scan(&ownerID))
	var workspaceID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO workspaces (name, state_id, owner_id, created_at)
		 VALUES ('Gallery Delete Workspace', $1, $2, NOW()) RETURNING id`,
		stateID, ownerID).Scan(&workspaceID))
	return workspaceID, ownerID
}

func seedGalleryDeleteAsset(t *testing.T, ctx context.Context, pool *pgxpool.Pool, workspaceID uuid.UUID, sizeBytes int64) uuid.UUID {
	t.Helper()
	id := uuid.New()
	_, err := pool.Exec(ctx,
		`INSERT INTO assets (id, workspace_id, filename, content_type, size_bytes, storage_key,
		   status, created_at, updated_at)
		 VALUES ($1, $2, $3, 'image/jpeg', $4, $5, 'ready', NOW(), NOW())`,
		id, workspaceID, "gallery_delete_"+id.String()+".jpg", sizeBytes, "originals/"+id.String()+".jpg")
	require.NoError(t, err)
	return id
}

func seedGalleryDeleteDerivative(t *testing.T, ctx context.Context, pool *pgxpool.Pool, assetID uuid.UUID, sizeBytes int64) {
	t.Helper()
	_, err := pool.Exec(ctx,
		`INSERT INTO asset_derivatives (asset_id, variant, storage_key, width, height, size_bytes, format)
		 VALUES ($1, 'display_webp', $2, 1200, 800, $3, 'webp')`,
		assetID, "derivatives/"+assetID.String()+"/display_webp.webp", sizeBytes)
	require.NoError(t, err)
}

func seedGalleryDeleteStorageRow(ctx context.Context, pool *pgxpool.Pool, workspaceID uuid.UUID, usedBytes, derivativeBytes int64) error {
	_, err := pool.Exec(ctx,
		`INSERT INTO workspace_storage (workspace_id, used_bytes, derivative_bytes, quota_bytes)
		 VALUES ($1, $2, $3, 999999)
		 ON CONFLICT (workspace_id) DO UPDATE
		    SET used_bytes = $2,
		        derivative_bytes = $3,
		        quota_bytes = 999999`,
		workspaceID, usedBytes, derivativeBytes)
	return err
}

func seedGalleryDeleteGallery(
	t *testing.T,
	ctx context.Context,
	galleryRepo *repository.GalleryRepo,
	galleryAssetRepo *repository.GalleryAssetRepo,
	workspaceID uuid.UUID,
	assetID uuid.UUID,
	title string,
) *repository.Gallery {
	t.Helper()
	gallery := &repository.Gallery{
		WorkspaceID: workspaceID,
		Title:       title + " " + uuid.NewString(),
		GalleryType: "proofing",
		Status:      "draft",
	}
	require.NoError(t, galleryRepo.Create(ctx, gallery))
	require.NoError(t, galleryAssetRepo.Add(ctx, gallery.ID, assetID, workspaceID, 1))
	return gallery
}

func galleryDeleteAssetExists(t *testing.T, ctx context.Context, pool *pgxpool.Pool, assetID uuid.UUID) bool {
	t.Helper()
	var exists bool
	require.NoError(t, pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM assets WHERE id = $1)`, assetID).Scan(&exists))
	return exists
}

func galleryDeleteStorageBytes(t *testing.T, ctx context.Context, pool *pgxpool.Pool, workspaceID uuid.UUID) (int64, int64) {
	t.Helper()
	var usedBytes, derivativeBytes int64
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT used_bytes, derivative_bytes FROM workspace_storage WHERE workspace_id = $1`,
		workspaceID).Scan(&usedBytes, &derivativeBytes))
	return usedBytes, derivativeBytes
}

func galleryDeleteStorageJobCount(t *testing.T, ctx context.Context, pool *pgxpool.Pool, workspaceID, assetID uuid.UUID) int {
	t.Helper()
	var count int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT count(*) FROM storage_deletion_jobs WHERE workspace_id = $1 AND asset_id = $2`,
		workspaceID, assetID).Scan(&count))
	return count
}
