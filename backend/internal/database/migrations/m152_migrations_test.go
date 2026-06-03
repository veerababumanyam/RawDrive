package migrations_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Migration 152 — asset retry/failure state-machine tracking. Foundation for the
// server-side HEIC/RAW decode pipeline. Adds the columns the ThumbnailWorker
// poller needs to distinguish a transient (retryable) decode failure from a
// terminal one: a retry counter, the next-eligible retry time, and the
// server-sniffed decode format token. Plus a partial index that keeps the
// "rows due for retry" poll cheap.
//
// File-content contract tests, mirroring the M151 pattern in this directory
// (no DB required).
//
// Numbered 152 deliberately: 151 (storage b2 platform settings) is the current
// max committed; 152 is the next free number. assets.status is plain TEXT (no
// enum), so the terminal 'failed' value needs no enum migration.

const m152Base = "152_asset_retry_tracking"

func TestM152_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)
	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, m152Base+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM152_Up_AddsRetryColumnsAndIndex(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m152Base+".up.sql"))
	require.NoError(t, err)
	content := string(body)

	// Must be wrapped in a transaction so the ALTERs + index apply atomically.
	assert.Contains(t, content, "BEGIN", "up must be wrapped in a transaction")
	assert.Contains(t, content, "COMMIT", "up must commit the transaction")

	// retry_count: NOT NULL DEFAULT 0 so existing rows get a sane counter.
	assert.Contains(t, content,
		"ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0",
		"up must additively add retry_count INTEGER NOT NULL DEFAULT 0")

	// next_retry_at: nullable timestamptz — NULL means "not scheduled".
	assert.Contains(t, content,
		"ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ",
		"up must additively add next_retry_at TIMESTAMPTZ")

	// decode_format: the server-sniffed format token persisted for diagnostics.
	assert.Contains(t, content,
		"ADD COLUMN IF NOT EXISTS decode_format TEXT",
		"up must additively add decode_format TEXT")

	// Partial index keyed on next_retry_at, scoped to retryable rows so the
	// worker's "due for retry" poll stays an index range scan.
	assert.Contains(t, content,
		"CREATE INDEX IF NOT EXISTS idx_assets_retryable ON assets(next_retry_at)",
		"up must create the partial retryable index on next_retry_at")
	assert.Contains(t, content, "WHERE status='processing' AND deleted_at IS NULL",
		"the retryable index must be partial: only processing, non-deleted rows")

	// SAFETY: additive only — must NOT drop or recreate the assets table.
	stripped := stripSQLComments(content)
	assert.NotContains(t, stripped, "DROP TABLE", "152 up must NOT drop any table")
	assert.NotContains(t, stripped, "CREATE TABLE", "152 up must NOT create any table — ALTER + CREATE INDEX only")
}

func TestM152_Down_DropsIndexAndColumns(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m152Base+".down.sql"))
	require.NoError(t, err)
	content := string(body)

	// The partial index must be dropped, idempotently.
	assert.Contains(t, content, "DROP INDEX IF EXISTS idx_assets_retryable",
		"down must drop the retryable index (idempotent IF EXISTS)")

	// Every column added by up must be dropped, idempotently.
	for _, col := range []string{"retry_count", "next_retry_at", "decode_format"} {
		assert.Contains(t, content, "DROP COLUMN IF EXISTS "+col,
			"down must drop assets.%s (idempotent IF EXISTS)", col)
	}

	// SAFETY: down must NOT drop or recreate the assets table.
	stripped := stripSQLComments(content)
	assert.NotContains(t, stripped, "DROP TABLE", "152 down must NOT drop any table")
	assert.NotContains(t, stripped, "CREATE TABLE", "152 down must NOT create any table")
}
