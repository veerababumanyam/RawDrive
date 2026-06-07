package migrations_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const m184Base = "184_pay_per_event_storage_clean_sweep"

func TestM184_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)
	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, m184Base+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM184_AddsPayPerEventEntitlementsAndThirtyDayPolicy(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m184Base+".up.sql"))
	require.NoError(t, err)
	content := string(body)
	normalized := strings.Join(strings.Fields(content), " ")

	assert.Contains(t, content, "CREATE TABLE IF NOT EXISTS gallery_event_entitlements")
	assert.Contains(t, content, "quota_bytes BIGINT NOT NULL CHECK (quota_bytes > 0)")
	assert.Contains(t, content, "upload_window_ends_at TIMESTAMPTZ NOT NULL")
	assert.Contains(t, content, "cleanup_due_at TIMESTAMPTZ NOT NULL")
	assert.Contains(t, normalized, "gallery_delete_grace_days = 0")
	assert.Contains(t, normalized, "account_delete_grace_days = 0")
	assert.Contains(t, content, "strict_cleanup_days")
	assert.Contains(t, content, "m184_pay_per_event_cleanup")
	assert.Contains(t, content, "jsonb_set(COALESCE(n.metadata, '{}'::jsonb), '{retention_days}', '30'::jsonb, true)")
}

func TestM184_DownDropsEntitlements(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m184Base+".down.sql"))
	require.NoError(t, err)
	content := string(body)

	assert.Contains(t, content, "DROP TABLE IF EXISTS gallery_event_entitlements")
	assert.Contains(t, content, "gallery_delete_grace_days = 7")
	assert.Contains(t, content, "Auto-archive After 90 Days")
}
