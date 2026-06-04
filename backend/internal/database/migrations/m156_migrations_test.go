package migrations_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Migration 156 — Atomic lease-based claim for the DSR purge worker. Adds
// dsr_requests.claimed_at so processBatch() can claim pending (and re-claim
// crashed) rows in a single UPDATE ... FOR UPDATE SKIP LOCKED instead of the
// lock-then-drop scan that let two workers double-erase a subject's data.
// File-content contract tests, mirroring the M143 pattern.

func TestM156_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)
	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, "156_dsr_requests_claimed_at"+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM156_UpAddsClaimLease(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, "156_dsr_requests_claimed_at.up.sql"))
	require.NoError(t, err)
	content := string(body)

	assert.Contains(t, content, "ADD COLUMN IF NOT EXISTS claimed_at",
		"up must add the claim-lease column")
	assert.Contains(t, content, "dsr_requests",
		"up must target the DSR request table")
	assert.Contains(t, content, "idx_dsr_requests_claim",
		"up must add the partial index supporting the claim scan")
}

func TestM156_DownDropsClaimLease(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, "156_dsr_requests_claimed_at.down.sql"))
	require.NoError(t, err)
	content := string(body)

	assert.Contains(t, content, "DROP COLUMN IF EXISTS claimed_at",
		"down must drop the claim-lease column")
	assert.Contains(t, content, "DROP INDEX IF EXISTS idx_dsr_requests_claim",
		"down must drop the claim index")
}
