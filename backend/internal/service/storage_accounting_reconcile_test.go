package service

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestStorageAccounting_ReconcileWorkspaceRecomputesFromLiveAssets(t *testing.T) {
	pool := getServiceTestPool(t)
	ctx := context.Background()
	wsID := seedStorageAccountingWorkspace(t, ctx, pool)
	assetA := seedStorageAccountingAsset(t, ctx, pool, wsID, 1000, nil)
	assetB := seedStorageAccountingAsset(t, ctx, pool, wsID, 2000, nil)
	seedStorageAccountingDerivative(t, ctx, pool, assetA, "display_webp", 250)
	seedStorageAccountingDerivative(t, ctx, pool, assetB, "thumb_sm_webp", 50)

	_, err := pool.Exec(ctx,
		`INSERT INTO workspace_storage (workspace_id, used_bytes, derivative_bytes, reserved_bytes, quota_bytes, grace_bytes)
		 VALUES ($1, 99999, 88888, 777, 123456, 555)
		 ON CONFLICT (workspace_id) DO UPDATE
		    SET used_bytes = 99999,
		        derivative_bytes = 88888,
		        reserved_bytes = 777,
		        quota_bytes = 123456,
		        grace_bytes = 555`,
		wsID)
	require.NoError(t, err)

	usage, err := NewStorageAccounting(pool).ReconcileWorkspace(ctx, wsID)
	require.NoError(t, err)

	assert.Equal(t, int64(3000), usage.UsedBytes)
	assert.Equal(t, int64(300), usage.DerivativeBytes)
	assert.Equal(t, int64(777), usage.ReservedBytes, "reserved bytes are not derived from asset rows")
	assert.Equal(t, int64(123456), usage.QuotaBytes, "quota must be preserved")
	assert.Equal(t, int64(555), usage.GraceBytes, "grace bytes must be preserved")
}

func TestStorageAccounting_ReconcileAllRecomputesDriftedRows(t *testing.T) {
	pool := getServiceTestPool(t)
	ctx := context.Background()
	wsID := seedStorageAccountingWorkspace(t, ctx, pool)
	assetID := seedStorageAccountingAsset(t, ctx, pool, wsID, 4096, nil)
	seedStorageAccountingDerivative(t, ctx, pool, assetID, "display_webp", 512)
	_, err := pool.Exec(ctx,
		`INSERT INTO workspace_storage (workspace_id, used_bytes, derivative_bytes, quota_bytes)
		 VALUES ($1, 1, 2, 987654)
		 ON CONFLICT (workspace_id) DO UPDATE
		    SET used_bytes = 1,
		        derivative_bytes = 2,
		        quota_bytes = 987654`,
		wsID)
	require.NoError(t, err)

	changed, err := NewStorageAccounting(pool).ReconcileAll(ctx)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, changed, int64(1))

	var usedBytes, derivativeBytes, quotaBytes int64
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT used_bytes, derivative_bytes, quota_bytes
		   FROM workspace_storage
		  WHERE workspace_id = $1`,
		wsID).Scan(&usedBytes, &derivativeBytes, &quotaBytes))
	assert.Equal(t, int64(4096), usedBytes)
	assert.Equal(t, int64(512), derivativeBytes)
	assert.Equal(t, int64(987654), quotaBytes)
}

func seedStorageAccountingWorkspace(t *testing.T, ctx context.Context, pool *pgxpool.Pool) uuid.UUID {
	t.Helper()
	var stateID int
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM states LIMIT 1`).Scan(&stateID))
	var ownerID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO users (display_name, state_id, created_at, updated_at)
		 VALUES ('Storage Accounting Owner', $1, NOW(), NOW()) RETURNING id`,
		stateID).Scan(&ownerID))
	var wsID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO workspaces (name, state_id, owner_id, created_at)
		 VALUES ('Storage Accounting WS', $1, $2, NOW()) RETURNING id`,
		stateID, ownerID).Scan(&wsID))
	t.Cleanup(func() {
		c := context.Background()
		_, _ = pool.Exec(c, `DELETE FROM workspaces WHERE id = $1`, wsID)
		_, _ = pool.Exec(c, `DELETE FROM users WHERE id = $1`, ownerID)
	})
	return wsID
}

func seedStorageAccountingAsset(t *testing.T, ctx context.Context, pool *pgxpool.Pool, workspaceID uuid.UUID, sizeBytes int64, deletedAt any) uuid.UUID {
	t.Helper()
	id := uuid.New()
	_, err := pool.Exec(ctx,
		`INSERT INTO assets (id, workspace_id, filename, content_type, size_bytes, storage_key,
		   status, deleted_at, created_at, updated_at)
		 VALUES ($1, $2, $3, 'image/jpeg', $4, $5, 'ready', $6, NOW(), NOW())`,
		id, workspaceID, "storage_accounting_"+uuid.NewString()+".jpg", sizeBytes, "ws/"+workspaceID.String()+"/"+id.String(), deletedAt)
	require.NoError(t, err)
	return id
}

func seedStorageAccountingDerivative(t *testing.T, ctx context.Context, pool *pgxpool.Pool, assetID uuid.UUID, variant string, sizeBytes int64) {
	t.Helper()
	_, err := pool.Exec(ctx,
		`INSERT INTO asset_derivatives (asset_id, variant, storage_key, size_bytes, format)
		 VALUES ($1, $2, $3, $4, 'webp')`,
		assetID, variant, "derivatives/"+assetID.String()+"/"+variant+".webp", sizeBytes)
	require.NoError(t, err)
}
