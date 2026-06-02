package migrations_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Migration 143 — Branded client email automation (Gallery Enhancements June
// 2026). Adds a per-gallery automation toggle and an idempotent send ledger
// driving the "gallery ready / reminder / last-chance" branded email drip.
// File-content contract tests, mirroring the M135 pattern in this directory.

func TestM143_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)

	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, "143_gallery_email_automation"+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM143_UpAddsToggleAndLedger(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, "143_gallery_email_automation.up.sql"))
	require.NoError(t, err)
	content := string(body)

	// Per-gallery automation toggle, default on.
	assert.Contains(t, content, "ADD COLUMN IF NOT EXISTS email_automation_enabled",
		"up must add the per-gallery automation toggle")

	// Idempotent send ledger.
	assert.Contains(t, content, "CREATE TABLE IF NOT EXISTS gallery_email_events",
		"up must create the email-event ledger")
	assert.Contains(t, content, "REFERENCES galleries(id) ON DELETE CASCADE",
		"events must be owned by a gallery and cascade-delete with it")
	assert.Contains(t, content, "scheduled_for",
		"each event carries the time it is due")
	assert.Contains(t, content, "sent_at",
		"each event records when it was sent")

	// Due-scan index and dedupe guard (idempotency).
	assert.Contains(t, content, "idx_gallery_email_events_due",
		"up must add the due-scan index used by the polling worker")
	assert.Contains(t, content, "idx_gallery_email_events_dedupe",
		"up must add the dedupe unique index so the worker never double-sends")
	assert.Contains(t, content, "UNIQUE INDEX IF NOT EXISTS idx_gallery_email_events_dedupe",
		"the dedupe index must be UNIQUE")
}

func TestM143_DownDropsToggleAndLedger(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, "143_gallery_email_automation.down.sql"))
	require.NoError(t, err)
	content := string(body)

	assert.Contains(t, content, "DROP TABLE IF EXISTS gallery_email_events")
	assert.Contains(t, content, "DROP COLUMN IF EXISTS email_automation_enabled")
}
