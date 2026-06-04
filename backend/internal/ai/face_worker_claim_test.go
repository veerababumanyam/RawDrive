package ai

// DB-backed test harness for the ai package's atomic-claim regression test.
// Mirrors the worker package's harness: resolve a DSN once (DATABASE_URL, else
// the shared testsupport pgvector testcontainer which runs the real migrator so
// ai_jobs.claimed_at exists), and SKIP gracefully when no DB is available so a
// hermetic CI run still passes. The other ai tests are pure and unaffected.

import (
	"context"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/tests/testsupport"
)

var (
	aiTestDSN     string
	aiDSNInitErr  error
	aiMainStarted bool
)

func TestMain(m *testing.M) {
	aiMainStarted = true
	if envDSN := os.Getenv("DATABASE_URL"); envDSN != "" {
		aiTestDSN = envDSN
	} else {
		dsn, err := testsupport.EnsureDSN()
		if err != nil {
			aiDSNInitErr = err
			fmt.Fprintf(os.Stderr, "ai_test: no DB available: %v (db-backed tests will skip)\n", err)
		} else {
			aiTestDSN = dsn
		}
	}
	code := m.Run()
	testsupport.Shutdown()
	os.Exit(code)
}

func getAITestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	if !aiMainStarted {
		t.Skip("ai_test: TestMain did not run; DSN unresolved")
	}
	if aiDSNInitErr != nil {
		t.Skipf("ai_test: no database available: %v", aiDSNInitErr)
	}
	if aiTestDSN == "" {
		t.Skip("ai_test: DATABASE_URL unset and testcontainers unavailable")
	}
	cfg, err := pgxpool.ParseConfig(aiTestDSN)
	if err != nil {
		t.Skipf("ai_test: invalid DSN: %v", err)
	}
	cfg.ConnConfig.ConnectTimeout = 3 * time.Second
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Skipf("ai_test: opening pool: %v", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		t.Skipf("ai_test: postgres ping failed (container may be hung): %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

// TestFaceWorker_ClaimPending_NoDoubleClaimUnderConcurrency is the regression
// guard for the face double-detection race. Before the atomic claim, the worker
// listed ai_jobs (status='pending') with a plain SELECT and flipped them to
// 'running' separately, so two workers could run face-detection ML on the same
// job's assets twice. ClaimPending flips pending → running + stamps claimed_at
// atomically under FOR UPDATE SKIP LOCKED, so every job is claimed exactly once.
func TestFaceWorker_ClaimPending_NoDoubleClaimUnderConcurrency(t *testing.T) {
	pool := getAITestPool(t)
	ctx := context.Background()
	repo := NewJobRepo(pool)

	const numJobs = 24
	wantIDs := seedPendingFaceJobs(t, ctx, pool, numJobs)
	leaseSecs := faceClaimLease.Seconds()

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
				jobs, err := repo.ClaimPending(ctx, "face_detection", 5, leaseSecs)
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
			"face job %s must be claimed exactly once across concurrent workers (got %d)", id, counts[id])
	}
	for id, c := range counts {
		require.LessOrEqualf(t, c, 1,
			"face job %s was claimed %d times — a count>1 is the double-detection bug", id, c)
	}
}

// seedPendingFaceJobs creates a workspace and `n` pending face_detection jobs,
// returning their ids. Cleaned up via t.Cleanup.
func seedPendingFaceJobs(t *testing.T, ctx context.Context, pool *pgxpool.Pool, n int) []uuid.UUID {
	t.Helper()
	var stateID int
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM states LIMIT 1`).Scan(&stateID))

	var ownerID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO users (display_name, state_id, created_at, updated_at)
		 VALUES ('Face Claim Owner', $1, NOW(), NOW()) RETURNING id`, stateID).Scan(&ownerID))

	var wsID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO workspaces (name, state_id, owner_id, created_at)
		 VALUES ('Face Claim WS', $1, $2, NOW()) RETURNING id`, stateID, ownerID).Scan(&wsID))

	ids := make([]uuid.UUID, 0, n)
	for i := 0; i < n; i++ {
		var id uuid.UUID
		require.NoError(t, pool.QueryRow(ctx,
			`INSERT INTO ai_jobs (workspace_id, type, status, total_items, processed_items, result, created_at, updated_at)
			 VALUES ($1, 'face_detection', 'pending', 0, 0, '{}'::jsonb, now(), now()) RETURNING id`,
			wsID).Scan(&id))
		ids = append(ids, id)
	}

	t.Cleanup(func() {
		c := context.Background()
		_, _ = pool.Exec(c, `DELETE FROM ai_jobs WHERE workspace_id = $1`, wsID)
		_, _ = pool.Exec(c, `DELETE FROM workspaces WHERE id = $1`, wsID)
		_, _ = pool.Exec(c, `DELETE FROM users WHERE id = $1`, ownerID)
	})

	return ids
}
