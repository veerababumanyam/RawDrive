package worker

// Shared DB-backed test harness for the worker package.
//
// The atomic-claim regression tests (email / DSR / webhook) need a real Postgres
// because FOR UPDATE SKIP LOCKED is server behaviour that no mock can reproduce.
// The DSN is resolved once per package: DATABASE_URL wins (point at the compose
// postgres) else the shared testsupport pgvector testcontainer, which runs the
// real production migrator so the new claimed_at columns exist. When no DB is
// available (no Docker, no DATABASE_URL) the DB-backed tests SKIP rather than
// fail, matching the convention in repository/asset_repo_retry_test.go — so a
// hermetic CI run without a live DB still passes. The pure worker tests
// (Stop-safety, nil-guards, HMAC signing) are unaffected by this TestMain.

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
	workerTestDSN     string
	workerDSNInitErr  error
	workerMainStarted bool
)

func TestMain(m *testing.M) {
	workerMainStarted = true
	if envDSN := os.Getenv("DATABASE_URL"); envDSN != "" {
		workerTestDSN = envDSN
	} else {
		dsn, err := testsupport.EnsureDSN()
		if err != nil {
			workerDSNInitErr = err
			fmt.Fprintf(os.Stderr, "worker_test: no DB available: %v (db-backed tests will skip)\n", err)
		} else {
			workerTestDSN = dsn
		}
	}
	code := m.Run()
	testsupport.Shutdown()
	os.Exit(code)
}

// getWorkerTestPool opens a pool to the resolved DSN, or skips the test if no
// database is reachable. A tight connect timeout turns a hung postgres into a
// fast skip rather than a 120s binary hang.
func getWorkerTestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	if !workerMainStarted {
		t.Skip("worker_test: TestMain did not run; DSN unresolved")
	}
	if workerDSNInitErr != nil {
		t.Skipf("worker_test: no database available: %v", workerDSNInitErr)
	}
	if workerTestDSN == "" {
		t.Skip("worker_test: DATABASE_URL unset and testcontainers unavailable")
	}
	cfg, err := pgxpool.ParseConfig(workerTestDSN)
	if err != nil {
		t.Skipf("worker_test: invalid DSN: %v", err)
	}
	cfg.ConnConfig.ConnectTimeout = 3 * time.Second
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Skipf("worker_test: opening pool: %v", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		t.Skipf("worker_test: postgres ping failed (container may be hung): %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

// seedStateID returns any valid states.id for FK-satisfying inserts.
func seedStateID(t *testing.T, ctx context.Context, pool *pgxpool.Pool) int {
	t.Helper()
	var id int
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM states LIMIT 1`).Scan(&id))
	return id
}

// drainConcurrently runs `workers` goroutines that all start together and each
// repeatedly invoke claim() — which atomically claims a batch and returns the
// claimed ids — until it returns empty. It returns the combined multiset of
// claimed ids. An atomic SKIP-LOCKED claim must hand every row to exactly one
// worker: assertClaimedExactlyOnce checks the returned counts.
func drainConcurrently(t *testing.T, workers int, claim func() ([]uuid.UUID, error)) map[uuid.UUID]int {
	t.Helper()
	var mu sync.Mutex
	counts := map[uuid.UUID]int{}
	var wg sync.WaitGroup
	errCh := make(chan error, workers)
	start := make(chan struct{})
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start // line the goroutines up so they genuinely contend
			for {
				ids, err := claim()
				if err != nil {
					errCh <- err
					return
				}
				if len(ids) == 0 {
					return
				}
				mu.Lock()
				for _, id := range ids {
					counts[id]++
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
	return counts
}

// assertClaimedExactlyOnce asserts that every one of the wantIDs was claimed
// exactly once across all concurrent workers — none lost (count != 1) — and that
// NO row anywhere was double-claimed (count > 1, the duplicate-processing bug).
// It deliberately does not require counts to contain ONLY wantIDs: a claim whose
// predicate is global (e.g. DSR's status='pending') may also sweep unrelated
// rows left on a reused DATABASE_URL, and that is fine as long as nothing is
// double-claimed.
func assertClaimedExactlyOnce(t *testing.T, counts map[uuid.UUID]int, wantIDs []uuid.UUID) {
	t.Helper()
	for _, id := range wantIDs {
		require.Equalf(t, 1, counts[id],
			"seeded row %s must be claimed exactly once across concurrent workers (got %d)", id, counts[id])
	}
	for id, c := range counts {
		require.LessOrEqualf(t, c, 1,
			"row %s was claimed %d times — a count>1 is a double-claim, the race this guards against", id, c)
	}
}
