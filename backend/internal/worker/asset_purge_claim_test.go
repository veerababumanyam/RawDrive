package worker

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

// TestAssetPurgeWorker_ClaimBatch_NoDoubleClaimUnderConcurrency is the regression
// guard for the purge double-claim race (DB-1b). Before the atomic claim, purge()
// ran a plain SELECT ... WHERE deleted_at < cutoff LIMIT 100 with no row lock, then
// looped to delete each row — so two app nodes (.42/.44) running the worker could
// select and process the same soft-deleted asset (double storage Delete + redundant
// DELETEs). claimBatch() stamps claimed_at = now() inside a single
// UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING statement, so
// every eligible row is handed to exactly one worker.
func TestAssetPurgeWorker_ClaimBatch_NoDoubleClaimUnderConcurrency(t *testing.T) {
	pool := getWorkerTestPool(t)
	ctx := context.Background()

	w := NewAssetPurgeWorker(pool, nil)
	const numAssets = 24
	wantIDs := seedPurgeableAssets(t, ctx, pool, numAssets, w.retention)
	leaseSecs := assetPurgeClaimLease.Seconds()

	counts := drainConcurrently(t, 4, func() ([]uuid.UUID, error) {
		batch, err := w.claimBatch(ctx, 5, leaseSecs)
		if err != nil {
			return nil, err
		}
		ids := make([]uuid.UUID, len(batch))
		for i, it := range batch {
			parsed, perr := uuid.Parse(it.id)
			if perr != nil {
				return nil, perr
			}
			ids[i] = parsed
		}
		return ids, nil
	})

	assertClaimedExactlyOnce(t, counts, wantIDs)
}

// seedPurgeableAssets creates a workspace and `n` soft-deleted assets whose
// deleted_at is safely past the retention cutoff (so they are eligible for purge),
// returning the asset ids. Cleaned up via t.Cleanup. The asset ids are returned as
// strings-as-uuids so they slot into the shared drainConcurrently helper.
func seedPurgeableAssets(t *testing.T, ctx context.Context, pool *pgxpool.Pool, n int, retention time.Duration) []uuid.UUID {
	t.Helper()
	stateID := seedStateID(t, ctx, pool)

	var ownerID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO users (display_name, state_id, created_at, updated_at)
		 VALUES ('Purge Claim Owner', $1, NOW(), NOW()) RETURNING id`, stateID).Scan(&ownerID))

	var wsID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO workspaces (name, state_id, owner_id, created_at)
		 VALUES ('Purge Claim WS', $1, $2, NOW()) RETURNING id`, stateID, ownerID).Scan(&wsID))

	// deleted_at well past the retention window so the rows are firmly eligible.
	deletedAt := time.Now().Add(-retention - 24*time.Hour)

	ids := make([]uuid.UUID, 0, n)
	for i := 0; i < n; i++ {
		id := uuid.New()
		_, err := pool.Exec(ctx,
			`INSERT INTO assets (id, workspace_id, filename, content_type, size_bytes, storage_key,
			   status, retry_count, created_at, updated_at, deleted_at)
			 VALUES ($1, $2, $3, 'image/jpeg', 1024, $4, 'ready', 0, NOW(), NOW(), $5)`,
			id, wsID, "purge_"+uuid.NewString()+".jpg", "ws/"+wsID.String()+"/"+uuid.NewString(), deletedAt)
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
