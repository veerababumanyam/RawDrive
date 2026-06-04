package worker

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/repository"
)

// TestDownloadWorker_ClaimPendingJobs_NoDoubleClaimUnderConcurrency is the
// regression guard for the download double-ZIP race. Before the atomic claim,
// the worker listed pending jobs (a SELECT ... FOR UPDATE SKIP LOCKED whose lock
// released the instant the result set drained) and marked them 'processing' in a
// separate statement, so two workers could claim the same job and build the same
// ZIP twice. ClaimPendingJobs flips pending → processing + stamps claimed_at
// atomically, so every job is claimed by exactly one worker.
func TestDownloadWorker_ClaimPendingJobs_NoDoubleClaimUnderConcurrency(t *testing.T) {
	pool := getWorkerTestPool(t)
	ctx := context.Background()

	const numJobs = 24
	wantIDs := seedPendingDownloadJobs(t, ctx, pool, numJobs)

	repo := repository.NewDownloadRepo(pool)
	leaseSecs := downloadClaimLease.Seconds()

	counts := drainConcurrently(t, 4, func() ([]uuid.UUID, error) {
		jobs, err := repo.ClaimPendingJobs(ctx, 5, leaseSecs)
		if err != nil {
			return nil, err
		}
		ids := make([]uuid.UUID, len(jobs))
		for i, j := range jobs {
			ids[i] = j.ID
		}
		return ids, nil
	})

	assertClaimedExactlyOnce(t, counts, wantIDs)
}

// seedPendingDownloadJobs creates a workspace + gallery and `n` pending download
// jobs, returning the job ids. Deleting the workspace cascades to galleries and
// download_jobs.
func seedPendingDownloadJobs(t *testing.T, ctx context.Context, pool *pgxpool.Pool, n int) []uuid.UUID {
	t.Helper()
	stateID := seedStateID(t, ctx, pool)

	var ownerID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO users (display_name, state_id, created_at, updated_at)
		 VALUES ('Download Claim Owner', $1, NOW(), NOW()) RETURNING id`, stateID).Scan(&ownerID))

	var wsID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO workspaces (name, state_id, owner_id, created_at)
		 VALUES ('Download Claim WS', $1, $2, NOW()) RETURNING id`, stateID, ownerID).Scan(&wsID))

	var galleryID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO galleries (workspace_id, title, created_at)
		 VALUES ($1, 'Download Claim Gallery', NOW()) RETURNING id`, wsID).Scan(&galleryID))

	ids := make([]uuid.UUID, 0, n)
	for i := 0; i < n; i++ {
		var id uuid.UUID
		require.NoError(t, pool.QueryRow(ctx,
			`INSERT INTO download_jobs (gallery_id, workspace_id, status, total_assets)
			 VALUES ($1, $2, 'pending', 1) RETURNING id`, galleryID, wsID).Scan(&id))
		ids = append(ids, id)
	}

	t.Cleanup(func() {
		c := context.Background()
		_, _ = pool.Exec(c, `DELETE FROM workspaces WHERE id = $1`, wsID)
		_, _ = pool.Exec(c, `DELETE FROM users WHERE id = $1`, ownerID)
	})

	return ids
}
