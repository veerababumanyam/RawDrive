package worker

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/repository"
)

// TestThumbnailWorker_ClaimRetryable_NoDoubleClaimUnderConcurrency is the
// regression guard for the thumbnail double-encode race. Before the atomic
// claim, the worker listed status='processing' assets with a plain SELECT
// (ListRetryable) and the row stayed 'processing' for the whole download → cwebp
// encode → upload, so two workers double-encoded every WebP variant and
// double-counted workspace_storage. ClaimRetryable stamps claimed_at atomically
// under FOR UPDATE SKIP LOCKED, so every asset is claimed by exactly one worker.
func TestThumbnailWorker_ClaimRetryable_NoDoubleClaimUnderConcurrency(t *testing.T) {
	pool := getWorkerTestPool(t)
	ctx := context.Background()

	repo := repository.NewAssetRepo(pool)
	const numAssets = 24
	wantIDs := seedProcessingAssets(t, ctx, pool, numAssets)
	leaseSecs := thumbnailClaimLease.Seconds()

	counts := drainConcurrently(t, 4, func() ([]uuid.UUID, error) {
		assets, err := repo.ClaimRetryable(ctx, 5, leaseSecs)
		if err != nil {
			return nil, err
		}
		ids := make([]uuid.UUID, len(assets))
		for i, a := range assets {
			ids[i] = a.ID
		}
		return ids, nil
	})

	assertClaimedExactlyOnce(t, counts, wantIDs)
}

// seedProcessingAssets creates a workspace and `n` assets in status='processing'
// (the post-upload "needs derivatives" state), returning the asset ids. Cleaned
// up via t.Cleanup.
func seedProcessingAssets(t *testing.T, ctx context.Context, pool *pgxpool.Pool, n int) []uuid.UUID {
	t.Helper()
	stateID := seedStateID(t, ctx, pool)

	var ownerID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO users (display_name, state_id, created_at, updated_at)
		 VALUES ('Thumb Claim Owner', $1, NOW(), NOW()) RETURNING id`, stateID).Scan(&ownerID))

	var wsID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO workspaces (name, state_id, owner_id, created_at)
		 VALUES ('Thumb Claim WS', $1, $2, NOW()) RETURNING id`, stateID, ownerID).Scan(&wsID))

	ids := make([]uuid.UUID, 0, n)
	for i := 0; i < n; i++ {
		id := uuid.New()
		_, err := pool.Exec(ctx,
			`INSERT INTO assets (id, workspace_id, filename, content_type, size_bytes, storage_key,
			   status, retry_count, created_at, updated_at)
			 VALUES ($1, $2, $3, 'image/jpeg', 1024, $4, 'processing', 0, NOW(), NOW())`,
			id, wsID, "thumb_"+uuid.NewString()+".jpg", "ws/"+wsID.String()+"/"+uuid.NewString())
		require.NoError(t, err)
		ids = append(ids, id)
	}

	t.Cleanup(func() {
		c := context.Background()
		_, _ = pool.Exec(c, `DELETE FROM assets WHERE workspace_id = $1`, wsID)
		_, _ = pool.Exec(c, `DELETE FROM workspaces WHERE id = $1`, wsID)
		_, _ = pool.Exec(c, `DELETE FROM users WHERE id = $1`, ownerID)
	})

	return ids
}
