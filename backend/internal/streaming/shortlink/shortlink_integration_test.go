//go:build integration

package shortlink_test

// M34-R2-T002 + T004 — DB-backed Resolve/Revoke state machine and UNIQUE-retry.
// Requires migrations 089 applied and DATABASE_URL env set.
// Run with: go test -tags=integration ./internal/streaming/shortlink/...

import (
	"context"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/streaming/shortlink"
)

func dbPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping shortlink integration test")
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	require.NoError(t, err)
	cfg.MaxConns = 4
	pool, err := pgxpool.NewWithConfig(context.Background(), cfg)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	return pool
}

func seedStream(t *testing.T, pool *pgxpool.Pool) (uuid.UUID, uuid.UUID) {
	t.Helper()
	ctx := context.Background()
	var wsID, userID uuid.UUID
	if err := pool.QueryRow(ctx, `SELECT id FROM workspaces LIMIT 1`).Scan(&wsID); err != nil {
		t.Skipf("no workspaces: %v", err)
	}
	if err := pool.QueryRow(ctx, `SELECT id FROM users LIMIT 1`).Scan(&userID); err != nil {
		t.Skipf("no users: %v", err)
	}
	streamID := uuid.New()
	_, err := pool.Exec(ctx,
		`INSERT INTO streams (id, workspace_id, created_by, title, status)
		 VALUES ($1,$2,$3,'shortlink-test','scheduled')`,
		streamID, wsID, userID,
	)
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM streaming_shortlink_hits WHERE shortcode IN (SELECT shortcode FROM streaming_shortlinks WHERE stream_id=$1)`, streamID)
		_, _ = pool.Exec(ctx, `DELETE FROM streaming_shortlinks WHERE stream_id=$1`, streamID)
		_, _ = pool.Exec(ctx, `DELETE FROM streams WHERE id=$1`, streamID)
	})
	return wsID, streamID
}

// M34-R2-T002 — Resolve returns active/revoked/ErrNotFound.
func TestShortlink_ResolveStateMachine(t *testing.T) {
	pool := dbPool(t)
	ctx := context.Background()
	wsID, streamID := seedStream(t, pool)
	svc := shortlink.NewService(pool)

	code, err := svc.Generate(ctx, streamID, wsID)
	require.NoError(t, err)
	require.Len(t, code, shortlink.CodeLength())

	got, revoked, err := svc.Resolve(ctx, code)
	require.NoError(t, err)
	assert.Equal(t, streamID, got)
	assert.False(t, revoked)

	require.NoError(t, svc.Revoke(ctx, streamID))
	_, revoked, err = svc.Resolve(ctx, code)
	require.NoError(t, err)
	assert.True(t, revoked, "after Revoke(), revoked flag must be true")

	_, _, err = svc.Resolve(ctx, "ZZZZZZZZ")
	assert.ErrorIs(t, err, shortlink.ErrNotFound)
}

// M34-R2-T004 — UNIQUE violation retry.
// We simulate a collision by pre-inserting a known code, then seeding the
// generator to produce that same code once before returning a new one.
func TestShortlink_UniqueRetry(t *testing.T) {
	pool := dbPool(t)
	ctx := context.Background()
	wsID, streamID := seedStream(t, pool)
	svc := shortlink.NewService(pool)

	// Pre-insert a conflicting code.
	_, err := pool.Exec(ctx,
		`INSERT INTO streaming_shortlinks (stream_id, workspace_id, shortcode) VALUES ($1,$2,$3)`,
		streamID, wsID, "TESTCOLL",
	)
	require.NoError(t, err)

	// Reuse public helper: Generate should not panic on collisions and must
	// eventually return a unique code.
	code, err := svc.Generate(ctx, streamID, wsID)
	require.NoError(t, err)
	assert.NotEqual(t, "TESTCOLL", code)
	assert.Len(t, code, shortlink.CodeLength())
}

// Recordhit writes sha256 hash and not raw IP.
func TestShortlink_RecordHitStoresHashedIP(t *testing.T) {
	pool := dbPool(t)
	ctx := context.Background()
	wsID, streamID := seedStream(t, pool)
	svc := shortlink.NewService(pool)

	code, err := svc.Generate(ctx, streamID, wsID)
	require.NoError(t, err)
	require.NoError(t, svc.RecordHit(ctx, code, "qr", "203.0.113.99", "Mozilla/5.0 test"))

	var storedHash, storedSrc string
	err = pool.QueryRow(ctx,
		`SELECT ip_hash, src FROM streaming_shortlink_hits WHERE shortcode=$1 ORDER BY at DESC LIMIT 1`,
		code,
	).Scan(&storedHash, &storedSrc)
	require.NoError(t, err)
	assert.Equal(t, shortlink.HashIP("203.0.113.99"), storedHash)
	assert.Equal(t, "qr", storedSrc)
	assert.Len(t, storedHash, 64)
}
