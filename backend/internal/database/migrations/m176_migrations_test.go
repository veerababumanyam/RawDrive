package migrations_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const m176Base = "176_subscription_catalog_backfill_foundation"

func TestM176_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)
	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, m176Base+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM176_UpCreatesPlanVersionsAndSubscriptionBackfillColumns(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m176Base+".up.sql"))
	require.NoError(t, err)
	content := string(body)
	normalized := strings.Join(strings.Fields(content), " ")

	assert.Contains(t, content, "BEGIN", "up must be transactional")
	assert.Contains(t, content, "COMMIT", "up must commit")
	assert.Contains(t, normalized, "CREATE TABLE IF NOT EXISTS subscription_plan_versions",
		"up must create the approved plan-version anchor table")
	assert.Contains(t, content, "tier TEXT NOT NULL REFERENCES subscription_plans(tier)",
		"plan versions must retain the stable plan identity")
	assert.Contains(t, content, "CONSTRAINT subscription_plan_versions_tier_version_unique UNIQUE (tier, version)",
		"plan versions must be idempotently addressable by tier/version")
	assert.Contains(t, content, "INSERT INTO subscription_plan_versions",
		"migration must seed baseline approved versions from subscription_plans")
	assert.Contains(t, content, "ON CONFLICT (tier, version) DO NOTHING",
		"baseline seed must be safe to rerun")
	for _, col := range []string{
		"plan_version_id UUID REFERENCES subscription_plan_versions(id)",
		"catalog_snapshot JSONB",
		"catalog_backfilled_at TIMESTAMPTZ",
		"catalog_backfill_source TEXT",
	} {
		assert.Contains(t, content, col, "subscriptions must add %s", col)
	}
	for _, source := range []string{
		"exact_tier_effective_match",
		"alias_tier_effective_match",
		"earliest_version_fallback",
		"alias_earliest_version_fallback",
		"legacy_backfill_version",
	} {
		assert.Contains(t, content, source, "source check must allow %s", source)
	}
	assert.Contains(t, content, "idx_subscriptions_catalog_backfill_pending",
		"pending backfill rows must be indexed")
}

func TestM176_DownRemovesBackfillFoundation(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m176Base+".down.sql"))
	require.NoError(t, err)
	content := string(body)

	assert.Contains(t, content, "DROP COLUMN IF EXISTS catalog_backfill_source")
	assert.Contains(t, content, "DROP COLUMN IF EXISTS catalog_backfilled_at")
	assert.Contains(t, content, "DROP COLUMN IF EXISTS catalog_snapshot")
	assert.Contains(t, content, "DROP COLUMN IF EXISTS plan_version_id")
	assert.Contains(t, content, "DROP TABLE IF EXISTS subscription_plan_versions")
}
