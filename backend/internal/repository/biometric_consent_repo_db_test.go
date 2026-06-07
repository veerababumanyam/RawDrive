package repository

// DB-backed test for the append-only biometric consent/search audit ledger
// (migration 188, 3b / DPDP·GDPR Art 9). Reuses the repository package's shared
// pool harness (getRetryTestPool — DATABASE_URL or the testsupport pgvector
// testcontainer that runs the real migrator, so biometric_search_audit + its
// RLS policy exist). SKIPS gracefully when no DB is reachable so hermetic CI
// stays green.
//
// Covers acceptance criteria 3b:
//   - a consented search writes exactly ONE append-only audit row carrying the
//     gallery, workspace, endpoint, consent flag, match-count, and a NON-raw
//     (hashed) session subject — never a selfie or embedding (the table has no
//     such column);
//   - cross-tenant isolation: a connection scoped to workspace A (RLS on) cannot
//     read workspace B's audit rows.

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestBiometricConsentRepo_RecordSearch_DB(t *testing.T) {
	pool := getRetryTestPool(t)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()

	// Bypass RLS for fixture setup.
	_, err = conn.Exec(ctx, "SET app.bypass_rls = 'on'")
	require.NoError(t, err)

	wsA, wsB := uuid.New(), uuid.New()
	galA, galB := uuid.New(), uuid.New()

	mkWorkspace := func(id uuid.UUID) {
		_, err := conn.Exec(ctx,
			`INSERT INTO workspaces (id, name) VALUES ($1, $2)
			 ON CONFLICT (id) DO NOTHING`,
			id, "audit-ws-"+id.String()[:8])
		require.NoError(t, err, "seed workspace")
	}
	mkGallery := func(id, ws uuid.UUID) {
		_, err := conn.Exec(ctx,
			`INSERT INTO galleries (id, workspace_id, title, slug) VALUES ($1, $2, $3, $4)
			 ON CONFLICT (id) DO NOTHING`,
			id, ws, "audit-gallery", "audit-gallery-"+id.String()[:8])
		require.NoError(t, err, "seed gallery")
	}
	mkWorkspace(wsA)
	mkWorkspace(wsB)
	mkGallery(galA, wsA)
	mkGallery(galB, wsB)

	t.Cleanup(func() {
		// Use the pool (the acquired conn above is released by its own defer
		// before this cleanup runs); the owner role bypasses RLS so the deletes
		// reach every seeded row regardless of GUC state.
		cctx, ccancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer ccancel()
		_, _ = pool.Exec(cctx, `DELETE FROM biometric_search_audit WHERE workspace_id = ANY($1::uuid[])`, []uuid.UUID{wsA, wsB})
		_, _ = pool.Exec(cctx, `DELETE FROM galleries WHERE id = ANY($1::uuid[])`, []uuid.UUID{galA, galB})
		_, _ = pool.Exec(cctx, `DELETE FROM workspaces WHERE id = ANY($1::uuid[])`, []uuid.UUID{wsA, wsB})
	})

	// The repo uses the pool; the pool's conns are not the same as our acquired
	// conn, so RLS fixture/bypass settings on `conn` don't leak into the repo's
	// inserts. The repo insert carries workspace_id explicitly and the default
	// public connection has no app.current_workspace_id set, so the RLS USING
	// clause (which only governs reads/visibility) does not block the INSERT.
	repo := NewBiometricConsentRepo(pool)

	subject := "0123456789abcdef" // stand-in for a sha256 hex digest (never a raw token)

	// Two consented searches in workspace A, one in workspace B.
	require.NoError(t, repo.RecordSearch(ctx, &BiometricSearchAudit{
		WorkspaceID: wsA, GalleryID: galA, SessionSubject: &subject,
		Endpoint: BiometricEndpointPhotoSearch, ConsentGiven: true, MatchCount: 5,
	}))
	require.NoError(t, repo.RecordSearch(ctx, &BiometricSearchAudit{
		WorkspaceID: wsA, GalleryID: galA, SessionSubject: nil, // public gallery, no session
		Endpoint: BiometricEndpointFaceMatch, ConsentGiven: true, MatchCount: 0,
	}))
	require.NoError(t, repo.RecordSearch(ctx, &BiometricSearchAudit{
		WorkspaceID: wsB, GalleryID: galB, SessionSubject: &subject,
		Endpoint: BiometricEndpointFaceMatch, ConsentGiven: true, MatchCount: 2,
	}))

	// Exactly the rows we wrote exist for each workspace (bypass RLS to count).
	_, err = conn.Exec(ctx, "SET app.bypass_rls = 'on'")
	require.NoError(t, err)
	var nA, nB int
	require.NoError(t, conn.QueryRow(ctx, `SELECT COUNT(*) FROM biometric_search_audit WHERE workspace_id = $1`, wsA).Scan(&nA))
	require.NoError(t, conn.QueryRow(ctx, `SELECT COUNT(*) FROM biometric_search_audit WHERE workspace_id = $1`, wsB).Scan(&nB))
	require.Equal(t, 2, nA, "workspace A must have exactly the two rows it recorded")
	require.Equal(t, 1, nB, "workspace B must have exactly the one row it recorded")

	// Field fidelity: the photo_search row carries the right outcome + hashed
	// subject, and NO raw token / selfie / embedding (the table has no such column,
	// asserted structurally by the migration contract test; here we confirm the
	// stored subject is the hash we passed, not anything larger).
	var endpoint string
	var consent bool
	var matchCount int
	var storedSubject *string
	require.NoError(t, conn.QueryRow(ctx,
		`SELECT endpoint, consent_given, match_count, session_subject
		   FROM biometric_search_audit
		  WHERE workspace_id = $1 AND endpoint = $2`,
		wsA, BiometricEndpointPhotoSearch).Scan(&endpoint, &consent, &matchCount, &storedSubject))
	require.Equal(t, BiometricEndpointPhotoSearch, endpoint)
	require.True(t, consent)
	require.Equal(t, 5, matchCount)
	require.NotNil(t, storedSubject)
	require.Equal(t, subject, *storedSubject)

	// ---- Cross-tenant RLS isolation ----
	// The testcontainer connects as the table-OWNER/superuser role, which
	// BYPASSES RLS (documented Postgres behavior — see
	// database/rls_backstop_integration_test.go). To prove the policy the same
	// way the rest of the suite does, run the read as the NON-OWNER, NOBYPASSRLS
	// `rawdrive_app` role (created by migration 008) with the tenant GUC bound
	// via tx-scoped set_config, inside a rolled-back transaction so nothing
	// leaks onto the pooled connection.
	countAsAppRole := func(ctxWS, targetWS uuid.UUID) (int, bool) {
		tx, txErr := pool.Begin(ctx)
		require.NoError(t, txErr)
		defer func() { _ = tx.Rollback(ctx) }()
		if _, roleErr := tx.Exec(ctx, "SET LOCAL ROLE rawdrive_app"); roleErr != nil {
			return 0, false // role missing — caller skips the RLS assertion
		}
		_, e := tx.Exec(ctx, "SELECT set_config('app.current_workspace_id', $1, true)", ctxWS.String())
		require.NoError(t, e)
		var n int
		require.NoError(t, tx.QueryRow(ctx,
			`SELECT COUNT(*) FROM biometric_search_audit WHERE workspace_id = $1`, targetWS).Scan(&n))
		return n, true
	}

	visibleOwn, ok := countAsAppRole(wsA, wsA)
	if !ok {
		t.Log("rawdrive_app role missing (migration 008) — skipping RLS isolation assertion")
	} else {
		require.Equal(t, 2, visibleOwn, "workspace A session must see its own audit rows")
		visibleOther, _ := countAsAppRole(wsA, wsB)
		require.Equal(t, 0, visibleOther, "workspace A session must NOT see workspace B's audit rows (RLS isolation)")
	}

	// Endpoint CHECK constraint is enforced — an out-of-set endpoint is rejected.
	_, err = conn.Exec(ctx, "SET app.bypass_rls = 'on'")
	require.NoError(t, err)
	_, badErr := conn.Exec(ctx,
		`INSERT INTO biometric_search_audit (workspace_id, gallery_id, endpoint, consent_given, match_count)
		 VALUES ($1, $2, 'not_a_real_endpoint', true, 0)`, wsA, galA)
	require.Error(t, badErr, "endpoint CHECK must reject an out-of-set value")
}
