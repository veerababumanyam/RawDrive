package migrations_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Migration 142 — Gallery slideshow background music (Gallery Enhancements
// June 2026). Adds an optional reference from a gallery to an uploaded audio
// asset used as the slideshow background track. File-content contract tests,
// mirroring the M135 pattern in this directory.

func TestM142_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)

	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, "142_gallery_slideshow_music"+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM142_UpAddsMusicAssetColumn(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, "142_gallery_slideshow_music.up.sql"))
	require.NoError(t, err)
	content := string(body)

	assert.Contains(t, content, "ALTER TABLE galleries",
		"up must alter the galleries table")
	assert.Contains(t, content, "ADD COLUMN IF NOT EXISTS music_asset_id",
		"up must add the music_asset_id column")
	assert.Contains(t, content, "REFERENCES assets",
		"music_asset_id must reference the assets table")
	assert.Contains(t, content, "ON DELETE SET NULL",
		"deleting the audio asset must clear the reference, not cascade-delete the gallery")
	assert.Contains(t, content, "idx_galleries_music_asset_id",
		"up must add the partial index on music_asset_id")
}

func TestM142_DownDropsMusicAsset(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, "142_gallery_slideshow_music.down.sql"))
	require.NoError(t, err)
	content := string(body)

	assert.Contains(t, content, "DROP INDEX IF EXISTS idx_galleries_music_asset_id")
	assert.Contains(t, content, "DROP COLUMN IF EXISTS music_asset_id")
}
