//go:build integration
// +build integration

// Real-Postgres apply/rollback + cross-tenant RLS test for migration 189
// (face RLS variable standardization). Runs only under -tags=integration
// against TEST_DATABASE_URL; skips cleanly otherwise. Uses the shared helpers
// in integration_helpers_test.go (connectTestDB, readMigration, execSQL).
//
// Mirrors the migration-188 integration pattern: seed two workspaces under
// app.bypass_rls, then assert the policy as the NON-OWNER rawdrive_app role
// (migration 008) with the tenant GUC bound via tx-scoped set_config inside a
// rolled-back transaction. Proves the standardized single-variable policy still
// enforces tenant isolation on face_identity_contacts.
package migrations_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

// TestM189_Integration_ApplyRollback re-applies the up (idempotent) and asserts
// the standardized policy keys ONLY on app.current_workspace_id, then runs the
// down to confirm the dual-variable fallback is restored, then restores the up so
// the rest of the suite sees the standardized state.
func TestM189_Integration_ApplyRollback(t *testing.T) {
	pool := connectTestDB(t)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	up := readMigration(t, "189_face_rls_standardize.up.sql")
	down := readMigration(t, "189_face_rls_standardize.down.sql")

	// Idempotent up — policy keys only on current_workspace_id.
	execSQL(t, pool, up)
	require.False(t, policyMentionsWorkspaceIDFallback(t, pool, ctx),
		"after up, face_identity_contacts policy must NOT reference app.workspace_id")
	require.True(t, policyMentionsCurrentWorkspaceID(t, pool, ctx),
		"after up, face_identity_contacts policy must reference app.current_workspace_id")

	// Down restores the dual-variable fallback.
	execSQL(t, pool, down)
	require.True(t, policyMentionsWorkspaceIDFallback(t, pool, ctx),
		"after down, face_identity_contacts policy must restore the app.workspace_id fallback")

	// Restore the standardized state for the rest of the suite / DB.
	execSQL(t, pool, up)
	require.False(t, policyMentionsWorkspaceIDFallback(t, pool, ctx),
		"after restoring up, the app.workspace_id fallback must be gone again")
}

// TestM189_Integration_RLSCrossTenantIsolation proves a connection scoped to
// workspace A cannot read workspace B's face_identity_contacts rows after the
// standardized (single-variable) policy is in place — the load-bearing tenant
// isolation guarantee for biometric identity links.
func TestM189_Integration_RLSCrossTenantIsolation(t *testing.T) {
	pool := connectTestDB(t)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	// Make sure the standardized policy is the one under test.
	execSQL(t, pool, readMigration(t, "189_face_rls_standardize.up.sql"))

	wsA, wsB := uuid.New(), uuid.New()
	contactA, contactB := uuid.New(), uuid.New()
	labelA, labelB := uuid.New(), uuid.New()

	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()

	// Seed under bypass so fixtures land regardless of the connection's RLS scope.
	_, err = conn.Exec(ctx, "SET app.bypass_rls = 'on'")
	require.NoError(t, err)

	mkWorkspace := func(id uuid.UUID) {
		_, err := conn.Exec(ctx,
			`INSERT INTO workspaces (id, name) VALUES ($1, $2)
			 ON CONFLICT (id) DO NOTHING`,
			id, "rls-test-"+id.String()[:8])
		require.NoError(t, err, "seed workspace")
	}
	mkContact := func(id, ws uuid.UUID) {
		_, err := conn.Exec(ctx,
			`INSERT INTO contacts (id, workspace_id, name) VALUES ($1, $2, $3)
			 ON CONFLICT (id) DO NOTHING`,
			id, ws, "rls-contact-"+id.String()[:8])
		require.NoError(t, err, "seed contact")
	}
	mkLink := func(ws, label, contact uuid.UUID) {
		_, err := conn.Exec(ctx,
			`INSERT INTO face_identity_contacts (workspace_id, cluster_label, contact_id)
			 VALUES ($1, $2, $3)`,
			ws, label, contact)
		require.NoError(t, err, "seed face_identity_contacts row")
	}
	mkWorkspace(wsA)
	mkWorkspace(wsB)
	mkContact(contactA, wsA)
	mkContact(contactB, wsB)
	mkLink(wsA, labelA, contactA)
	mkLink(wsB, labelB, contactB)

	t.Cleanup(func() {
		cctx, ccancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer ccancel()
		_, _ = pool.Exec(cctx, `DELETE FROM face_identity_contacts WHERE workspace_id = ANY($1::uuid[])`, []uuid.UUID{wsA, wsB})
		_, _ = pool.Exec(cctx, `DELETE FROM contacts WHERE id = ANY($1::uuid[])`, []uuid.UUID{contactA, contactB})
		_, _ = pool.Exec(cctx, `DELETE FROM workspaces WHERE id = ANY($1::uuid[])`, []uuid.UUID{wsA, wsB})
	})

	// The connecting role (testcontainer superuser/owner) bypasses RLS; assert the
	// policy as the NON-OWNER rawdrive_app role (migration 008) with the tenant GUC
	// bound via tx-scoped set_config, inside a rolled-back tx.
	countAsAppRole := func(ctxWS, targetWS uuid.UUID) (int, bool) {
		tx, txErr := pool.Begin(ctx)
		require.NoError(t, txErr)
		defer func() { _ = tx.Rollback(ctx) }()
		if _, roleErr := tx.Exec(ctx, "SET LOCAL ROLE rawdrive_app"); roleErr != nil {
			return 0, false
		}
		// Bind the CANONICAL face variable only — proving the standardized policy
		// resolves isolation off app.current_workspace_id with no fallback needed.
		_, e := tx.Exec(ctx, "SELECT set_config('app.current_workspace_id', $1, true)", ctxWS.String())
		require.NoError(t, e)
		var n int
		require.NoError(t, tx.QueryRow(ctx,
			`SELECT COUNT(*) FROM face_identity_contacts WHERE workspace_id = $1`, targetWS).Scan(&n))
		return n, true
	}

	countOwn, ok := countAsAppRole(wsA, wsA)
	if !ok {
		t.Skip("rawdrive_app role missing (migration 008) — cannot prove RLS isolation")
	}
	countOther, _ := countAsAppRole(wsA, wsB)
	require.Equal(t, 1, countOwn,
		"workspace A session (app.current_workspace_id=A) must see its own face_identity_contacts row")
	require.Equal(t, 0, countOther,
		"workspace A session must NOT see workspace B's face_identity_contacts rows (RLS isolation)")

	// Symmetric check from B's perspective.
	bOwn, _ := countAsAppRole(wsB, wsB)
	bOther, _ := countAsAppRole(wsB, wsA)
	require.Equal(t, 1, bOwn, "workspace B session must see its own row")
	require.Equal(t, 0, bOther, "workspace B session must NOT see workspace A's rows")
}

// faceContactsPolicyDef reads the live USING expression of the
// face_identity_contacts_workspace_isolation policy from pg_policies.
func faceContactsPolicyDef(t *testing.T, pool *pgxpool.Pool, ctx context.Context) string {
	t.Helper()
	var qual string
	err := pool.QueryRow(ctx,
		`SELECT qual FROM pg_policies
		 WHERE tablename = 'face_identity_contacts'
		   AND policyname = 'face_identity_contacts_workspace_isolation'`).Scan(&qual)
	require.NoError(t, err, "face_identity_contacts isolation policy must exist")
	return qual
}

// policyMentionsWorkspaceIDFallback returns true when the live policy still
// references the app.workspace_id fallback (the dual-variable / pre-standardization
// shape). It matches the bare 'app.workspace_id' GUC, not 'app.current_workspace_id'.
func policyMentionsWorkspaceIDFallback(t *testing.T, pool *pgxpool.Pool, ctx context.Context) bool {
	t.Helper()
	def := faceContactsPolicyDef(t, pool, ctx)
	return strings.Contains(def, "'app.workspace_id'")
}

// policyMentionsCurrentWorkspaceID returns true when the live policy references
// the canonical app.current_workspace_id variable.
func policyMentionsCurrentWorkspaceID(t *testing.T, pool *pgxpool.Pool, ctx context.Context) bool {
	t.Helper()
	def := faceContactsPolicyDef(t, pool, ctx)
	return strings.Contains(def, "'app.current_workspace_id'")
}
