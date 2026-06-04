package migrations_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Migration 159 — Atomic lease-based claim for the thumbnail / derivative
// worker. Adds assets.claimed_at so ClaimRetryable can claim 'processing' rows
// in a single UPDATE ... FOR UPDATE SKIP LOCKED instead of a plain list.

func TestM159_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)
	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, "159_assets_claimed_at"+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM159_UpAddsClaimLease(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, "159_assets_claimed_at.up.sql"))
	require.NoError(t, err)
	content := string(body)
	assert.Contains(t, content, "ADD COLUMN IF NOT EXISTS claimed_at", "up must add the claim-lease column")
	assert.Contains(t, content, "ALTER TABLE assets", "up must target the assets table")
	assert.Contains(t, content, "idx_assets_derivative_claim", "up must add the partial claim index")
}

func TestM159_DownDropsClaimLease(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, "159_assets_claimed_at.down.sql"))
	require.NoError(t, err)
	content := string(body)
	assert.Contains(t, content, "DROP COLUMN IF EXISTS claimed_at", "down must drop the claim-lease column")
	assert.Contains(t, content, "DROP INDEX IF EXISTS idx_assets_derivative_claim", "down must drop the claim index")
}
