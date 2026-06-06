package workspace_test

import (
	"context"
	"fmt"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/workspace"
	"github.com/rawdrive/backend/tests/testsupport"
)

// AREA-CUSTOMER-3 / AREA-CUSTOMER-1 (audit 2026-05-31): live-DB proof that
// PgRepo.CreateWithBootstrap co-creates the workspace + Owner membership +
// storage quota rows ATOMICALLY. These tests need a real Postgres (the
// transactional rollback semantics are the whole point and cannot be mocked),
// so they boot the shared pgvector testcontainer and skip cleanly when Docker
// is unavailable.

// seedOwner inserts a throwaway user and returns its UUID. The workspaces +
// workspace_members rows both FK to users(id), so the owner must exist first.
func seedOwner(t *testing.T, pool *pgxpool.Pool) uuid.UUID {
	t.Helper()
	ctx := context.Background()
	id := uuid.New()
	_, err := pool.Exec(ctx,
		`INSERT INTO users (id, email) VALUES ($1, $2)`,
		id, fmt.Sprintf("bootstrap-%s@rawdrive.test", id.String()))
	require.NoError(t, err, "seed owner user")
	t.Cleanup(func() {
		// Children cascade or are removed explicitly by the tests; remove
		// the user last so the FK graph stays consistent.
		_, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, id)
	})
	return id
}

// firstStateID returns any valid integer states.id from the seeded table.
func firstStateID(t *testing.T, pool *pgxpool.Pool) int {
	t.Helper()
	var id int
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT id FROM states ORDER BY id LIMIT 1`).Scan(&id),
		"states table must be seeded (migration 010)")
	return id
}

func TestPgRepo_CreateWithBootstrap_CoCreatesAllThreeRows(t *testing.T) {
	pool := testsupport.PgvectorPool(t)
	ctx := context.Background()

	owner := seedOwner(t, pool)
	stateID := firstStateID(t, pool)

	repo := workspace.NewPgRepo(pool)
	ws, err := repo.CreateWithBootstrap(ctx, &workspace.Workspace{
		Name:     fmt.Sprintf("Bootstrap Studio %s", uuid.NewString()[:8]),
		StateID:  fmt.Sprintf("%d", stateID),
		OwnerID:  owner.String(),
		PlanTier: "pro_photographer",
	}, 300<<30)
	require.NoError(t, err)
	require.NotEmpty(t, ws.ID)
	t.Cleanup(func() {
		c := context.Background()
		_, _ = pool.Exec(c, `DELETE FROM workspace_storage WHERE workspace_id = $1`, ws.ID)
		_, _ = pool.Exec(c, `DELETE FROM workspace_members WHERE workspace_id = $1`, ws.ID)
		_, _ = pool.Exec(c, `DELETE FROM workspaces WHERE id = $1`, ws.ID)
	})

	// workspace row exists
	var wsExists bool
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM workspaces WHERE id = $1)`, ws.ID).Scan(&wsExists))
	assert.True(t, wsExists, "workspace row must exist")

	// Owner membership row exists with the Owner role
	var memberRole string
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT r.name FROM workspace_members m JOIN roles r ON r.id = m.role_id
		  WHERE m.workspace_id = $1 AND m.user_id = $2`, ws.ID, owner).Scan(&memberRole))
	assert.Equal(t, "Owner", memberRole, "creator must be the Owner member")

	// Storage quota row exists with the supplied quota
	var quota int64
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT quota_bytes FROM workspace_storage WHERE workspace_id = $1`, ws.ID).Scan(&quota))
	assert.Equal(t, int64(300<<30), quota, "storage quota row must carry the supplied quota")
}

// TestPgRepo_CreateWithBootstrap_RollsBackOnStorageFailure forces the
// workspace_storage INSERT to fail mid-transaction (via a temporary BEFORE
// INSERT trigger that raises) and asserts the WHOLE transaction rolls back —
// no orphan workspace row and no orphan membership row survive. This is the
// core AREA-CUSTOMER-3 guarantee: a workspace can never exist without its
// storage + membership rows.
func TestPgRepo_CreateWithBootstrap_RollsBackOnStorageFailure(t *testing.T) {
	pool := testsupport.PgvectorPool(t)
	ctx := context.Background()

	owner := seedOwner(t, pool)
	stateID := firstStateID(t, pool)

	// Install a trigger that makes every workspace_storage INSERT fail.
	_, err := pool.Exec(ctx, `
		CREATE OR REPLACE FUNCTION _test_block_ws_storage() RETURNS trigger AS $$
		BEGIN RAISE EXCEPTION 'forced storage failure'; END;
		$$ LANGUAGE plpgsql;
		CREATE TRIGGER _test_block_ws_storage_trg
		BEFORE INSERT ON workspace_storage
		FOR EACH ROW EXECUTE FUNCTION _test_block_ws_storage();`)
	require.NoError(t, err)
	t.Cleanup(func() {
		c := context.Background()
		_, _ = pool.Exec(c, `DROP TRIGGER IF EXISTS _test_block_ws_storage_trg ON workspace_storage`)
		_, _ = pool.Exec(c, `DROP FUNCTION IF EXISTS _test_block_ws_storage()`)
	})

	wsName := fmt.Sprintf("Doomed Studio %s", uuid.NewString()[:8])
	repo := workspace.NewPgRepo(pool)
	_, err = repo.CreateWithBootstrap(ctx, &workspace.Workspace{
		Name:    wsName,
		StateID: fmt.Sprintf("%d", stateID),
		OwnerID: owner.String(),
	}, 1<<30)
	require.Error(t, err, "storage insert failure must fail the whole bootstrap")

	// No orphan workspace row.
	var wsCount int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM workspaces WHERE owner_id = $1`, owner).Scan(&wsCount))
	assert.Equal(t, 0, wsCount, "workspace row must be rolled back when storage insert fails")

	// No orphan membership row.
	var memberCount int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM workspace_members WHERE user_id = $1`, owner).Scan(&memberCount))
	assert.Equal(t, 0, memberCount, "membership row must be rolled back when storage insert fails")
}
