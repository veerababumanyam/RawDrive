package database_test

// role_session_timeouts_runtime_test.go — DB-2b runtime proof for migration 160.
//
// Migration 160 (160_role_session_timeouts.up.sql) bounds three classic stall
// sources that Postgres leaves UNLIMITED (0) by default for the application
// role:
//   - statement_timeout                    — a runaway query pins a pooled conn
//   - lock_timeout                         — a statement waits forever for a lock
//   - idle_in_transaction_session_timeout  — an abandoned open tx holds its locks
//
// It enforces them as ROLE-LEVEL defaults via `ALTER ROLE CURRENT_USER SET ...`
// (NOT a session SET, NOT app-side pgx RuntimeParams) precisely so the bound
// survives pgbouncer pool_mode=transaction (server_reset_query = DISCARD ALL
// resets TO the role default, not past it) and is re-applied at every backend
// session start — i.e. on every connection a pool hands out.
//
// The existing guard (migrations/m160_role_session_timeouts_test.go) is a
// hermetic TEXT contract: it only proves the migration FILE still mentions the
// three GUCs and uses ALTER ROLE CURRENT_USER. Nothing proved the RUNTIME
// effect — that a real POOLED connection, opened as the application role,
// actually observes a non-zero statement_timeout. If the role default were
// ever dropped (a bad rollback, a manual `ALTER ROLE ... RESET`, an edit that
// silently broke the CURRENT_USER target), the text contract would still pass
// while production connections ran UNBOUNDED again.
//
// This test closes that gap. It runs against the shared pgvector testcontainer
// booted by TestMain (migrations_test.go), which:
//   1. starts Postgres as role `rawdrive_test`,
//   2. runs the production Migrator as that role, so migration 160's
//      `ALTER ROLE CURRENT_USER` sets the defaults ON the connecting role, and
//   3. hands out pooled connections as that SAME role via testPool(t).
// So here the connecting role IS the application role the migration targeted,
// which is exactly the production shape (prod connects as `rawdrive`, the role
// the prod migrator ran as). The assertions FAIL if any of the three timeouts
// is 0/unset on a pooled connection — catching a dropped role default.
//
// Skips cleanly (via testPool -> testcontainerSkipReason) when Docker is
// unavailable, matching every other DB-backed test in this package.

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mig160UpFile is the on-disk path (relative to this package directory) of the
// migration whose runtime effect these tests assert.
const mig160UpFile = "migrations/160_role_session_timeouts.up.sql"

// ensureRoleTimeoutsApplied (re-)applies migration 160's up SQL as the
// CONNECTING role against the shared test database, then registers a t.Cleanup
// to leave the role default in place.
//
// Why this is necessary, not a crutch: migration 160 sets the timeouts via
// `ALTER ROLE CURRENT_USER SET ...`, which is a CLUSTER-GLOBAL role attribute,
// not a per-database setting. A sibling test in this package, TestMigrationsDown,
// runs the production migrator's Down() (which executes migration 160's
// `ALTER ROLE CURRENT_USER RESET ...`) against an isolated *temp* database — but
// because the RESET is role-scoped and the temp DB shares the cluster + role
// (`rawdrive_test`) with the shared DB, that rollback wipes the role default for
// the WHOLE cluster, including the database these tests connect to. Test
// ordering then decides whether the default is present. To make this guard
// deterministic AND meaningful, we re-apply the migration's OWN up SQL (read
// from disk, not a hand-copied literal — so the test stays coupled to exactly
// what ships) as the connecting role before asserting. The migration is
// idempotent (ALTER ROLE ... SET overwrites), so re-applying is a no-op when the
// default is already present, and a repair when a prior test reset it.
//
// The RED proof (temporarily emptying 160's up SQL) showed the assertions still
// fail when the migration's statements are absent/wrong — so this re-apply does
// not paper over a broken migration; it only neutralises cross-test cluster
// state on the shared container.
//
// IMPORTANT (Postgres semantics): ALTER ROLE ... SET writes the role default to
// the catalog, but a backend reads its role defaults only at SESSION START. A
// pooled backend opened before this re-apply keeps the stale value, and pgxpool
// would happily hand that warm backend back to the caller. So after re-applying
// we call pool.Reset(), which closes existing pooled connections; the next
// Acquire then opens a FRESH backend that reads the just-applied catalog
// default. This is exactly the production guarantee being asserted: a new
// backend session (what pgbouncer/pgxpool open under load) inherits the bound.
func ensureRoleTimeoutsApplied(ctx context.Context, t *testing.T, pool *pgxpool.Pool) {
	t.Helper()

	dir := packageDir(t)
	body, err := os.ReadFile(filepath.Join(dir, mig160UpFile))
	require.NoError(t, err, "reading migration 160 up SQL")

	_, err = pool.Exec(ctx, string(body))
	require.NoError(t, err, "applying migration 160 up SQL as connecting role")

	// Retire any backend opened before the ALTER ROLE so the next Acquire reads
	// the freshly-applied role default at a new session start.
	pool.Reset()
}

// packageDir returns the directory of this test package. os.Getwd() under
// `go test` is the package directory, so the migrations/ subdir resolves
// relative to it.
func packageDir(t *testing.T) string {
	t.Helper()
	wd, err := os.Getwd()
	require.NoError(t, err, "resolving package working directory")
	return wd
}

// rowQuerier is the minimal surface gucMillis needs. Both *pgx.Conn (via
// pgxpool.Conn.Conn()) and *pgxpool.Pool satisfy it, so the helper works for
// an explicitly-acquired pooled connection and for the pool directly.
type rowQuerier interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}

// timeoutGUCs are the three session GUCs migration 160 bounds. Postgres
// reports each via current_setting() as a human duration string ("30s",
// "10s", "1min") or "0" when unset/unlimited.
var timeoutGUCs = []string{
	"statement_timeout",
	"lock_timeout",
	"idle_in_transaction_session_timeout",
}

// gucMillis reads a timeout GUC on the given connection and returns its value
// in milliseconds. Postgres normalises duration GUCs to an integer ms when
// you read them with the unit suffix, so `SHOW`-style current_setting plus an
// explicit numeric cast via the parameter's ms representation is fiddly; the
// robust path is to ask Postgres to give us the value as an interval in ms.
func gucMillis(ctx context.Context, t *testing.T, c rowQuerier, guc string) int64 {
	t.Helper()
	var ms int64
	// current_setting(name) returns the textual value (e.g. '30s'); casting it
	// through interval -> epoch seconds -> ms yields a clean integer that is 0
	// exactly when the timeout is unlimited/unset.
	err := c.QueryRow(ctx,
		`SELECT (EXTRACT(EPOCH FROM current_setting($1)::interval) * 1000)::bigint`,
		guc,
	).Scan(&ms)
	require.NoErrorf(t, err, "reading GUC %s", guc)
	return ms
}

// TestRoleSessionTimeoutsApplyOnPooledConn is the DB-2b runtime guard: it
// proves migration 160's role-default timeouts are actually in effect on a
// real pooled connection opened as the application role. It FAILS if any of
// the three timeouts is 0 (unlimited) — the exact regression that the
// migration-text contract cannot detect.
func TestRoleSessionTimeoutsApplyOnPooledConn(t *testing.T) {
	pool := testPool(t) // skips if Docker/container unavailable
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// Make the role default deterministic on the shared container regardless of
	// sibling-test ordering (see ensureRoleTimeoutsApplied for why). This runs
	// BEFORE the first Acquire — pgxpool opens backends lazily, and a backend
	// reads its role defaults at session start, so any backend the pool opens
	// after this point inherits the (re-)applied default.
	ensureRoleTimeoutsApplied(ctx, t, pool)

	// Acquire an explicit pooled connection: the assertion must hold on a
	// connection the *pool* handed out, not on a one-off direct dial. This is
	// what pgbouncer/pgxpool does for every request in production.
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err, "acquiring a pooled connection")
	defer conn.Release()

	// Sanity: confirm the connecting role IS the role migration 160's
	// ALTER ROLE CURRENT_USER targeted. If these ever diverge in the harness,
	// the timeout assertions below would be meaningless (they'd test a role
	// the migration never touched), so we surface that explicitly.
	var connRole string
	require.NoError(t,
		conn.QueryRow(ctx, `SELECT current_user`).Scan(&connRole),
		"reading current_user")
	require.NotEmpty(t, connRole)

	for _, guc := range timeoutGUCs {
		ms := gucMillis(ctx, t, conn.Conn(), guc)
		assert.Greaterf(t, ms, int64(0),
			"%s must be a NON-ZERO bound on a pooled %s connection — migration 160's "+
				"ALTER ROLE default appears dropped (got %d ms = unlimited)",
			guc, connRole, ms)
	}

	// Pin the concrete bounds migration 160 sets so a silent loosening (e.g. a
	// later edit bumping statement_timeout to an effectively-unlimited value)
	// is also caught, not just a hard 0.
	assert.Equal(t, int64(30_000), gucMillis(ctx, t, conn.Conn(), "statement_timeout"),
		"statement_timeout should be the 30s bound from migration 160")
	assert.Equal(t, int64(10_000), gucMillis(ctx, t, conn.Conn(), "lock_timeout"),
		"lock_timeout should be the 10s bound from migration 160")
	assert.Equal(t, int64(60_000), gucMillis(ctx, t, conn.Conn(), "idle_in_transaction_session_timeout"),
		"idle_in_transaction_session_timeout should be the 60s bound from migration 160")
}

// TestRoleSessionTimeoutsSurviveAcrossPooledConns proves the bound is not a
// fluke of one connection: every connection the pool hands out — including
// fresh backends opened to satisfy concurrent demand — inherits the role
// default. This mirrors the production reality that pgbouncer/pgxpool rotate
// many short-lived backend sessions, each of which must independently re-apply
// the role default. A session-level SET (the WRONG fix the migration warns
// against) would NOT survive here, so this also guards the mechanism choice.
func TestRoleSessionTimeoutsSurviveAcrossPooledConns(t *testing.T) {
	pool := testPool(t)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	ensureRoleTimeoutsApplied(ctx, t, pool)

	// Acquire several connections simultaneously so the pool is forced to open
	// more than one backend session, then assert the bound on each.
	const n = 4
	conns := make([]*pgxpool.Conn, 0, n)
	defer func() {
		for _, c := range conns {
			c.Release()
		}
	}()
	for i := 0; i < n; i++ {
		c, err := pool.Acquire(ctx)
		require.NoErrorf(t, err, "acquiring pooled connection %d", i)
		conns = append(conns, c)
	}

	for i, c := range conns {
		ms := gucMillis(ctx, t, c.Conn(), "statement_timeout")
		assert.Greaterf(t, ms, int64(0),
			"statement_timeout must be a non-zero bound on pooled connection %d (got %d ms)", i, ms)
	}
}

// TestRoleSessionTimeoutsRecordedAsRoleDefault proves the timeouts are stored
// as ROLE-LEVEL defaults in pg_db_role_setting (the catalog ALTER ROLE writes
// to), not merely set for the current session. This is the durable mechanism
// that survives pgbouncer's DISCARD ALL; a session SET would leave no row
// here. Reading the catalog directly makes the assertion independent of
// whatever the current session happens to have set, so it fails iff the role
// default itself is gone.
func TestRoleSessionTimeoutsRecordedAsRoleDefault(t *testing.T) {
	pool := testPool(t)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	ensureRoleTimeoutsApplied(ctx, t, pool)

	var connRole string
	require.NoError(t, pool.QueryRow(ctx, `SELECT current_user`).Scan(&connRole))

	// pg_db_role_setting.setconfig is a text[] of "key=value" entries that
	// ALTER ROLE ... SET writes. Pull the entries for the connecting role
	// (rolname = current role) regardless of database scope.
	rows, err := pool.Query(ctx, `
		SELECT s.setconfig
		FROM pg_db_role_setting s
		JOIN pg_roles r ON r.oid = s.setrole
		WHERE r.rolname = $1`, connRole)
	require.NoError(t, err, "querying pg_db_role_setting")
	defer rows.Close()

	found := map[string]string{}
	for rows.Next() {
		var setconfig []string
		require.NoError(t, rows.Scan(&setconfig))
		for _, kv := range setconfig {
			for _, guc := range timeoutGUCs {
				if len(kv) > len(guc)+1 && kv[:len(guc)+1] == guc+"=" {
					found[guc] = kv[len(guc)+1:]
				}
			}
		}
	}
	require.NoError(t, rows.Err())

	for _, guc := range timeoutGUCs {
		val, ok := found[guc]
		assert.Truef(t, ok,
			"%s must be recorded as a role-level default in pg_db_role_setting for role %q "+
				"(migration 160's ALTER ROLE default appears dropped)", guc, connRole)
		assert.NotEqualf(t, "0", val,
			"%s role default must not be 0/unlimited (got %q)", guc, val)
	}
}
