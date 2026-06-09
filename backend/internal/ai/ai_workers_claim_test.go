package ai

import (
	"context"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

// TestAIWorkers_ClaimPending_NoDoubleClaimAndTypeIsolated is the #46 regression
// guard. The aesthetic / burst / duplicate workers now claim ai_jobs via the
// atomic JobRepo.ClaimPending (pending → running + claimed_at) instead of the
// non-atomic ListPending-then-mark. Because all three share the ai_jobs table,
// the test seeds jobs of all three types in one workspace and drains each type
// with concurrent claimers, asserting (a) every job of a type is claimed exactly
// once and (b) a type's claimer never steals another type's job (type isolation).
func TestAIWorkers_ClaimPending_NoDoubleClaimAndTypeIsolated(t *testing.T) {
	pool := getAITestPool(t)
	ctx := context.Background()
	repo := NewJobRepo(pool)

	const perType = 16
	wsID, byType := seedMultiTypeAIJobs(t, ctx, pool, perType,
		"aesthetic_scoring", "burst_grouping", "duplicate_scan", "culling")
	_ = wsID

	for jobType, wantIDs := range byType {
		want := map[uuid.UUID]bool{}
		for _, id := range wantIDs {
			want[id] = true
		}

		var mu sync.Mutex
		counts := map[uuid.UUID]int{}
		var wg sync.WaitGroup
		start := make(chan struct{})
		errCh := make(chan error, 4)
		for i := 0; i < 4; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				<-start
				for {
					jobs, err := repo.ClaimPending(ctx, jobType, 4, 600)
					if err != nil {
						errCh <- err
						return
					}
					if len(jobs) == 0 {
						return
					}
					mu.Lock()
					for _, j := range jobs {
						counts[j.ID]++
					}
					mu.Unlock()
				}
			}()
		}
		close(start)
		wg.Wait()
		close(errCh)
		for err := range errCh {
			require.NoError(t, err)
		}

		for _, id := range wantIDs {
			require.Equalf(t, 1, counts[id],
				"%s job %s must be claimed exactly once, got %d", jobType, id, counts[id])
		}
		for id, c := range counts {
			require.LessOrEqualf(t, c, 1, "%s job %s double-claimed (%d)", jobType, id, c)
			require.Truef(t, want[id],
				"type isolation: ClaimPending(%s) returned a job (%s) of a different type", jobType, id)
		}
	}
}

// seedMultiTypeAIJobs creates one workspace with `perType` pending ai_jobs for
// each given type, returning the workspace id and a type→ids map.
func seedMultiTypeAIJobs(t *testing.T, ctx context.Context, pool *pgxpool.Pool, perType int, types ...string) (uuid.UUID, map[string][]uuid.UUID) {
	t.Helper()
	var stateID int
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM states LIMIT 1`).Scan(&stateID))
	var ownerID, wsID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO users (display_name, state_id, created_at, updated_at)
		 VALUES ('AIClaim Owner', $1, NOW(), NOW()) RETURNING id`, stateID).Scan(&ownerID))
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO workspaces (name, state_id, owner_id, created_at)
		 VALUES ('AIClaim WS', $1, $2, NOW()) RETURNING id`, stateID, ownerID).Scan(&wsID))

	byType := map[string][]uuid.UUID{}
	for _, jt := range types {
		for i := 0; i < perType; i++ {
			var id uuid.UUID
			require.NoError(t, pool.QueryRow(ctx,
				`INSERT INTO ai_jobs (workspace_id, type, status, total_items, processed_items, result, created_at, updated_at)
				 VALUES ($1, $2, 'pending', 0, 0, '{}'::jsonb, now(), now()) RETURNING id`,
				wsID, jt).Scan(&id))
			byType[jt] = append(byType[jt], id)
		}
	}

	t.Cleanup(func() {
		c := context.Background()
		_, _ = pool.Exec(c, `DELETE FROM ai_jobs WHERE workspace_id = $1`, wsID)
		_, _ = pool.Exec(c, `DELETE FROM workspaces WHERE id = $1`, wsID)
		_, _ = pool.Exec(c, `DELETE FROM users WHERE id = $1`, ownerID)
	})
	return wsID, byType
}
