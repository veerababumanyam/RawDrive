package migrations_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Migration 158 — Atomic lease-based claim for the download (bulk ZIP) worker.
// Adds download_jobs.claimed_at so ClaimPendingJobs can claim in a single
// UPDATE ... FOR UPDATE SKIP LOCKED instead of list-then-mark.

func TestM158_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)
	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, "158_download_jobs_claimed_at"+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM158_UpAddsClaimLease(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, "158_download_jobs_claimed_at.up.sql"))
	require.NoError(t, err)
	content := string(body)
	assert.Contains(t, content, "ADD COLUMN IF NOT EXISTS claimed_at", "up must add the claim-lease column")
	assert.Contains(t, content, "download_jobs", "up must target the download jobs table")
	assert.Contains(t, content, "idx_download_jobs_claim", "up must add the partial claim index")
}

func TestM158_DownDropsClaimLease(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, "158_download_jobs_claimed_at.down.sql"))
	require.NoError(t, err)
	content := string(body)
	assert.Contains(t, content, "DROP COLUMN IF EXISTS claimed_at", "down must drop the claim-lease column")
	assert.Contains(t, content, "DROP INDEX IF EXISTS idx_download_jobs_claim", "down must drop the claim index")
}
