package migrations_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Migration 161 — Exponential backoff schedule for webhook delivery retries.
// Adds webhook_deliveries.next_attempt_at so the worker can space retries on an
// exponential schedule instead of the flat claim lease.

func TestM161_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)
	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, "161_webhook_deliveries_next_attempt_at"+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM161_UpAddsNextAttemptAt(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, "161_webhook_deliveries_next_attempt_at.up.sql"))
	require.NoError(t, err)
	content := string(body)
	assert.Contains(t, content, "ADD COLUMN IF NOT EXISTS next_attempt_at",
		"up must add the next_attempt_at backoff-schedule column")
	assert.Contains(t, content, "webhook_deliveries", "up must target the webhook delivery table")
}

func TestM161_DownDropsNextAttemptAt(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, "161_webhook_deliveries_next_attempt_at.down.sql"))
	require.NoError(t, err)
	content := string(body)
	assert.Contains(t, content, "DROP COLUMN IF EXISTS next_attempt_at",
		"down must drop the next_attempt_at column")
}
