// Package testsupport provides shared test infrastructure for integration tests
// that need a real, migrated Postgres+pgvector database.
//
// Lifecycle policy: ONE container per test binary (per-package). The first
// caller of PgvectorPool starts a pgvector/pgvector:pg16 container, runs the
// canonical migrations from internal/database via the production Migrator,
// and stores the DSN in a package-level var. Subsequent callers in the same
// binary reuse that DSN, each getting their own *pgxpool.Pool.
//
// Because all tests in a package share one database, tests are responsible
// for cleaning up rows they insert (TRUNCATE or scoped unique keys). If a
// test needs absolute isolation, it should either (a) move to its own package
// or (b) create a fresh schema per test using SET search_path.
//
// Cleanup: the container is terminated via Shutdown(), typically called from
// a package-level TestMain. Even if Shutdown is never called, the
// testcontainers Ryuk sidecar will reap the container when the test binary
// exits — so there are no leaked containers in either case.
package testsupport

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/rawdrive/backend/internal/database"
)

// pgvectorImage is the single place to bump the pgvector version used by all
// integration tests. pgvector/pgvector is the official pgvector project image
// and ships with the extension preinstalled — no init script needed.
const pgvectorImage = "pgvector/pgvector:pg16"

var (
	sharedOnce    sync.Once
	sharedDSN     string
	sharedInitErr error
	sharedStop    func()
)

// PgvectorPool returns a *pgxpool.Pool connected to a migrated pgvector
// database. On first call within a test binary it starts a container and
// runs migrations; subsequent calls reuse the same container.
//
// Each caller gets its own pool, closed automatically via t.Cleanup. The
// underlying container is NOT closed per-test — it lives for the whole
// package and is cleaned up by Shutdown() or Ryuk.
func PgvectorPool(t *testing.T) *pgxpool.Pool {
	t.Helper()

	sharedOnce.Do(initSharedContainer)

	if sharedInitErr != nil {
		t.Fatalf("testsupport: failed to initialise shared pgvector container: %v", sharedInitErr)
	}

	pool, err := pgxpool.New(context.Background(), sharedDSN)
	if err != nil {
		t.Fatalf("testsupport: opening pgxpool for %s: %v", t.Name(), err)
	}
	t.Cleanup(pool.Close)

	return pool
}

// DSN returns the shared container DSN. Useful for code paths that need a
// connection string directly (e.g., passing to NewMigrator or external tools).
// Fails the test if the container has not been initialised.
func DSN(t *testing.T) string {
	t.Helper()
	sharedOnce.Do(initSharedContainer)
	if sharedInitErr != nil {
		t.Fatalf("testsupport: container not available: %v", sharedInitErr)
	}
	return sharedDSN
}

// EnsureDSN initialises the shared container if needed and returns the DSN.
// Unlike DSN(t), it does not require a *testing.T — use it from TestMain or
// any other context that only has *testing.M. Returns an error instead of
// calling t.Fatalf so the caller can decide how to report the failure.
func EnsureDSN() (string, error) {
	sharedOnce.Do(initSharedContainer)
	if sharedInitErr != nil {
		return "", sharedInitErr
	}
	return sharedDSN, nil
}

// Shutdown terminates the shared container if one was started. Safe to call
// multiple times and safe to call when no container was started. Intended
// for use in TestMain:
//
//	func TestMain(m *testing.M) {
//	    code := m.Run()
//	    testsupport.Shutdown()
//	    os.Exit(code)
//	}
func Shutdown() {
	if sharedStop != nil {
		sharedStop()
		sharedStop = nil
	}
}

// initSharedContainer does the one-time work: boot the container, resolve a
// DSN, run the production Migrator against it. Runs inside sharedOnce.Do so
// concurrent PgvectorPool calls from parallel tests all serialise behind it.
func initSharedContainer() {
	// Startup budget: pulling pgvector/pgvector:pg16 the first time on a cold
	// machine can take ~30s. Once cached, boot is ~2-3s. 3 minutes is enough
	// headroom for both cases without being so long that a broken Docker
	// daemon hangs the suite.
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	pgc, err := postgres.Run(ctx,
		pgvectorImage,
		postgres.WithDatabase("rawdrive_test"),
		postgres.WithUsername("rawdrive_test"),
		postgres.WithPassword("rawdrive_test"),
		testcontainers.WithWaitStrategy(
			// Postgres logs "ready to accept connections" TWICE during init:
			// once after the bootstrap initdb, once on the real start. Waiting
			// for occurrence=2 avoids the classic race where the first log line
			// fires before the server actually accepts external connections.
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(90*time.Second),
		),
	)
	if err != nil {
		sharedInitErr = fmt.Errorf("starting pgvector container: %w", err)
		return
	}

	dsn, err := pgc.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		_ = pgc.Terminate(context.Background())
		sharedInitErr = fmt.Errorf("resolving container DSN: %w", err)
		return
	}

	// Run the REAL production migrator against the container. This is the
	// whole point of the helper: every integration test runs against the
	// same schema the application runs against, using the same migration
	// code path. If migrations drift, integration tests fail first.
	if err := database.NewMigrator(dsn).Up(); err != nil {
		_ = pgc.Terminate(context.Background())
		sharedInitErr = fmt.Errorf("running migrations against container: %w", err)
		return
	}

	sharedDSN = dsn
	sharedStop = func() {
		_ = pgc.Terminate(context.Background())
	}
}
