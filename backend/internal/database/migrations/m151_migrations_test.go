package migrations_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestM151_StorageB2PlatformSettingsMigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)

	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, "151_storage_b2_platform_settings"+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

// The managed-B2 credential contract is platform_settings first, env second,
// fatal if neither (see cmd/api/main.go storage bootstrap). This migration
// seeds the canonical storage.* keys so DB-first resolution has rows to read.
func TestM151_UpSeedsManagedB2StorageKeys(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, "151_storage_b2_platform_settings.up.sql"))
	require.NoError(t, err)
	content := strings.ToLower(string(body))

	assert.Contains(t, content, "insert into platform_settings")
	assert.Contains(t, content, "on conflict (category, key) do nothing",
		"re-run must be idempotent and must not clobber operator-set values")

	// Every managed-B2 key the storage bootstrap reads must be seeded.
	for _, key := range []string{
		"b2_bucket_name",
		"b2_region",
		"b2_endpoint",
		"b2_key_id",
		"b2_application_key",
		"sse_mode",
		"sse_customer_key_hex",
	} {
		assert.Containsf(t, content, "'"+key+"'", "storage key %q must be seeded", key)
	}

	// Credential-bearing keys must be flagged secret so the KEK envelope
	// encrypts them at rest; the access/secret keys are the sensitive pair.
	assert.Contains(t, content, "'b2_key_id', '', true",
		"b2_key_id must be seeded as a secret")
	assert.Contains(t, content, "'b2_application_key', '', true",
		"b2_application_key must be seeded as a secret")
	assert.Contains(t, content, "'sse_customer_key_hex', '', true",
		"sse_customer_key_hex must be seeded as a secret")

	// Region carries the managed-B2 default so a bare DB still validates.
	assert.Contains(t, content, "'b2_region', 'us-east-005'")
}

func TestM151_DownRemovesOnlySeededStorageKeys(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, "151_storage_b2_platform_settings.down.sql"))
	require.NoError(t, err)
	content := strings.ToLower(string(body))

	assert.Contains(t, content, "delete from platform_settings")
	assert.Contains(t, content, "category = 'storage'",
		"down must scope its delete to the storage category only")
	for _, key := range []string{
		"b2_bucket_name",
		"b2_application_key",
		"sse_customer_key_hex",
	} {
		assert.Containsf(t, content, "'"+key+"'", "down must remove seeded key %q", key)
	}
}
