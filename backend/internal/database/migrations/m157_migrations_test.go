package migrations_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Migration 157 — Atomic lease-based claim for the webhook delivery worker.
// Adds webhook_deliveries.claimed_at so processBatch() can claim retryable rows
// in a single UPDATE ... FOR UPDATE SKIP LOCKED instead of the lock-then-drop
// scan that let a second worker (or the next tick during a slow POST) re-deliver
// the same webhook. File-content contract tests, mirroring the M143 pattern.

func TestM157_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)
	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, "157_webhook_deliveries_claimed_at"+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM157_UpAddsClaimLease(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, "157_webhook_deliveries_claimed_at.up.sql"))
	require.NoError(t, err)
	content := string(body)

	assert.Contains(t, content, "ADD COLUMN IF NOT EXISTS claimed_at",
		"up must add the claim-lease column")
	assert.Contains(t, content, "webhook_deliveries",
		"up must target the webhook delivery table")
	assert.Contains(t, content, "idx_webhook_deliveries_claim",
		"up must add the partial index supporting the claim scan")
}

func TestM157_DownDropsClaimLease(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, "157_webhook_deliveries_claimed_at.down.sql"))
	require.NoError(t, err)
	content := string(body)

	assert.Contains(t, content, "DROP COLUMN IF EXISTS claimed_at",
		"down must drop the claim-lease column")
	assert.Contains(t, content, "DROP INDEX IF EXISTS idx_webhook_deliveries_claim",
		"down must drop the claim index")
}
