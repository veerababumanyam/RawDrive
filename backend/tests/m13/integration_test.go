package m13_test

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
	"github.com/rawdrive/backend/tests/testsupport"
)

// testDSN is resolved once by TestMain. It is either DATABASE_URL (preserving
// the escape hatch to point at an existing migrated database for post-mortem
// inspection) or the DSN of a throwaway pgvector testcontainer provisioned
// by testsupport.
var testDSN string

// testcontainerSkipReason is non-empty when TestMain could not resolve a
// usable DSN. getTestDB reads it to skip the calling test cleanly instead
// of failing hard — same contract as tests/m5 and tests/m6.
var testcontainerSkipReason string

// TestMain replaces the previous hardcoded localhost:55070 fallback. Audit
// notes for future maintainers:
//
//   - m13 uses internal/repository and internal/service, but only the parts
//     that are purely DB-backed. No Redis, NATS, R2, or HTTP clients are
//     reachable through the constructors the tests use.
//   - Every test creates its own workspace + gallery with fresh uuid.New()
//     values and has explicit cleanup, so per-package container sharing is
//     safe — no cross-test state leakage.
//   - TestAlbumApprovalAppendOnly drops and recreates a trigger during
//     cleanup. This is safe only because Go runs tests in a package
//     sequentially by default; if someone adds t.Parallel() to any test in
//     this package, that dance becomes a race.
//
// Like m6, m13 does NOT run migrations itself in the env-var path — it
// assumes the DATABASE_URL target is already at the correct schema version.
// The testcontainer path gets migrations automatically via testsupport.
//
// If DATABASE_URL is unset AND testsupport.EnsureDSN cannot boot a
// container (e.g. Docker Desktop unavailable), TestMain records the reason
// and still runs the suite. Every DB-backed test will skip via getTestDB
// and the package reports SKIP instead of FAIL.
func TestMain(m *testing.M) {
	if envDSN := os.Getenv("DATABASE_URL"); envDSN != "" {
		testDSN = envDSN
	} else {
		dsn, err := testsupport.EnsureDSN()
		if err != nil {
			testcontainerSkipReason = fmt.Sprintf("testcontainer unavailable: %v", err)
			fmt.Fprintf(os.Stderr, "m13_test: %s — DB-backed tests will skip\n", testcontainerSkipReason)
		} else {
			testDSN = dsn
		}
	}

	code := m.Run()
	testsupport.Shutdown()
	os.Exit(code)
}

func getTestDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	if testcontainerSkipReason != "" {
		t.Skip(testcontainerSkipReason)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, testDSN)
	require.NoError(t, err, "Failed to connect to test database")
	t.Cleanup(func() { pool.Close() })
	return pool
}

// ──────────────────────── Migration 041: M13 Tables ────────────────────────

func TestMigration041_ProofingSessionsTableExists(t *testing.T) {
	pool := getTestDB(t)
	var exists bool
	err := pool.QueryRow(context.Background(),
		`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'proofing_sessions')`).Scan(&exists)
	require.NoError(t, err)
	assert.True(t, exists, "proofing_sessions table should exist")
}

func TestMigration041_ProofingCommentsTableExists(t *testing.T) {
	pool := getTestDB(t)
	var exists bool
	err := pool.QueryRow(context.Background(),
		`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'proofing_comments')`).Scan(&exists)
	require.NoError(t, err)
	assert.True(t, exists, "proofing_comments table should exist")
}

func TestMigration041_AlbumApprovalsTableExists(t *testing.T) {
	pool := getTestDB(t)
	var exists bool
	err := pool.QueryRow(context.Background(),
		`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'album_approvals')`).Scan(&exists)
	require.NoError(t, err)
	assert.True(t, exists, "album_approvals table should exist")
}

func TestMigration041_GalleryAccessLogsTableExists(t *testing.T) {
	pool := getTestDB(t)
	var exists bool
	err := pool.QueryRow(context.Background(),
		`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'gallery_access_logs')`).Scan(&exists)
	require.NoError(t, err)
	assert.True(t, exists, "gallery_access_logs table should exist")
}

func TestMigration041_GalleriesAccessModeColumn(t *testing.T) {
	pool := getTestDB(t)
	var exists bool
	err := pool.QueryRow(context.Background(),
		`SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'galleries' AND column_name = 'access_mode')`).Scan(&exists)
	require.NoError(t, err)
	assert.True(t, exists, "galleries.access_mode column should exist")
}

func TestMigration041_ProofingSelectionsStarRating(t *testing.T) {
	pool := getTestDB(t)
	var exists bool
	err := pool.QueryRow(context.Background(),
		`SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'proofing_selections' AND column_name = 'star_rating')`).Scan(&exists)
	require.NoError(t, err)
	assert.True(t, exists, "proofing_selections.star_rating column should exist")
}

// ──────────────────────── Proofing Session CRUD ────────────────────────

func TestProofingSessionCRUD(t *testing.T) {
	pool := getTestDB(t)
	ctx := context.Background()

	// Bypass RLS for test
	_, err := pool.Exec(ctx, "SELECT set_config('app.bypass_rls', 'on', false)")
	require.NoError(t, err)

	// Setup test workspace and gallery
	wsID := uuid.New()
	_, err = pool.Exec(ctx, `INSERT INTO workspaces (id, name) VALUES ($1, $2)`, wsID, "Test WS")
	require.NoError(t, err)

	galleryID := uuid.New()
	_, err = pool.Exec(ctx, `INSERT INTO galleries (id, workspace_id, title, slug) VALUES ($1, $2, $3, $4)`,
		galleryID, wsID, "Test Gallery", "test-gallery-"+galleryID.String()[:8])
	require.NoError(t, err)

	repo := repository.NewProofingSessionRepo(pool)

	// Create
	session := &repository.ProofingSession{
		GalleryID:   galleryID,
		Name:        "Must Print",
		Description: "Photos for print order",
		SessionType: "custom",
	}
	err = repo.Create(ctx, session)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, session.ID)

	// Get by ID
	fetched, err := repo.GetByID(ctx, session.ID)
	require.NoError(t, err)
	assert.Equal(t, "Must Print", fetched.Name)

	// List by gallery
	sessions, err := repo.ListByGallery(ctx, galleryID)
	require.NoError(t, err)
	assert.Len(t, sessions, 1)

	// Update
	err = repo.Update(ctx, session.ID, "Updated Name", "Updated desc")
	require.NoError(t, err)
	fetched, err = repo.GetByID(ctx, session.ID)
	require.NoError(t, err)
	assert.Equal(t, "Updated Name", fetched.Name)

	// Delete
	err = repo.Delete(ctx, session.ID)
	require.NoError(t, err)
	sessions, err = repo.ListByGallery(ctx, galleryID)
	require.NoError(t, err)
	assert.Len(t, sessions, 0)

	// Cleanup
	_, _ = pool.Exec(ctx, "DELETE FROM galleries WHERE id = $1", galleryID)
	_, _ = pool.Exec(ctx, "DELETE FROM workspaces WHERE id = $1", wsID)
}

// ──────────────────────── Album Approval Immutability ────────────────────────

func TestAlbumApprovalAppendOnly(t *testing.T) {
	pool := getTestDB(t)
	ctx := context.Background()

	_, err := pool.Exec(ctx, "SELECT set_config('app.bypass_rls', 'on', false)")
	require.NoError(t, err)

	// Setup
	wsID := uuid.New()
	_, err = pool.Exec(ctx, `INSERT INTO workspaces (id, name) VALUES ($1, $2)`, wsID, "Test WS")
	require.NoError(t, err)

	galleryID := uuid.New()
	_, err = pool.Exec(ctx, `INSERT INTO galleries (id, workspace_id, title, slug) VALUES ($1, $2, $3, $4)`,
		galleryID, wsID, "Test Gallery", "test-gallery-"+galleryID.String()[:8])
	require.NoError(t, err)

	approvalSvc := service.NewAlbumApprovalService(repository.NewAlbumApprovalRepo(pool))

	// Create approval
	approval, err := approvalSvc.SubmitApproval(ctx, service.SubmitApprovalInput{
		GalleryID:       galleryID,
		ApprovedByName:  "Client Name",
		ApprovedByEmail: "client@test.com",
		ConfigSnapshot:  map[string]any{"photos": []string{"a", "b", "c"}},
		IPAddress:       "127.0.0.1",
		UserAgent:       "Test Agent",
		Notes:           "Approved for print",
	})
	require.NoError(t, err)
	assert.NotEmpty(t, approval.VersionHash)

	// Verify immutability: UPDATE should fail
	_, err = pool.Exec(ctx, "UPDATE album_approvals SET notes = 'changed' WHERE id = $1", approval.ID)
	assert.Error(t, err, "UPDATE on album_approvals should fail (append-only)")

	// Verify immutability: DELETE should fail
	_, err = pool.Exec(ctx, "DELETE FROM album_approvals WHERE id = $1", approval.ID)
	assert.Error(t, err, "DELETE on album_approvals should fail (append-only)")

	// Cleanup — need to drop trigger temporarily to clean up test data
	_, _ = pool.Exec(ctx, "DROP TRIGGER IF EXISTS trg_album_approvals_no_update ON album_approvals")
	_, _ = pool.Exec(ctx, "DELETE FROM album_approvals WHERE gallery_id = $1", galleryID)
	_, _ = pool.Exec(ctx, `CREATE TRIGGER trg_album_approvals_no_update BEFORE UPDATE OR DELETE ON album_approvals FOR EACH ROW EXECUTE FUNCTION prevent_album_approval_mutation()`)
	_, _ = pool.Exec(ctx, "DELETE FROM galleries WHERE id = $1", galleryID)
	_, _ = pool.Exec(ctx, "DELETE FROM workspaces WHERE id = $1", wsID)
}

// ──────────────────────── Gallery Access Service ────────────────────────

func TestGalleryAccessService_PasswordFlow(t *testing.T) {
	pool := getTestDB(t)
	ctx := context.Background()

	_, err := pool.Exec(ctx, "SELECT set_config('app.bypass_rls', 'on', false)")
	require.NoError(t, err)

	// Setup
	wsID := uuid.New()
	_, err = pool.Exec(ctx, `INSERT INTO workspaces (id, name) VALUES ($1, $2)`, wsID, "Test WS")
	require.NoError(t, err)

	galleryID := uuid.New()
	_, err = pool.Exec(ctx, `INSERT INTO galleries (id, workspace_id, title, slug) VALUES ($1, $2, $3, $4)`,
		galleryID, wsID, "Test Gallery", "test-gallery-"+galleryID.String()[:8])
	require.NoError(t, err)

	galleryRepo := repository.NewGalleryRepo(pool)
	accessLogRepo := repository.NewGalleryAccessLogRepo(pool)
	accessSvc := service.NewGalleryAccessService(galleryRepo, accessLogRepo)

	// Set password
	err = accessSvc.SetPassword(ctx, galleryID, "mypassword123")
	require.NoError(t, err)

	// Verify correct password returns token
	token, err := accessSvc.VerifyPassword(ctx, galleryID, "mypassword123")
	require.NoError(t, err)
	assert.NotEmpty(t, token)

	// Verify wrong password fails
	_, err = accessSvc.VerifyPassword(ctx, galleryID, "wrongpassword")
	assert.Error(t, err)

	// Set access mode
	err = accessSvc.SetAccessMode(ctx, galleryID, "unlisted")
	require.NoError(t, err)

	// Invalid access mode
	err = accessSvc.SetAccessMode(ctx, galleryID, "invalid")
	assert.Error(t, err)

	// Cleanup
	_, _ = pool.Exec(ctx, "DELETE FROM gallery_access_logs WHERE gallery_id = $1", galleryID)
	_, _ = pool.Exec(ctx, "DELETE FROM galleries WHERE id = $1", galleryID)
	_, _ = pool.Exec(ctx, "DELETE FROM workspaces WHERE id = $1", wsID)
}
