package migrations_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Migration 175 — seed the phone-reuse enforcement feature flag, DISABLED
// (slice 6). Hermetic file-content contract test.

const m175Base = "175_phone_reuse_flag_seed"

func TestM175_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)
	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, m175Base+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM175_Up_SeedsFlagDisabled(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m175Base+".up.sql"))
	require.NoError(t, err)
	content := string(body)
	normalized := normalizeWhitespace(content)

	assert.Contains(t, normalized, "INSERT INTO platform_settings",
		"up must seed a platform_settings row")
	assert.Contains(t, normalized, "'phone_reuse.enforcement'",
		"up must seed the phone_reuse.enforcement key")
	// MUST seed disabled — enabling before the payment funnel is verified would
	// strand paid_pending accounts.
	assert.Contains(t, normalized, `'{"enabled":false}'`,
		"flag must be seeded DISABLED")
	assert.NotContains(t, normalized, `'{"enabled":true}'`,
		"flag must NOT be seeded enabled")
	assert.Contains(t, content, "ON CONFLICT (category, key) DO NOTHING",
		"seed must be idempotent")
}

func TestM175_Down_RemovesFlag(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m175Base+".down.sql"))
	require.NoError(t, err)
	normalized := normalizeWhitespace(string(body))
	assert.Contains(t, normalized, "DELETE FROM platform_settings WHERE category = 'featureflag' AND key = 'phone_reuse.enforcement'",
		"down must remove the seeded flag row")
}
