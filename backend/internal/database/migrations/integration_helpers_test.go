//go:build integration
// +build integration

// Package migrations_test — integration helpers for real Postgres apply/rollback
// of migrations 091–094. The default (no build tag) test suite still runs the
// file-string assertions in m35_migrations_test.go untouched; this file only
// compiles under -tags=integration.
//
// Connection model: reads TEST_DATABASE_URL. If unset, every test in this
// package's integration build skips cleanly. The DSN is expected to point at
// an already-migrated Postgres (e.g. the dev compose stack or a CI testcontainer
// DSN exported by the surrounding harness). These tests assume migrations
// 091–094 have already been applied to the target DB at start, and they
// restore that final state via t.Cleanup before returning — even on failure.
package migrations_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

// connectTestDB returns a *pgxpool.Pool against TEST_DATABASE_URL or skips.
// Pool is closed via t.Cleanup. Ping is bounded to 5s so a wedged DSN does
// not hang the suite.
func connectTestDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set — skipping real-Postgres migration integration tests")
	}

	cfg, err := pgxpool.ParseConfig(dsn)
	require.NoError(t, err, "TEST_DATABASE_URL must parse as a valid pgx DSN")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	require.NoError(t, err, "opening pgxpool against TEST_DATABASE_URL")

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		t.Skipf("TEST_DATABASE_URL pointed at unreachable Postgres: %v", err)
	}

	t.Cleanup(pool.Close)
	return pool
}

// readMigration loads the SQL body for a given migration filename from the
// migrations directory the tests are running in.
func readMigration(t *testing.T, name string) string {
	t.Helper()
	dir := migrationDir(t) // shared helper from admin_migrations_test.go
	body, err := os.ReadFile(filepath.Join(dir, name))
	require.NoError(t, err, "reading migration %s", name)
	return string(body)
}

// execSQL runs a SQL block, failing the test on error. Uses a 30s deadline
// per call which is plenty for any single migration in this suite.
func execSQL(t *testing.T, pool *pgxpool.Pool, sql string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	_, err := pool.Exec(ctx, sql)
	require.NoError(t, err, "exec SQL failed: %.120s", sql)
}

// tableExists checks pg_class for an ordinary table in the public schema.
func tableExists(t *testing.T, pool *pgxpool.Pool, name string) bool {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var exists bool
	err := pool.QueryRow(ctx,
		`SELECT EXISTS (
		   SELECT 1 FROM pg_class c
		   JOIN pg_namespace n ON n.oid = c.relnamespace
		   WHERE n.nspname = 'public' AND c.relname = $1 AND c.relkind = 'r'
		 )`, name).Scan(&exists)
	require.NoError(t, err)
	return exists
}

// columnExists checks information_schema.columns for a column on a public table.
func columnExists(t *testing.T, pool *pgxpool.Pool, table, column string) bool {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var exists bool
	err := pool.QueryRow(ctx,
		`SELECT EXISTS (
		   SELECT 1 FROM information_schema.columns
		   WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
		 )`, table, column).Scan(&exists)
	require.NoError(t, err)
	return exists
}

// indexExists checks pg_indexes for a named index on a public table.
func indexExists(t *testing.T, pool *pgxpool.Pool, table, indexName string) bool {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var exists bool
	err := pool.QueryRow(ctx,
		`SELECT EXISTS (
		   SELECT 1 FROM pg_indexes
		   WHERE schemaname = 'public' AND tablename = $1 AND indexname = $2
		 )`, table, indexName).Scan(&exists)
	require.NoError(t, err)
	return exists
}

// scalarInt runs a query expected to return a single int.
func scalarInt(t *testing.T, pool *pgxpool.Pool, sql string, args ...any) int {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var n int
	require.NoError(t, pool.QueryRow(ctx, sql, args...).Scan(&n), "scalarInt: %s", sql)
	return n
}
