package m13_test

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

func getTestDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgresql://rawdrive_user:e706fbd6b28d036aa80379447729737b@localhost:55070/rawdrive_db?sslmode=disable"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, dsn)
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
