package database_test

// S2-G1 (integration audit 2026-05-31) — live-DB proof of the Row Level
// Security BACKSTOP.
//
// Audit S2-G1 found that in production the API connects as the table-OWNER
// role, and table owners BYPASS RLS — so every isolation policy from
// migrations 008 / 061 is INERT and the database provides ZERO tenant
// isolation. The backstop restores DB-level enforcement by either (a)
// connecting as a NON-OWNER, NOBYPASSRLS role, and/or (b) applying
// FORCE ROW LEVEL SECURITY so even the owner is subject to policies.
//
// These tests prove BOTH halves of the contract against a real Postgres:
//   (i)  cross-tenant rows are DENIED, and
//   (ii) the OWNING workspace's rows ARE returned (the app still works).
//
// They use the shared pgvector testcontainer booted by TestMain
// (migrations_test.go) and SKIP CLEANLY when Docker is unavailable via
// testcontainerSkipReason — identical to every other DB-backed test in this
// package. Nothing here changes runtime behavior: the FORCE statements are
// applied INSIDE the test transaction's database and the policies they
// exercise already exist in the schema. The production Migrator never runs
// backend/ops/rls/enable_force_rls.sql (it is not embedded), so the default
// deploy path is untouched.

import (
	"context"
	"fmt"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// rlsSeed creates two isolated workspaces, each with one asset row, and
// returns their ids. Seeding happens as the superuser/owner role (the
// testcontainer's connecting role) which bypasses RLS, so both rows insert
// regardless of any app.workspace_id setting. Rows are cleaned up via
// t.Cleanup. Returns (workspaceA, assetA, workspaceB, assetB).
func rlsSeed(t *testing.T, pool *pgxpool.Pool) (uuid.UUID, uuid.UUID, uuid.UUID, uuid.UUID) {
	t.Helper()
	ctx := context.Background()

	mkWorkspace := func(name string) uuid.UUID {
		id := uuid.New()
		_, err := pool.Exec(ctx,
			`INSERT INTO workspaces (id, name) VALUES ($1, $2)`,
			id, name)
		require.NoError(t, err, "seed workspace %s", name)
		return id
	}

	mkAsset := func(ws uuid.UUID, fname string) uuid.UUID {
		id := uuid.New()
		_, err := pool.Exec(ctx,
			`INSERT INTO assets (id, workspace_id, filename, content_type, storage_key)
			 VALUES ($1, $2, $3, 'image/jpeg', $4)`,
			id, ws, fname, "rls-test/"+id.String())
		require.NoError(t, err, "seed asset %s", fname)
		return id
	}

	wsA := mkWorkspace(fmt.Sprintf("RLS Tenant A %s", uuid.NewString()[:8]))
	wsB := mkWorkspace(fmt.Sprintf("RLS Tenant B %s", uuid.NewString()[:8]))
	assetA := mkAsset(wsA, "tenant-a.jpg")
	assetB := mkAsset(wsB, "tenant-b.jpg")

	t.Cleanup(func() {
		c := context.Background()
		_, _ = pool.Exec(c, `DELETE FROM assets WHERE id = ANY($1)`, []uuid.UUID{assetA, assetB})
		_, _ = pool.Exec(c, `DELETE FROM workspaces WHERE id = ANY($1)`, []uuid.UUID{wsA, wsB})
	})

	return wsA, assetA, wsB, assetB
}

// countAssetsAsAppRole opens a transaction, switches to the non-owner
// rawdrive_app role (NOBYPASSRLS — created by migration 008), sets
// app.workspace_id to ctxWorkspace, and counts assets table rows visible for
// the given target workspace. The whole thing rolls back so it leaves no
// trace. Skips the test if the rawdrive_app role does not exist.
func countAssetsAsAppRole(t *testing.T, pool *pgxpool.Pool, ctxWorkspace, targetWorkspace uuid.UUID) int {
	t.Helper()
	ctx := context.Background()
	tx, err := pool.Begin(ctx)
	require.NoError(t, err)
	defer func() { _ = tx.Rollback(ctx) }()

	if _, roleErr := tx.Exec(ctx, "SET LOCAL ROLE rawdrive_app"); roleErr != nil {
		t.Skipf("rawdrive_app role missing (expected from migration 008); skipping RLS proof: %v", roleErr)
	}
	// Bind the tenant GUC to THIS connection/transaction. SET LOCAL is the
	// correct, leak-safe mechanism — it is scoped to the transaction and
	// never persists onto the pooled connection after rollback/commit.
	_, err = tx.Exec(ctx, "SELECT set_config('app.workspace_id', $1, true)", ctxWorkspace.String())
	require.NoError(t, err)

	var n int
	err = tx.QueryRow(ctx,
		`SELECT count(*) FROM assets WHERE workspace_id = $1`, targetWorkspace).Scan(&n)
	require.NoError(t, err)
	return n
}

// TestRLSBackstop_NonOwnerRole_EnforcesTenantIsolation proves the backstop
// works via the NON-OWNER role path (no FORCE needed — a non-owner role is
// subject to RLS whenever the table merely has RLS ENABLED, which migrations
// 008/061 already did).
func TestRLSBackstop_NonOwnerRole_EnforcesTenantIsolation(t *testing.T) {
	pool := testPool(t)
	wsA, _, wsB, _ := rlsSeed(t, pool)

	// (ii) Owning workspace's rows ARE returned — the app still works.
	ownOwn := countAssetsAsAppRole(t, pool, wsA, wsA)
	assert.Equal(t, 1, ownOwn, "tenant A with app.workspace_id=A must see its own asset")

	// (i) Cross-tenant rows are DENIED.
	crossTenant := countAssetsAsAppRole(t, pool, wsA, wsB)
	assert.Equal(t, 0, crossTenant, "tenant A with app.workspace_id=A must NOT see tenant B's asset")

	// Symmetric check from B's perspective.
	bOwn := countAssetsAsAppRole(t, pool, wsB, wsB)
	assert.Equal(t, 1, bOwn, "tenant B with app.workspace_id=B must see its own asset")
	bCross := countAssetsAsAppRole(t, pool, wsB, wsA)
	assert.Equal(t, 0, bCross, "tenant B with app.workspace_id=B must NOT see tenant A's asset")
}

// TestRLSBackstop_ForceRLS_ConstrainsTableOwner proves the FORCE ROW LEVEL
// SECURITY half of the backstop: with FORCE applied, even the table-OWNER
// role (the role the audit found prod connecting as) is subject to the
// isolation policies and cannot read cross-tenant rows.
//
// WHY A DEDICATED TABLE: the testcontainer connects as the bootstrap
// POSTGRES_USER, which is a SUPERUSER. Superusers ALWAYS bypass RLS, even
// under FORCE — that is documented Postgres behavior and is unrelated to the
// backstop. Production, by contrast, connects as a NON-superuser table OWNER
// (the audit's exact concern). To model that faithfully and reversibly
// WITHOUT mutating the shared schema's ownership, this test builds a
// throwaway table owned by a freshly-created NON-superuser role, mirrors the
// migration 008/061 isolation policy onto it, applies the same FORCE
// statement shipped in backend/ops/rls/enable_force_rls.sql, and proves the
// owner is constrained. Everything is dropped on cleanup.
func TestRLSBackstop_ForceRLS_ConstrainsTableOwner(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()

	suffix := uuid.NewString()[:8]
	roleName := "rls_owner_" + suffix
	tableName := "rls_force_probe_" + suffix
	wsA := uuid.New()
	wsB := uuid.New()

	// Create a NON-superuser role that will OWN the probe table. This is the
	// production-like "table owner that is not a superuser" scenario.
	_, err := pool.Exec(ctx, fmt.Sprintf(`CREATE ROLE %s NOSUPERUSER NOBYPASSRLS`, roleName))
	require.NoError(t, err)
	t.Cleanup(func() {
		c := context.Background()
		_, _ = pool.Exec(c, fmt.Sprintf(`DROP TABLE IF EXISTS %s`, tableName))
		_, _ = pool.Exec(c, fmt.Sprintf(`DROP ROLE IF EXISTS %s`, roleName))
	})

	// Build the probe table and hand ownership to the non-superuser role.
	_, err = pool.Exec(ctx, fmt.Sprintf(
		`CREATE TABLE %s (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL)`,
		tableName))
	require.NoError(t, err)
	_, err = pool.Exec(ctx, fmt.Sprintf(`ALTER TABLE %s OWNER TO %s`, tableName, roleName))
	require.NoError(t, err)

	// Mirror the exact isolation policy pattern from migrations 008/061.
	_, err = pool.Exec(ctx, fmt.Sprintf(`ALTER TABLE %s ENABLE ROW LEVEL SECURITY`, tableName))
	require.NoError(t, err)
	_, err = pool.Exec(ctx, fmt.Sprintf(`
		CREATE POLICY %s_isolation ON %s
		USING (
			current_setting('app.bypass_rls', true) = 'on'
			OR workspace_id::text = current_setting('app.workspace_id', true)
		)`, tableName, tableName))
	require.NoError(t, err)

	// Seed one row per tenant (as superuser — bypasses RLS for seeding).
	_, err = pool.Exec(ctx, fmt.Sprintf(`INSERT INTO %s (workspace_id) VALUES ($1), ($2)`, tableName), wsA, wsB)
	require.NoError(t, err)

	// countAsOwner runs SELECT count(*) as the probe table's NON-superuser
	// OWNER role, with app.workspace_id pinned via tx-scoped set_config.
	countAsOwner := func(ctxWS uuid.UUID) int {
		tx, txErr := pool.Begin(ctx)
		require.NoError(t, txErr)
		defer func() { _ = tx.Rollback(ctx) }()
		_, e := tx.Exec(ctx, fmt.Sprintf("SET LOCAL ROLE %s", roleName))
		require.NoError(t, e)
		_, e = tx.Exec(ctx, "SELECT set_config('app.workspace_id', $1, true)", ctxWS.String())
		require.NoError(t, e)
		var n int
		require.NoError(t, tx.QueryRow(ctx, fmt.Sprintf(`SELECT count(*) FROM %s`, tableName)).Scan(&n))
		return n
	}

	// Sanity: WITHOUT force, the table OWNER bypasses RLS — sees BOTH rows
	// even with app.workspace_id pinned to A. This is the INERT state the
	// audit flagged (owner bypass).
	assert.Equal(t, 2, countAsOwner(wsA),
		"baseline: without FORCE the table owner bypasses RLS and sees BOTH tenants (the inert state)")

	// Apply the FORCE statement (mirrors enable_force_rls.sql).
	_, err = pool.Exec(ctx, fmt.Sprintf(`ALTER TABLE %s FORCE ROW LEVEL SECURITY`, tableName))
	require.NoError(t, err)

	// (ii) With FORCE + app.workspace_id=A, the OWNER now sees only A's row.
	assert.Equal(t, 1, countAsOwner(wsA),
		"with FORCE RLS the table owner is constrained: app.workspace_id=A sees only tenant A")

	// (i) With FORCE + app.workspace_id=B, the OWNER sees only B's row — and
	// crucially NOT A's. Cross-tenant is denied to the owner under FORCE.
	assert.Equal(t, 1, countAsOwner(wsB),
		"with FORCE RLS the table owner sees only its set tenant, never cross-tenant rows")
}
