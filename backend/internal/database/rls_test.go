package database_test

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/database"
)

// setupRLSTest applies migrations and returns a pool plus two workspace contexts.
// The database.WithWorkspaceContext helper sets the current_workspace_id session var
// used by RLS policies.
func setupRLSTest(t *testing.T) (*pgxpool.Pool, string, string) {
	t.Helper()
	migrator := newMigrator(t)
	require.NoError(t, migrator.Up())

	pool := testPool(t)
	ctx := context.Background()

	// Seed two workspaces with distinct owners for isolation tests.
	// These helpers are expected from the database package.
	wsA := database.SeedTestWorkspace(t, pool, ctx, "Workspace A")
	wsB := database.SeedTestWorkspace(t, pool, ctx, "Workspace B")

	return pool, wsA, wsB
}

func TestRLSGalleriesIsolation(t *testing.T) {
	pool, wsA, wsB := setupRLSTest(t)
	ctx := context.Background()

	// Insert a gallery belonging to workspace A
	database.SeedTestGallery(t, pool, ctx, wsA, "Gallery Alpha")

	// Query galleries with workspace B context — should return zero rows
	ctxB := database.WithWorkspaceContext(ctx, wsB)
	rows, err := pool.Query(ctxB, `SELECT id FROM galleries`)
	require.NoError(t, err)
	defer rows.Close()

	var count int
	for rows.Next() {
		count++
	}
	require.NoError(t, rows.Err())
	assert.Equal(t, 0, count, "user in workspace B should not see workspace A galleries")
}

func TestRLSWorkspaceMembersIsolation(t *testing.T) {
	pool, wsA, wsB := setupRLSTest(t)
	ctx := context.Background()

	// Seed a member in workspace A
	database.SeedTestWorkspaceMember(t, pool, ctx, wsA)

	// Query members with workspace B context
	ctxB := database.WithWorkspaceContext(ctx, wsB)
	rows, err := pool.Query(ctxB, `SELECT user_id FROM workspace_members`)
	require.NoError(t, err)
	defer rows.Close()

	var count int
	for rows.Next() {
		count++
	}
	require.NoError(t, rows.Err())
	assert.Equal(t, 0, count, "cross-workspace member access should be blocked")
}

func TestRLSReturns403Not404(t *testing.T) {
	// RLS should return an empty result set rather than an error
	// when a user queries a resource from another workspace.
	pool, wsA, wsB := setupRLSTest(t)
	ctx := context.Background()

	database.SeedTestGallery(t, pool, ctx, wsA, "Secret Gallery")

	ctxB := database.WithWorkspaceContext(ctx, wsB)
	rows, err := pool.Query(ctxB, `SELECT id FROM galleries`)
	// Should NOT return an error — just empty results
	require.NoError(t, err, "cross-workspace query should succeed (empty set), not error")
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var id string
		require.NoError(t, rows.Scan(&id))
		ids = append(ids, id)
	}
	require.NoError(t, rows.Err())
	assert.Empty(t, ids, "should return empty set, not an error")
}

func TestRLSBypassForSuperAdmin(t *testing.T) {
	pool, wsA, wsB := setupRLSTest(t)
	ctx := context.Background()

	database.SeedTestGallery(t, pool, ctx, wsA, "Gallery A")
	database.SeedTestGallery(t, pool, ctx, wsB, "Gallery B")

	// Super admin context should bypass RLS and see all workspaces
	ctxAdmin := database.WithSuperAdminContext(ctx)
	rows, err := pool.Query(ctxAdmin, `SELECT id FROM galleries`)
	require.NoError(t, err)
	defer rows.Close()

	var count int
	for rows.Next() {
		count++
	}
	require.NoError(t, rows.Err())
	assert.GreaterOrEqual(t, count, 2, "super admin should see galleries from all workspaces")
}

func TestRLSWithoutContext(t *testing.T) {
	pool, wsA, _ := setupRLSTest(t)
	ctx := context.Background()

	database.SeedTestGallery(t, pool, ctx, wsA, "Orphan Gallery")

	// Query without any workspace context set — should return empty
	rows, err := pool.Query(ctx, `SELECT id FROM galleries`)
	require.NoError(t, err)
	defer rows.Close()

	var count int
	for rows.Next() {
		count++
	}
	require.NoError(t, rows.Err())
	assert.Equal(t, 0, count, "queries without workspace context should return empty set")
}

func TestRLSWithImpersonation(t *testing.T) {
	pool, wsA, _ := setupRLSTest(t)
	ctx := context.Background()

	database.SeedTestGallery(t, pool, ctx, wsA, "Impersonation Gallery")

	// Admin impersonates into workspace A — audit trail should still record admin identity
	adminUserID := "00000000-0000-0000-0000-000000000099"
	ctxImpersonate := database.WithImpersonationContext(ctx, wsA, adminUserID)

	rows, err := pool.Query(ctxImpersonate, `SELECT id FROM galleries`)
	require.NoError(t, err)
	defer rows.Close()

	var count int
	for rows.Next() {
		count++
	}
	require.NoError(t, rows.Err())
	assert.GreaterOrEqual(t, count, 1, "impersonated admin should see workspace galleries")

	// Verify audit trail records the impersonating admin
	var auditActorID string
	err = pool.QueryRow(ctx,
		`SELECT actor_id FROM audit_log
		 WHERE action = 'impersonation'
		 ORDER BY created_at DESC LIMIT 1`).Scan(&auditActorID)
	require.NoError(t, err, "audit log should record impersonation")
	assert.Equal(t, adminUserID, auditActorID, "audit trail should preserve admin identity during impersonation")
}
