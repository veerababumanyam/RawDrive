package migrations_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const m193Base = "193_starter_free_1gb_dynamic_plan_slugs"

func TestM193_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)
	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, m193Base+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM193_UpSetsStarterToOneGBAndAllowsDynamicSlugs(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m193Base+".up.sql"))
	require.NoError(t, err)
	content := string(body)
	normalized := strings.Join(strings.Fields(content), " ")

	assert.Contains(t, content, "BEGIN", "up must be transactional")
	assert.Contains(t, content, "COMMIT", "up must commit")
	assert.Contains(t, normalized, "CHECK (plan_tier ~ '^[a-z][a-z0-9_]{0,19}$')")
	assert.Contains(t, normalized, "pending_plan_tier ~ '^[a-z][a-z0-9_]{0,19}$'")
	assert.Contains(t, normalized, "1073741824::BIGINT AS quota_bytes")
	assert.Contains(t, content, "'1GB storage'")
	assert.Contains(t, content, "'No selling'")
	assert.Contains(t, normalized, "UPDATE workspace_storage ws SET quota_bytes = 1073741824")
	assert.Contains(t, normalized, "INSERT INTO subscription_plan_versions")
}

func TestM193_DownRestoresFixedTierChecksAndFiveGBStarter(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m193Base+".down.sql"))
	require.NoError(t, err)
	content := string(body)
	normalized := strings.Join(strings.Fields(content), " ")

	assert.Contains(t, normalized, "CHECK (plan_tier IN ('free', 'creator', 'pro_photographer', 'studio', 'elite_studio'))")
	assert.Contains(t, normalized, "5368709120::BIGINT AS quota_bytes")
	assert.Contains(t, content, "'5GB storage'")
	assert.Contains(t, normalized, "UPDATE workspace_storage ws SET quota_bytes = 5368709120")
}
