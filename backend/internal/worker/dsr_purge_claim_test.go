package worker

import (
	"context"
	"fmt"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

// TestDSRPurgeWorker_ClaimBatch_NoDoubleClaimUnderConcurrency is the regression
// guard for the DSR double-erasure race. Before the atomic claim, processBatch()
// ran a standalone SELECT ... FOR UPDATE SKIP LOCKED whose locks released the
// moment the result set drained, then marked rows 'processing' separately — so
// two workers could claim the same row and erase a subject's data twice. The
// atomic claimBatch() flips pending → processing and stamps claimed_at in one
// statement, so every request is claimed by exactly one worker.
func TestDSRPurgeWorker_ClaimBatch_NoDoubleClaimUnderConcurrency(t *testing.T) {
	pool := getWorkerTestPool(t)
	ctx := context.Background()

	const numRows = 24
	wantIDs := seedPendingDSRRequests(t, ctx, pool, numRows)

	// processAccess is required (non-nil); the test only exercises claimBatch.
	w := NewDSRPurgeWorker(pool, func(context.Context, uuid.UUID) error { return nil })

	counts := drainConcurrently(t, 4, func() ([]uuid.UUID, error) {
		batch, err := w.claimBatch(ctx, 5)
		if err != nil {
			return nil, err
		}
		ids := make([]uuid.UUID, len(batch))
		for i, p := range batch {
			ids[i] = p.ID
		}
		return ids, nil
	})

	assertClaimedExactlyOnce(t, counts, wantIDs)
}

// seedPendingDSRRequests inserts `n` pending erasure requests and returns their
// ids, cleaned up via t.Cleanup. dsr_requests has no workspace FK, so no
// surrounding workspace is needed.
func seedPendingDSRRequests(t *testing.T, ctx context.Context, pool *pgxpool.Pool, n int) []uuid.UUID {
	t.Helper()
	ids := make([]uuid.UUID, 0, n)
	for i := 0; i < n; i++ {
		var id uuid.UUID
		require.NoError(t, pool.QueryRow(ctx,
			`INSERT INTO dsr_requests (subject_email, request_type, status, requested_at)
			 VALUES ($1, 'erasure', 'pending', now()) RETURNING id`,
			fmt.Sprintf("subject%d@example.test", i)).Scan(&id))
		ids = append(ids, id)
	}
	t.Cleanup(func() {
		c := context.Background()
		for _, id := range ids {
			_, _ = pool.Exec(c, `DELETE FROM dsr_requests WHERE id = $1`, id)
		}
	})
	return ids
}
