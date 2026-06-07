package migrations_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const m186Base = "186_activate_event_upload_quotas"

func TestM186_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)
	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, m186Base+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM186_ActivatesEventUploadProductQuotas(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m186Base+".up.sql"))
	require.NoError(t, err)
	content := string(body)
	normalized := strings.Join(strings.Fields(content), " ")

	assert.Contains(t, content, "event_upload_standard")
	assert.Contains(t, content, "event_upload_wedding")
	assert.Contains(t, content, "10737418240")
	assert.Contains(t, content, "53687091200")
	assert.Contains(t, content, "m186_event_upload_quota_activation")
	assert.Contains(t, content, "'quota_bytes', lv.quota_bytes")
	assert.Contains(t, content, "'upload_window_days', lv.upload_window_days")
	assert.Contains(t, content, "'active_days', lv.active_days")
	assert.Contains(t, content, "'retention_days', lv.retention_days")
	assert.Contains(t, normalized, "30::integer, 30::integer, 30::integer")
	assert.Contains(t, normalized, "TRUE, lv.rank")
}

func TestM186_DownPreservesReferencedCatalogSnapshots(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m186Base+".down.sql"))
	require.NoError(t, err)
	content := string(body)

	assert.Contains(t, content, "m186_event_upload_quota_activation")
	assert.Contains(t, content, "billing_orders bo")
	assert.Contains(t, content, "bo.catalog_snapshot->'product'->>'version_id'")
	assert.Contains(t, content, "gallery_event_entitlements gee")
	assert.Contains(t, content, "gee.billing_product_version_id = bpv.id")
}
