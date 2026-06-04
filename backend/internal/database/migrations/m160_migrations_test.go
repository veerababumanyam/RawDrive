package migrations_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Migration 160 — Atomic lease-based claim for the face detection worker. Adds
// ai_jobs.claimed_at so ClaimPending can flip pending → running in a single
// UPDATE ... FOR UPDATE SKIP LOCKED instead of list-then-mark.

func TestM160_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)
	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, "160_ai_jobs_claimed_at"+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM160_UpAddsClaimLease(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, "160_ai_jobs_claimed_at.up.sql"))
	require.NoError(t, err)
	content := string(body)
	assert.Contains(t, content, "ADD COLUMN IF NOT EXISTS claimed_at", "up must add the claim-lease column")
	assert.Contains(t, content, "ALTER TABLE ai_jobs", "up must target the ai_jobs table")
	assert.Contains(t, content, "idx_ai_jobs_claim", "up must add the partial claim index")
}

func TestM160_DownDropsClaimLease(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, "160_ai_jobs_claimed_at.down.sql"))
	require.NoError(t, err)
	content := string(body)
	assert.Contains(t, content, "DROP COLUMN IF EXISTS claimed_at", "down must drop the claim-lease column")
	assert.Contains(t, content, "DROP INDEX IF EXISTS idx_ai_jobs_claim", "down must drop the claim index")
}
