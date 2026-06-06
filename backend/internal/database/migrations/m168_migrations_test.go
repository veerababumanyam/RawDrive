package migrations_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const m168Base = "168_subscription_plan_catalog"

func TestM168_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)
	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, m168Base+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM168_UpCreatesAndSeedsSubscriptionPlans(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m168Base+".up.sql"))
	require.NoError(t, err)
	content := string(body)
	normalized := strings.Join(strings.Fields(content), " ")

	assert.Contains(t, content, "BEGIN", "up must be transactional")
	assert.Contains(t, content, "COMMIT", "up must commit")
	assert.Contains(t, normalized, "CREATE TABLE IF NOT EXISTS subscription_plans",
		"up must create the subscription_plans catalog")
	assert.Contains(t, content, "tier TEXT PRIMARY KEY",
		"tier slug must be the stable primary key")
	assert.Contains(t, content, "monthly_price_paise BIGINT NOT NULL CHECK",
		"monthly price must be stored in paise and validated")
	assert.Contains(t, content, "annual_price_paise BIGINT NOT NULL CHECK",
		"annual price must be stored in paise and validated")
	assert.Contains(t, content, "quota_bytes BIGINT NOT NULL CHECK",
		"plan storage quota must be admin-editable")
	assert.Contains(t, content, "features TEXT[] NOT NULL",
		"plan feature bullets must be persisted")
	assert.Contains(t, content, "ON CONFLICT (tier) DO NOTHING",
		"seed must not overwrite later admin edits")
	for _, tier := range []string{"free", "starter", "professional", "business", "enterprise"} {
		assert.Contains(t, content, "'"+tier+"'",
			"seed must include the existing %s tier", tier)
	}
}

func TestM168_DownDropsSubscriptionPlans(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m168Base+".down.sql"))
	require.NoError(t, err)
	content := string(body)

	assert.Contains(t, content, "DROP TABLE IF EXISTS subscription_plans",
		"down must drop the table added by up")
}
