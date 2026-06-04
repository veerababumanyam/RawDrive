package migrations_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Migration 155 — Atomic lease-based claim for the email automation worker.
// Adds gallery_email_events.claimed_at so sendDue() can claim due rows in a
// single UPDATE ... FOR UPDATE SKIP LOCKED instead of the list-then-mark scan
// that let two workers double-send the same client email. File-content contract
// tests, mirroring the M143 pattern in this directory.

func TestM155_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)
	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, "155_gallery_email_events_claimed_at"+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM155_UpAddsClaimLease(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, "155_gallery_email_events_claimed_at.up.sql"))
	require.NoError(t, err)
	content := string(body)

	assert.Contains(t, content, "ADD COLUMN IF NOT EXISTS claimed_at",
		"up must add the claim-lease column")
	assert.Contains(t, content, "gallery_email_events",
		"up must target the email-event ledger")
	assert.Contains(t, content, "idx_gallery_email_events_claim",
		"up must add the partial index supporting the claim scan")
}

func TestM155_DownDropsClaimLease(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, "155_gallery_email_events_claimed_at.down.sql"))
	require.NoError(t, err)
	content := string(body)

	assert.Contains(t, content, "DROP COLUMN IF EXISTS claimed_at",
		"down must drop the claim-lease column")
	assert.Contains(t, content, "DROP INDEX IF EXISTS idx_gallery_email_events_claim",
		"down must drop the claim index")
}
