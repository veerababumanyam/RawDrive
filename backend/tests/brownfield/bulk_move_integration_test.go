// Package brownfield_test hosts real-postgres integration tests that
// validate the brownfield-issue fixes end-to-end against a running
// pgvector instance. The package is deliberately separate from the
// existing per-milestone test packages so the brownfield coverage
// can grow without entangling with M2/M5/M6/M13 legacy setups.
//
// These tests run against EITHER:
//   - DATABASE_URL env var (preferred — targets the compose postgres
//     via its host-exposed port), OR
//   - a testsupport.EnsureDSN() pgvector testcontainer (fallback,
//     requires a working Docker daemon).
//
// Per-test isolation is by UUID, not schema — every workspace, user,
// gallery, and asset is created with fresh uuid.New() values so
// parallel runs or re-runs against the same DB do not collide.
// Tests clean up their own rows in t.Cleanup to keep the shared
// database from growing unboundedly.
package brownfield_test

import (
	"context"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/tests/testsupport"
)

var testDSN string

// dsnInitErr is captured when the package tries to resolve a DSN
// (either from DATABASE_URL or testcontainers) and fails. Tests
// check this in getTestPool and t.Skip rather than t.Fatal so a
// local dev run without a live postgres still lets the other
// brownfield tests execute.
var dsnInitErr error

// TestMain resolves the DSN once per package. DATABASE_URL wins so
// local dev can point at the compose postgres without starting a
// testcontainer every run. If DATABASE_URL is unset, fall back to
// the shared testsupport container. Any failure is captured into
// dsnInitErr and individual tests skip rather than fail.
func TestMain(m *testing.M) {
	if envDSN := os.Getenv("DATABASE_URL"); envDSN != "" {
		testDSN = envDSN
	} else {
		dsn, err := testsupport.EnsureDSN()
		if err != nil {
			dsnInitErr = err
			fmt.Fprintf(os.Stderr, "brownfield_test: no DB available: %v (db tests will skip)\n", err)
		} else {
			testDSN = dsn
		}
	}

	code := m.Run()
	testsupport.Shutdown()
	os.Exit(code)
}

// getTestPool opens a pool to the resolved DSN. If DATABASE_URL is
// unreachable or testcontainers failed (hung Docker daemon, port
// not accepting, handshake stuck, etc.), the test is skipped with
// a clear reason instead of failing.
func getTestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	if dsnInitErr != nil {
		t.Skipf("brownfield_test: no database available: %v", dsnInitErr)
	}
	if testDSN == "" {
		t.Skip("brownfield_test: DATABASE_URL unset and testcontainers unavailable")
	}
	// Use a tight timeout for the initial pool creation + first
	// acquire so a hung postgres handshake produces a skip, not a
	// 120-second test-binary hang.
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	pool, err := pgxpool.NewWithConfig(ctx, mustParseConfig(t, testDSN))
	if err != nil {
		t.Skipf("brownfield_test: opening pool: %v", err)
	}
	// Ping to surface hung-handshake cases as a skip.
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		t.Skipf("brownfield_test: postgres ping failed (container may be hung): %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

func mustParseConfig(t *testing.T, dsn string) *pgxpool.Config {
	t.Helper()
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Skipf("brownfield_test: invalid DSN: %v", err)
	}
	// Tight connect timeout so hung handshakes surface as Skip in
	// under 5 seconds rather than 120-second test timeouts.
	cfg.ConnConfig.ConnectTimeout = 3 * time.Second
	return cfg
}

// ──────────────────────── Seed helpers ────────────────────────

type seededWorkspace struct {
	WorkspaceID uuid.UUID
	OwnerID     uuid.UUID
	StateID     int
}

// seedWorkspace inserts a fresh user + workspace + state row and
// returns the identifiers. The caller gets a t.Cleanup that removes
// the rows bottom-up.
func seedWorkspace(t *testing.T, pool *pgxpool.Pool, label string) seededWorkspace {
	t.Helper()
	ctx := context.Background()

	// Reuse an existing state if one is already present, otherwise
	// seed a throwaway one. The states table is tiny and shared
	// across tests, so a unique code per test keeps us from
	// colliding with other packages.
	stateCode := "ZZ-" + strings.ToUpper(label[:min(3, len(label))]) + "-" + uuid.New().String()[:8]
	var stateID int
	err := pool.QueryRow(ctx,
		`INSERT INTO states (code, name, country_code)
		 VALUES ($1, $2, 'IN')
		 ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
		 RETURNING id`,
		stateCode, "Brownfield Test "+label,
	).Scan(&stateID)
	require.NoError(t, err, "seed state")

	userID := uuid.New()
	_, err = pool.Exec(ctx,
		`INSERT INTO users (id, email, display_name, state_id, email_verified, password_hash)
		 VALUES ($1, $2, $3, $4, true, 'bcrypt-dummy')`,
		userID,
		"brownfield-"+userID.String()[:8]+"@example.com",
		"Brownfield Test "+label,
		stateID,
	)
	require.NoError(t, err, "seed user")

	workspaceID := uuid.New()
	_, err = pool.Exec(ctx,
		`INSERT INTO workspaces (id, name, state_id, owner_id)
		 VALUES ($1, $2, $3, $4)`,
		workspaceID, "Brownfield WS "+label, stateID, userID,
	)
	require.NoError(t, err, "seed workspace")

	t.Cleanup(func() {
		// Bottom-up cleanup. gallery_assets and galleries are
		// cleaned by the individual tests that create them; here we
		// clean the workspace + user + state so parallel test runs
		// or re-runs stay hygienic.
		_, _ = pool.Exec(context.Background(),
			`DELETE FROM workspaces WHERE id = $1`, workspaceID)
		_, _ = pool.Exec(context.Background(),
			`DELETE FROM users WHERE id = $1`, userID)
		_, _ = pool.Exec(context.Background(),
			`DELETE FROM states WHERE id = $1`, stateID)
	})

	return seededWorkspace{WorkspaceID: workspaceID, OwnerID: userID, StateID: stateID}
}

// seedGallery inserts a gallery owned by the given workspace and
// returns its ID. Registers a t.Cleanup for the row.
func seedGallery(t *testing.T, pool *pgxpool.Pool, ws seededWorkspace, slug string) uuid.UUID {
	t.Helper()
	ctx := context.Background()
	id := uuid.New()
	uniqueSlug := slug + "-" + id.String()[:8]
	_, err := pool.Exec(ctx,
		`INSERT INTO galleries (id, workspace_id, created_by, name, slug, visibility)
		 VALUES ($1, $2, $3, $4, $5, 'private')`,
		id, ws.WorkspaceID, ws.OwnerID, "BF "+slug, uniqueSlug,
	)
	require.NoError(t, err, "seed gallery")
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(),
			`DELETE FROM gallery_assets WHERE gallery_id = $1`, id)
		_, _ = pool.Exec(context.Background(),
			`DELETE FROM galleries WHERE id = $1`, id)
	})
	return id
}

// seedAsset inserts an asset owned by the given workspace and
// returns its ID. Registers a t.Cleanup for the row.
func seedAsset(t *testing.T, pool *pgxpool.Pool, ws seededWorkspace, filename string) uuid.UUID {
	t.Helper()
	ctx := context.Background()
	id := uuid.New()
	_, err := pool.Exec(ctx,
		`INSERT INTO assets (id, workspace_id, filename, content_type, size_bytes, storage_key, storage_driver, uploaded_by, status)
		 VALUES ($1, $2, $3, 'image/jpeg', 1024, $4, 'r2', $5, 'ready')`,
		id, ws.WorkspaceID, filename, "brownfield/"+id.String(), ws.OwnerID,
	)
	require.NoError(t, err, "seed asset")
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(),
			`DELETE FROM asset_derivatives WHERE asset_id = $1`, id)
		_, _ = pool.Exec(context.Background(),
			`DELETE FROM assets WHERE id = $1`, id)
	})
	return id
}

// linkGalleryAsset inserts a gallery_assets row linking an asset to
// a gallery at the given sort_order.
func linkGalleryAsset(t *testing.T, pool *pgxpool.Pool, galleryID, assetID uuid.UUID, sortOrder int) {
	t.Helper()
	_, err := pool.Exec(context.Background(),
		`INSERT INTO gallery_assets (gallery_id, asset_id, sort_order, added_at)
		 VALUES ($1, $2, $3, now())`,
		galleryID, assetID, sortOrder,
	)
	require.NoError(t, err, "link gallery asset")
}

// countGalleryAssets counts rows in gallery_assets for a specific
// (gallery_id, asset_id) pair — 0 or 1.
func countGalleryAssets(t *testing.T, pool *pgxpool.Pool, galleryID, assetID uuid.UUID) int {
	t.Helper()
	var n int
	err := pool.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM gallery_assets WHERE gallery_id = $1 AND asset_id = $2`,
		galleryID, assetID,
	).Scan(&n)
	require.NoError(t, err, "count gallery_assets")
	return n
}

// ──────────────────────── ISSUE-007 integration tests ────────────────────────

// TestIssue007_HappyPath_MoveWithinWorkspace is the baseline: a
// workspace owner moves two assets from gallery A1 to gallery A2
// in their own workspace. Both assets and both galleries belong to
// the same workspace, so BulkMoveToGallery must move exactly both.
func TestIssue007_HappyPath_MoveWithinWorkspace(t *testing.T) {
	pool := getTestPool(t)
	repo := repository.NewAssetRepo(pool)

	wsA := seedWorkspace(t, pool, "A")
	galleryA1 := seedGallery(t, pool, wsA, "A1")
	galleryA2 := seedGallery(t, pool, wsA, "A2")
	asset1 := seedAsset(t, pool, wsA, "a1.jpg")
	asset2 := seedAsset(t, pool, wsA, "a2.jpg")
	linkGalleryAsset(t, pool, galleryA1, asset1, 0)
	linkGalleryAsset(t, pool, galleryA1, asset2, 1)

	affected, err := repo.BulkMoveToGallery(context.Background(),
		[]uuid.UUID{asset1, asset2}, galleryA1, galleryA2, wsA.WorkspaceID)
	require.NoError(t, err)
	assert.Equal(t, int64(2), affected, "both in-workspace assets must be moved")

	// Source gallery should no longer have the assets.
	assert.Equal(t, 0, countGalleryAssets(t, pool, galleryA1, asset1))
	assert.Equal(t, 0, countGalleryAssets(t, pool, galleryA1, asset2))
	// Target gallery should now have them.
	assert.Equal(t, 1, countGalleryAssets(t, pool, galleryA2, asset1))
	assert.Equal(t, 1, countGalleryAssets(t, pool, galleryA2, asset2))
}

// TestIssue007_EmptyInput is the trivial no-op path: empty asset
// slice returns (0, nil) without touching any row.
func TestIssue007_EmptyInput(t *testing.T) {
	pool := getTestPool(t)
	repo := repository.NewAssetRepo(pool)

	wsA := seedWorkspace(t, pool, "Empty")
	galleryA1 := seedGallery(t, pool, wsA, "A1")
	galleryA2 := seedGallery(t, pool, wsA, "A2")

	affected, err := repo.BulkMoveToGallery(context.Background(),
		[]uuid.UUID{}, galleryA1, galleryA2, wsA.WorkspaceID)
	require.NoError(t, err)
	assert.Equal(t, int64(0), affected)
}

// TestIssue007_CrossWorkspaceAsset_IsSilentlyDropped is the primary
// attack scenario: workspace A attempts to move an asset that
// belongs to workspace B. The owner-check on the asset row must
// silently drop the attempt — no rows mutated, affected=0.
func TestIssue007_CrossWorkspaceAsset_IsSilentlyDropped(t *testing.T) {
	pool := getTestPool(t)
	repo := repository.NewAssetRepo(pool)

	wsA := seedWorkspace(t, pool, "AttackerA")
	wsB := seedWorkspace(t, pool, "VictimB")

	galleryA1 := seedGallery(t, pool, wsA, "A1-src")
	galleryA2 := seedGallery(t, pool, wsA, "A2-dst")
	galleryB1 := seedGallery(t, pool, wsB, "B1-victim-src")
	assetBVictim := seedAsset(t, pool, wsB, "victim.jpg")
	linkGalleryAsset(t, pool, galleryB1, assetBVictim, 0)

	// Attacker knows assetBVictim's UUID and tries to move it from
	// their own gallery (galleryA1 — which the asset is NOT in) to
	// their own gallery A2. The workspace_id guard passes (both
	// galleries belong to wsA) but the asset filter catches the
	// cross-workspace asset.
	affected, err := repo.BulkMoveToGallery(context.Background(),
		[]uuid.UUID{assetBVictim}, galleryA1, galleryA2, wsA.WorkspaceID)
	require.NoError(t, err)
	assert.Equal(t, int64(0), affected, "cross-workspace asset must be silently dropped")

	// Victim state is intact: asset still linked to its original
	// gallery in workspace B.
	assert.Equal(t, 1, countGalleryAssets(t, pool, galleryB1, assetBVictim))
	// Attacker's target gallery has nothing (the row was never added).
	assert.Equal(t, 0, countGalleryAssets(t, pool, galleryA2, assetBVictim))
}

// TestIssue007_CrossWorkspaceFromGallery_IsSilentlyDropped catches
// the second half of the attack: the fromGalleryID belongs to a
// different workspace. The COUNT check on galleries must see only
// one of the two galleries in the caller's workspace and abort.
func TestIssue007_CrossWorkspaceFromGallery_IsSilentlyDropped(t *testing.T) {
	pool := getTestPool(t)
	repo := repository.NewAssetRepo(pool)

	wsA := seedWorkspace(t, pool, "FromAttacker")
	wsB := seedWorkspace(t, pool, "FromVictim")

	galleryAdst := seedGallery(t, pool, wsA, "A-dst")
	galleryBsrc := seedGallery(t, pool, wsB, "B-src")
	assetA := seedAsset(t, pool, wsA, "innocent.jpg")
	linkGalleryAsset(t, pool, galleryAdst, assetA, 0)

	// Attacker supplies a fromGalleryID that belongs to workspace B.
	// Their own assetA is in galleryAdst, not galleryBsrc, so even
	// if the gallery guard did not exist, the DELETE would find no
	// rows. The point is that the gallery-ownership guard SHORT
	// CIRCUITS before any SQL against gallery_assets runs.
	affected, err := repo.BulkMoveToGallery(context.Background(),
		[]uuid.UUID{assetA}, galleryBsrc, galleryAdst, wsA.WorkspaceID)
	require.NoError(t, err)
	assert.Equal(t, int64(0), affected, "fromGallery in another workspace must abort")

	// Attacker's existing link is untouched.
	assert.Equal(t, 1, countGalleryAssets(t, pool, galleryAdst, assetA))
}

// TestIssue007_CrossWorkspaceToGallery_IsSilentlyDropped is the
// symmetric case: the attacker supplies a toGalleryID that belongs
// to workspace B. The gallery-ownership guard must abort.
func TestIssue007_CrossWorkspaceToGallery_IsSilentlyDropped(t *testing.T) {
	pool := getTestPool(t)
	repo := repository.NewAssetRepo(pool)

	wsA := seedWorkspace(t, pool, "ToAttacker")
	wsB := seedWorkspace(t, pool, "ToVictim")

	galleryAsrc := seedGallery(t, pool, wsA, "A-src")
	galleryBdst := seedGallery(t, pool, wsB, "B-dst")
	assetA := seedAsset(t, pool, wsA, "asset.jpg")
	linkGalleryAsset(t, pool, galleryAsrc, assetA, 0)

	// Attacker tries to plant their own asset into a gallery they
	// don't own. The gallery-ownership guard aborts.
	affected, err := repo.BulkMoveToGallery(context.Background(),
		[]uuid.UUID{assetA}, galleryAsrc, galleryBdst, wsA.WorkspaceID)
	require.NoError(t, err)
	assert.Equal(t, int64(0), affected, "toGallery in another workspace must abort")

	// Victim's gallery did not receive a rogue insert.
	assert.Equal(t, 0, countGalleryAssets(t, pool, galleryBdst, assetA))
	// Attacker's source link is untouched.
	assert.Equal(t, 1, countGalleryAssets(t, pool, galleryAsrc, assetA))
}

// TestIssue007_MixedAssetOwnership_FiltersCrossWorkspace is the
// most realistic mixed-input scenario: the attacker submits a list
// containing their own assets PLUS one from another workspace. The
// repo must move only the in-workspace assets and silently drop
// the foreign one.
func TestIssue007_MixedAssetOwnership_FiltersCrossWorkspace(t *testing.T) {
	pool := getTestPool(t)
	repo := repository.NewAssetRepo(pool)

	wsA := seedWorkspace(t, pool, "Mixed")
	wsB := seedWorkspace(t, pool, "MixedVictim")

	galleryA1 := seedGallery(t, pool, wsA, "A1")
	galleryA2 := seedGallery(t, pool, wsA, "A2")
	galleryB1 := seedGallery(t, pool, wsB, "B1")

	assetMine1 := seedAsset(t, pool, wsA, "mine-1.jpg")
	assetMine2 := seedAsset(t, pool, wsA, "mine-2.jpg")
	assetVictim := seedAsset(t, pool, wsB, "victim.jpg")
	linkGalleryAsset(t, pool, galleryA1, assetMine1, 0)
	linkGalleryAsset(t, pool, galleryA1, assetMine2, 1)
	linkGalleryAsset(t, pool, galleryB1, assetVictim, 0)

	affected, err := repo.BulkMoveToGallery(context.Background(),
		[]uuid.UUID{assetMine1, assetVictim, assetMine2}, galleryA1, galleryA2, wsA.WorkspaceID)
	require.NoError(t, err)
	assert.Equal(t, int64(2), affected, "only in-workspace assets count toward affected")

	// My two assets moved.
	assert.Equal(t, 0, countGalleryAssets(t, pool, galleryA1, assetMine1))
	assert.Equal(t, 0, countGalleryAssets(t, pool, galleryA1, assetMine2))
	assert.Equal(t, 1, countGalleryAssets(t, pool, galleryA2, assetMine1))
	assert.Equal(t, 1, countGalleryAssets(t, pool, galleryA2, assetMine2))
	// Victim's link is untouched (not deleted, not re-inserted).
	assert.Equal(t, 1, countGalleryAssets(t, pool, galleryB1, assetVictim))
	assert.Equal(t, 0, countGalleryAssets(t, pool, galleryA2, assetVictim))
}

// TestIssue007_PreservesClientOrderingForMove pins the sort_order
// behavior: when the client supplies [mid, first, last] as the ids
// slice, the rows in the target gallery must end up with
// sort_order = 0 (mid), 1 (first), 2 (last). This proves the fix
// preserves the `for i, id := range owned` loop and does NOT
// reorder via SQL natural order.
func TestIssue007_PreservesClientOrderingForMove(t *testing.T) {
	pool := getTestPool(t)
	repo := repository.NewAssetRepo(pool)

	wsA := seedWorkspace(t, pool, "Ordering")
	galleryA1 := seedGallery(t, pool, wsA, "A1")
	galleryA2 := seedGallery(t, pool, wsA, "A2")

	first := seedAsset(t, pool, wsA, "first.jpg")
	mid := seedAsset(t, pool, wsA, "mid.jpg")
	last := seedAsset(t, pool, wsA, "last.jpg")
	linkGalleryAsset(t, pool, galleryA1, first, 0)
	linkGalleryAsset(t, pool, galleryA1, mid, 1)
	linkGalleryAsset(t, pool, galleryA1, last, 2)

	// Intentionally scrambled input order.
	affected, err := repo.BulkMoveToGallery(context.Background(),
		[]uuid.UUID{mid, first, last}, galleryA1, galleryA2, wsA.WorkspaceID)
	require.NoError(t, err)
	assert.Equal(t, int64(3), affected)

	// Verify the target gallery rows have sort_order matching the
	// scrambled input order: mid=0, first=1, last=2.
	var order int
	for i, id := range []uuid.UUID{mid, first, last} {
		err := pool.QueryRow(context.Background(),
			`SELECT sort_order FROM gallery_assets WHERE gallery_id = $1 AND asset_id = $2`,
			galleryA2, id,
		).Scan(&order)
		require.NoError(t, err, "target row for asset %v missing", id)
		assert.Equal(t, i, order, "asset %v expected sort_order %d", id, i)
	}
}
