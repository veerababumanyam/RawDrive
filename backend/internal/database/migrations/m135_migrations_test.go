package migrations_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Migration 135 — AREA-UPLOADER-2 (audit 2026-05-31): durable retry +
// dead-letter columns for failed derivative generation. File-content contract
// tests, mirroring the M133/M134 pattern in this directory.

func TestM135_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)

	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, "135_assets_processing_retry"+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM135_UpAddsRetryBookkeepingColumns(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, "135_assets_processing_retry.up.sql"))
	require.NoError(t, err)
	content := string(body)

	assert.Contains(t, content, "ALTER TABLE assets",
		"up must alter the assets table")
	assert.Contains(t, content, "ADD COLUMN IF NOT EXISTS processing_attempts",
		"up must add the processing_attempts counter")
	assert.Contains(t, content, "ADD COLUMN IF NOT EXISTS failed_permanently_at",
		"up must add the dead-letter timestamp")

	// The retry-sweep scan must be index-backed.
	assert.Contains(t, content, "idx_assets_error_retryable",
		"up must add the partial index backing the retry sweep")
	assert.Contains(t, content, "status = 'error'",
		"the retry index must be scoped to status='error'")
}

func TestM135_DownDropsColumnsAndIndex(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, "135_assets_processing_retry.down.sql"))
	require.NoError(t, err)
	content := string(body)

	assert.Contains(t, content, "DROP INDEX IF EXISTS idx_assets_error_retryable")
	assert.Contains(t, content, "DROP COLUMN IF EXISTS processing_attempts")
	assert.Contains(t, content, "DROP COLUMN IF EXISTS failed_permanently_at")
}
