//go:build integration
// +build integration

// Real-Postgres apply/rollback + cross-tenant RLS test for migration 188
// (biometric_search_audit). Runs only under -tags=integration against
// TEST_DATABASE_URL; skips cleanly otherwise. Uses the shared helpers in
// integration_helpers_test.go (connectTestDB, readMigration, execSQL,
// tableExists, indexExists, scalarInt).
package migrations_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// TestM188_Integration_ApplyRollback applies the down then the up migration and
// asserts the table + index materialise, then verifies the down cleanly removes
// them. The target DB is expected to already be at-or-past 188; we re-run the
// idempotent up so the assertions hold regardless.
func TestM188_Integration_ApplyRollback(t *testing.T) {
	pool := connectTestDB(t)

	up := readMigration(t, "188_biometric_consent_audit.up.sql")
	down := readMigration(t, "188_biometric_consent_audit.down.sql")

	// Ensure present (idempotent up).
	execSQL(t, pool, up)
	require.True(t, tableExists(t, pool, "biometric_search_audit"), "table must exist after up")
	require.True(t, indexExists(t, pool, "biometric_search_audit", "idx_biometric_search_audit_gallery"), "index must exist after up")

	// Down removes it.
	execSQL(t, pool, down)
	require.False(t, tableExists(t, pool, "biometric_search_audit"), "table must be gone after down")

	// Restore for the rest of the suite / DB.
	execSQL(t, pool, up)
	require.True(t, tableExists(t, pool, "biometric_search_audit"), "table must be restored")
}

// TestM188_Integration_RLSCrossTenantIsolation proves a connection scoped to
// workspace A cannot read workspace B's audit rows. This is the load-bearing
// DPDP/GDPR isolation guarantee for the audit ledger.
func TestM188_Integration_RLSCrossTenantIsolation(t *testing.T) {
	pool := connectTestDB(t)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	// Two workspaces + one gallery each, seeded with app.bypass_rls so the
	// fixtures land regardless of the connection's RLS scope.
	wsA, wsB := uuid.New(), uuid.New()
	galA, galB := uuid.New(), uuid.New()

	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()

	_, err = conn.Exec(ctx, "SET app.bypass_rls = 'on'")
	require.NoError(t, err)

	// Minimal workspace + gallery fixtures. We only need the FK targets to exist;
	// any NOT NULL columns beyond the ids are filled with safe defaults. If the
	// schema requires more, this insert fails loudly (better than a false pass).
	mkWorkspace := func(id uuid.UUID) {
		_, err := conn.Exec(ctx,
			`INSERT INTO workspaces (id, name) VALUES ($1, $2)
			 ON CONFLICT (id) DO NOTHING`,
			id, "rls-test-"+id.String()[:8])
		require.NoError(t, err, "seed workspace")
	}
	mkGallery := func(id, ws uuid.UUID) {
		_, err := conn.Exec(ctx,
			`INSERT INTO galleries (id, workspace_id, title, slug) VALUES ($1, $2, $3, $4)
			 ON CONFLICT (id) DO NOTHING`,
			id, ws, "rls-gallery", "rls-gallery-"+id.String()[:8])
		require.NoError(t, err, "seed gallery")
	}
	mkWorkspace(wsA)
	mkWorkspace(wsB)
	mkGallery(galA, wsA)
	mkGallery(galB, wsB)

	insertAudit := func(ws, gal uuid.UUID, endpoint string) {
		_, err := conn.Exec(ctx,
			`INSERT INTO biometric_search_audit
			   (workspace_id, gallery_id, session_subject, endpoint, consent_given, match_count)
			 VALUES ($1, $2, $3, $4, true, 3)`,
			ws, gal, "deadbeef", endpoint)
		require.NoError(t, err, "seed audit row")
	}
	insertAudit(wsA, galA, "photo_search")
	insertAudit(wsB, galB, "face_match")

	t.Cleanup(func() {
		cctx, ccancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer ccancel()
		_, _ = pool.Exec(cctx, `DELETE FROM biometric_search_audit WHERE workspace_id = ANY($1::uuid[])`, []uuid.UUID{wsA, wsB})
		_, _ = pool.Exec(cctx, `DELETE FROM galleries WHERE id = ANY($1::uuid[])`, []uuid.UUID{galA, galB})
		_, _ = pool.Exec(cctx, `DELETE FROM workspaces WHERE id = ANY($1::uuid[])`, []uuid.UUID{wsA, wsB})
	})

	// The connecting role (testcontainer superuser/owner) bypasses RLS; assert
	// the policy as the NON-OWNER rawdrive_app role (migration 008) with the
	// tenant GUC bound via tx-scoped set_config, inside a rolled-back tx.
	countAsAppRole := func(ctxWS, targetWS uuid.UUID) (int, bool) {
		tx, txErr := pool.Begin(ctx)
		require.NoError(t, txErr)
		defer func() { _ = tx.Rollback(ctx) }()
		if _, roleErr := tx.Exec(ctx, "SET LOCAL ROLE rawdrive_app"); roleErr != nil {
			return 0, false
		}
		_, e := tx.Exec(ctx, "SELECT set_config('app.current_workspace_id', $1, true)", ctxWS.String())
		require.NoError(t, e)
		var n int
		require.NoError(t, tx.QueryRow(ctx,
			`SELECT COUNT(*) FROM biometric_search_audit WHERE workspace_id = $1`, targetWS).Scan(&n))
		return n, true
	}

	countOwn, ok := countAsAppRole(wsA, wsA)
	if !ok {
		t.Skip("rawdrive_app role missing (migration 008) — cannot prove RLS isolation")
	}
	countOther, _ := countAsAppRole(wsA, wsB)
	require.Equal(t, 1, countOwn, "workspace A session must see its own audit row")
	require.Equal(t, 0, countOther, "workspace A session must NOT see workspace B's audit rows (RLS isolation)")
}
