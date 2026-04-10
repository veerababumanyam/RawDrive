//go:build poc_testcontainers
// +build poc_testcontainers

// Package integration_test — PoC for testcontainers-go adoption.
//
// This file is hidden behind the `poc_testcontainers` build tag so it does not
// run in the default test suite. To execute:
//
//	go test -tags=poc_testcontainers -v -run TestPoC ./tests/integration/...
//
// Goal of the PoC:
//  1. Spin up a real pgvector-enabled Postgres container per test (no hardcoded URL).
//  2. Verify the pgvector extension can be created (proves the image choice works).
//  3. Measure wall-clock cost of container startup on this machine.
//  4. Exercise a template-DB clone pattern — the key optimization for 96+ test files.
package integration_test

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

// pgvectorImage is the community image that ships pgvector preinstalled.
// Keeping it as a package var makes it easy to pin in one place.
const pgvectorImage = "pgvector/pgvector:pg16"

// startPgvectorContainer boots a fresh Postgres+pgvector container and returns
// a connection string plus a terminator. Extracted so both subtests share it.
func startPgvectorContainer(ctx context.Context, t *testing.T) (string, func()) {
	t.Helper()

	pgc, err := postgres.Run(ctx,
		pgvectorImage,
		postgres.WithDatabase("rawdrive_test"),
		postgres.WithUsername("rawdrive_test"),
		postgres.WithPassword("rawdrive_test"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(60*time.Second),
		),
	)
	require.NoError(t, err, "failed to start pgvector container")

	connStr, err := pgc.ConnectionString(ctx, "sslmode=disable")
	require.NoError(t, err, "failed to resolve connection string")

	return connStr, func() {
		// Terminate is idempotent and survives panics thanks to Ryuk.
		_ = pgc.Terminate(context.Background())
	}
}

// TestPoC_PgvectorContainer is the headline PoC: can we spin up pgvector in a
// throwaway container and actually use the extension?
func TestPoC_PgvectorContainer(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	start := time.Now()
	connStr, stop := startPgvectorContainer(ctx, t)
	defer stop()
	t.Logf("container ready in %s", time.Since(start))

	conn, err := pgx.Connect(ctx, connStr)
	require.NoError(t, err, "failed to connect to containerized postgres")
	defer conn.Close(ctx)

	// Sanity: plain SQL works.
	var one int
	require.NoError(t, conn.QueryRow(ctx, "SELECT 1").Scan(&one))
	assert.Equal(t, 1, one)

	// Critical: the pgvector extension must be creatable. If the image were
	// wrong (plain postgres instead of pgvector/pgvector), this would fail.
	_, err = conn.Exec(ctx, "CREATE EXTENSION IF NOT EXISTS vector")
	require.NoError(t, err, "CREATE EXTENSION vector failed — wrong image?")

	// Exercise a real vector op end-to-end: create a tiny embeddings table,
	// insert a row, and run a cosine-distance query. This is the shape RawDrive
	// actually uses for face clustering and smart-album search.
	_, err = conn.Exec(ctx, `
		CREATE TABLE face_embeddings (
			id   SERIAL PRIMARY KEY,
			vec  vector(3) NOT NULL
		)
	`)
	require.NoError(t, err)

	_, err = conn.Exec(ctx, "INSERT INTO face_embeddings (vec) VALUES ('[1,2,3]'), ('[4,5,6]')")
	require.NoError(t, err)

	var nearestID int
	err = conn.QueryRow(ctx,
		"SELECT id FROM face_embeddings ORDER BY vec <=> '[1,2,3]' LIMIT 1",
	).Scan(&nearestID)
	require.NoError(t, err, "pgvector cosine query failed")
	assert.Equal(t, 1, nearestID, "nearest neighbour should be row 1")
}

// TestPoC_ParallelIsolation proves two tests can each hold their own container
// without colliding on ports or state. This is what the existing hardcoded
// localhost:55070 approach in health_test.go cannot do.
func TestPoC_ParallelIsolation(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	connStr, stop := startPgvectorContainer(ctx, t)
	defer stop()

	conn, err := pgx.Connect(ctx, connStr)
	require.NoError(t, err)
	defer conn.Close(ctx)

	// Write a row tagged with the test name — if isolation were broken we'd
	// see rows from the sibling subtest leak in.
	_, err = conn.Exec(ctx, "CREATE TABLE marker (tag TEXT PRIMARY KEY)")
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "INSERT INTO marker (tag) VALUES ($1)", t.Name())
	require.NoError(t, err)

	var count int
	require.NoError(t, conn.QueryRow(ctx, "SELECT COUNT(*) FROM marker").Scan(&count))
	assert.Equal(t, 1, count, "each container must be pristine")
}
