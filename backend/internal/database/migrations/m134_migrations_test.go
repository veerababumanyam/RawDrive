package migrations_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Migration 134 — S3-G4 / AREA-UPLOADER-3 (audit 2026-05-31): add nullable
// gallery_id + album_id to upload_sessions so finalize can link the finalized
// asset server-side instead of relying on a best-effort client call.
// File-content contract tests, mirroring the M133 pattern in this directory.
// 134 is the next free slot (current max committed is 133).

func TestM134_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)

	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, "134_upload_sessions_gallery_link"+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM134_UpAddsNullableGalleryAndAlbumColumns(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, "134_upload_sessions_gallery_link.up.sql"))
	require.NoError(t, err)
	content := string(body)

	assert.Contains(t, content, "ALTER TABLE upload_sessions",
		"up must alter the upload_sessions table")
	assert.Contains(t, content, "ADD COLUMN IF NOT EXISTS gallery_id uuid",
		"up must add a nullable gallery_id column")
	assert.Contains(t, content, "ADD COLUMN IF NOT EXISTS album_id   uuid",
		"up must add a nullable album_id column")

	// Both columns must FK to their parent tables so a stale id can never be
	// persisted on the session row.
	assert.Contains(t, content, "REFERENCES galleries(id)",
		"gallery_id must reference galleries(id)")
	assert.Contains(t, content, "REFERENCES albums(id)",
		"album_id must reference albums(id)")

	// Backward compatibility: the columns must be nullable, so a session
	// created without a target behaves exactly as before. Guard against a
	// `uuid NOT NULL` column definition (the bare "NOT NULL" substring would
	// also match the "IF NOT EXISTS" clause, so assert on the typed form).
	assert.NotContains(t, content, "uuid NOT NULL",
		"the destination columns must be nullable for backward compatibility")

	// ON DELETE SET NULL (not CASCADE): deleting a gallery/album mid-upload must
	// not delete the in-flight session row and leak its R2 multipart state.
	assert.Contains(t, content, "ON DELETE SET NULL",
		"FKs must use ON DELETE SET NULL so a deleted gallery/album does not drop the session row")
	assert.NotContains(t, content, "ON DELETE CASCADE",
		"FKs must NOT cascade-delete the session row")
}

func TestM134_DownDropsBothColumns(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, "134_upload_sessions_gallery_link.down.sql"))
	require.NoError(t, err)
	content := string(body)

	assert.Contains(t, content, "DROP COLUMN IF EXISTS gallery_id",
		"down must drop gallery_id")
	assert.Contains(t, content, "DROP COLUMN IF EXISTS album_id",
		"down must drop album_id")

	// The down must not attempt to scrub gallery_assets — those link rows are a
	// real side effect of uploads that ran while the columns existed.
	assert.NotContains(t, strings.ToUpper(content), "DELETE FROM GALLERY_ASSETS",
		"down must not delete the gallery_assets link rows produced while the columns existed")
}
