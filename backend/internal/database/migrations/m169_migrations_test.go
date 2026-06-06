package migrations_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const m169Base = "169_update_pricing_tiers"

func TestM169_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)
	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, m169Base+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM169_UpReplacesOldPricingTiers(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m169Base+".up.sql"))
	require.NoError(t, err)
	content := string(body)
	normalized := strings.Join(strings.Fields(content), " ")

	assert.Contains(t, content, "BEGIN", "up must be transactional")
	assert.Contains(t, content, "COMMIT", "up must commit")
	assert.Contains(t, normalized, "DELETE FROM subscription_plans WHERE tier IN ('starter', 'professional', 'business', 'enterprise')",
		"up must remove old display tiers from the plan catalog")
	for _, tier := range []string{"free", "pay_per_event", "creator", "pro_photographer", "studio", "elite_studio"} {
		assert.Contains(t, content, "'"+tier+"'",
			"up must include the new %s tier", tier)
	}
	assert.Contains(t, normalized, "WHEN 'starter' THEN 'creator'",
		"up must map old Starter workspaces forward")
	assert.Contains(t, normalized, "WHEN 'professional' THEN 'pro_photographer'",
		"up must map old Professional workspaces forward")
	assert.Contains(t, normalized, "WHEN 'enterprise' THEN 'elite_studio'",
		"up must map old Enterprise workspaces forward")
	assert.Contains(t, normalized, "CHECK (plan_tier IN ('free', 'creator', 'pro_photographer', 'studio', 'elite_studio'))",
		"workspace plan-tier constraint must use the new canonical tiers")
}

func TestM169_DownRestoresPreviousPricingTiers(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m169Base+".down.sql"))
	require.NoError(t, err)
	content := string(body)
	normalized := strings.Join(strings.Fields(content), " ")

	assert.Contains(t, normalized, "DELETE FROM subscription_plans WHERE tier IN ('pay_per_event', 'creator', 'pro_photographer', 'studio', 'elite_studio')",
		"down must remove new tiers before restoring old catalog rows")
	for _, tier := range []string{"starter", "professional", "business", "enterprise"} {
		assert.Contains(t, content, "'"+tier+"'",
			"down must restore the previous %s tier", tier)
	}
	assert.Contains(t, normalized, "CHECK (plan_tier IN ('free', 'starter', 'professional', 'business', 'enterprise'))",
		"down must restore the old workspace plan-tier constraint")
}
