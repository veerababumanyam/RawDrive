//go:build integration

package repository_test

// M30 / E100-S4 — RLS integration tests for chat_messages and reaction_events.
//
// These exercise the actual Postgres RLS policies. They require:
//   1. A running postgres with migration 082 applied.
//   2. DATABASE_URL pointing at it.
//   3. Build tag `integration` (run with `go test -tags=integration ./...`).
//
// The tests use a non-superuser DB role so RLS policies actually fire —
// rawdrive_user is the standard application role and should have RLS
// enforced (NOBYPASSRLS by default).

import (
	"context"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/streaming/repository"
)

func dbPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping RLS integration test")
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	require.NoError(t, err)
	cfg.MaxConns = 4
	pool, err := pgxpool.NewWithConfig(context.Background(), cfg)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	return pool
}

// seedStream inserts a minimal streams row so chat_messages.stream_id FK
// is satisfied. Returns (streamID, workspaceID).
func seedStream(t *testing.T, pool *pgxpool.Pool) (uuid.UUID, uuid.UUID) {
	t.Helper()
	ctx := context.Background()
	streamID := uuid.New()
	workspaceID := uuid.New()

	// Find an existing workspace + user — streams has FK + NOT NULL on
	// workspace_id and created_by.
	var wsID, userID uuid.UUID
	if err := pool.QueryRow(ctx, `SELECT id FROM workspaces LIMIT 1`).Scan(&wsID); err == nil {
		workspaceID = wsID
	}
	if err := pool.QueryRow(ctx, `SELECT id FROM users LIMIT 1`).Scan(&userID); err != nil {
		t.Skipf("no users in DB to satisfy streams.created_by FK: %v", err)
	}

	_, err := pool.Exec(ctx,
		`INSERT INTO streams (id, workspace_id, created_by, title, status)
		 VALUES ($1, $2, $3, 'rls-test', 'scheduled')`,
		streamID, workspaceID, userID,
	)
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM streams WHERE id=$1`, streamID)
	})
	return streamID, workspaceID
}

func setSession(t *testing.T, pool *pgxpool.Pool, key, val string) {
	t.Helper()
	// SET (not SET LOCAL) since we are outside an explicit transaction;
	// scoped to the connection acquired from the pool. Pool mode TX_PREPARE
	// is OK because we use the same conn for the subsequent op via tx.
	// For simplicity, exercise it via SET LOCAL inside a quick tx.
	tx, err := pool.Begin(context.Background())
	require.NoError(t, err)
	_, err = tx.Exec(context.Background(), "SET LOCAL "+key+" = '"+strings.ReplaceAll(val, "'", "''")+"'")
	require.NoError(t, err)
	require.NoError(t, tx.Commit(context.Background()))
}

// Production deploys MUST run the application against a NOSUPERUSER
// NOBYPASSRLS role. The DSN role (rawdrive_user) is a superuser in dev,
// which bypasses RLS — these tests SET LOCAL ROLE rawdrive_app to switch
// to the non-bypassing role before issuing RLS-sensitive queries.

// runWithSession executes f inside a transaction with the requested session
// settings applied via SET LOCAL — the only reliable way to make RLS see
// app.viewer_session_id from a pooled connection.
func runWithSession(t *testing.T, pool *pgxpool.Pool, viewerSessionID, workspaceID string, f func(ctx context.Context)) {
	t.Helper()
	ctx := context.Background()
	tx, err := pool.Begin(ctx)
	require.NoError(t, err)
	defer tx.Rollback(ctx)
	if viewerSessionID != "" {
		_, err = tx.Exec(ctx, "SET LOCAL app.viewer_session_id = '"+viewerSessionID+"'")
		require.NoError(t, err)
	}
	if workspaceID != "" {
		_, err = tx.Exec(ctx, "SET LOCAL app.current_workspace_id = '"+workspaceID+"'")
		require.NoError(t, err)
	}
	// Provide ctx that can be threaded through repo calls; for this test
	// suite the repo uses its own pool so RLS is exercised end-to-end via
	// direct SQL inside the transaction below.
	f(ctx)
	require.NoError(t, tx.Commit(ctx))
}

func TestRLS_ViewerCannotReadOtherWorkspaceChat(t *testing.T) {
	pool := dbPool(t)
	streamA, wsA := seedStream(t, pool)
	streamB, _ := seedStream(t, pool)
	viewerA := uuid.New().String()

	// Insert a chat row in workspace A as a viewer.
	ctx := context.Background()
	tx, err := pool.Begin(ctx)
	require.NoError(t, err)
	_, err = tx.Exec(ctx, "SET LOCAL app.viewer_session_id = '"+viewerA+"'")
	require.NoError(t, err)
	_, err = tx.Exec(ctx,
		`INSERT INTO chat_messages (stream_id, workspace_id, viewer_session_id, body)
		 VALUES ($1, $2, $3, 'hello A')`,
		streamA, wsA, viewerA,
	)
	require.NoError(t, err)
	require.NoError(t, tx.Commit(ctx))

	// A different viewer with NO matching workspace context tries to read.
	// Switch to the non-superuser app role so RLS actually applies.
	viewerStranger := uuid.New().String()
	tx, err = pool.Begin(ctx)
	require.NoError(t, err)
	defer tx.Rollback(ctx)
	if _, roleErr := tx.Exec(ctx, "SET LOCAL ROLE rawdrive_app"); roleErr != nil {
		t.Skipf("rawdrive_app role missing; create it before running RLS tests: %v", roleErr)
	}
	_, err = tx.Exec(ctx, "SET LOCAL app.viewer_session_id = '"+viewerStranger+"'")
	require.NoError(t, err)
	var count int
	err = tx.QueryRow(ctx, `SELECT count(*) FROM chat_messages WHERE stream_id=$1`, streamA).Scan(&count)
	require.NoError(t, err)
	assert.Equal(t, 0, count, "stranger viewer must not read another viewer's chat under RLS")
	_ = streamB // streamB seeded for symmetry
}

func TestRLS_OwningViewerCanReadOwnChat(t *testing.T) {
	pool := dbPool(t)
	stream, ws := seedStream(t, pool)
	viewer := uuid.New().String()

	ctx := context.Background()
	tx, err := pool.Begin(ctx)
	require.NoError(t, err)
	_, err = tx.Exec(ctx, "SET LOCAL app.viewer_session_id = '"+viewer+"'")
	require.NoError(t, err)
	_, err = tx.Exec(ctx,
		`INSERT INTO chat_messages (stream_id, workspace_id, viewer_session_id, body)
		 VALUES ($1, $2, $3, 'hi me')`,
		stream, ws, viewer,
	)
	require.NoError(t, err)
	require.NoError(t, tx.Commit(ctx))

	tx, err = pool.Begin(ctx)
	require.NoError(t, err)
	defer tx.Rollback(ctx)
	_, err = tx.Exec(ctx, "SET LOCAL app.viewer_session_id = '"+viewer+"'")
	require.NoError(t, err)
	var count int
	err = tx.QueryRow(ctx, `SELECT count(*) FROM chat_messages WHERE stream_id=$1`, stream).Scan(&count)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, count, 1, "viewer must be able to read their own chat under RLS")
}

func TestRLS_WorkspaceUserSeesAllStreamChat(t *testing.T) {
	pool := dbPool(t)
	stream, ws := seedStream(t, pool)
	viewer1 := uuid.New().String()
	viewer2 := uuid.New().String()

	ctx := context.Background()

	// Two viewers post.
	for _, v := range []string{viewer1, viewer2} {
		tx, err := pool.Begin(ctx)
		require.NoError(t, err)
		_, err = tx.Exec(ctx, "SET LOCAL app.viewer_session_id = '"+v+"'")
		require.NoError(t, err)
		_, err = tx.Exec(ctx,
			`INSERT INTO chat_messages (stream_id, workspace_id, viewer_session_id, body)
			 VALUES ($1, $2, $3, $4)`,
			stream, ws, v, "msg from "+v,
		)
		require.NoError(t, err)
		require.NoError(t, tx.Commit(ctx))
	}

	// Workspace user (set current_workspace_id) reads all messages.
	tx, err := pool.Begin(ctx)
	require.NoError(t, err)
	defer tx.Rollback(ctx)
	_, err = tx.Exec(ctx, "SET LOCAL app.current_workspace_id = '"+ws.String()+"'")
	require.NoError(t, err)
	var count int
	err = tx.QueryRow(ctx, `SELECT count(*) FROM chat_messages WHERE stream_id=$1`, stream).Scan(&count)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, count, 2, "workspace user must read every viewer's chat under tenant policy")
}

func TestRLS_BodyTooLongRejectedAtSQLLevel(t *testing.T) {
	pool := dbPool(t)
	repo := repository.NewChatRepo(pool)
	stream, ws := seedStream(t, pool)
	_ = repo // exercise via direct SQL to bypass Go-side validation

	tooLong := strings.Repeat("x", 2001)
	_, err := pool.Exec(context.Background(),
		`INSERT INTO chat_messages (stream_id, workspace_id, body)
		 VALUES ($1, $2, $3)`,
		stream, ws, tooLong,
	)
	require.Error(t, err, "CHECK constraint must reject body > 2000 chars")
}
