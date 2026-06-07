package migrations_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const m182Base = "182_clean_tier_plan_copy"

func TestM182_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)
	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, m182Base+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM182_CleansPublicTierCopy(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m182Base+".up.sql"))
	require.NoError(t, err)
	content := string(body)
	normalized := strings.Join(strings.Fields(content), " ")

	assert.Contains(t, content, "BEGIN", "up must be transactional")
	assert.Contains(t, content, "COMMIT", "up must commit")
	assert.Contains(t, normalized, "UPDATE subscription_plans",
		"up must update the live admin plan catalog")
	assert.Contains(t, normalized, "INSERT INTO subscription_plan_versions",
		"up must insert approved public catalog versions")
	assert.Contains(t, normalized, "changed_plans AS",
		"up must avoid duplicate plan-version rows when re-applied")
	assert.Contains(t, content, "Side & weekend photographers getting started.")
	assert.Contains(t, content, "'AI face search (fast)'")
	assert.Contains(t, content, "'AI face search (priority)'")
	assert.Contains(t, content, "'Multi-branch studio support'")
	assert.Contains(t, content, "3298534883328",
		"elite studio default quota must remain 3TB")
}

func TestM182_DownRestoresM181PositioningCopy(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m182Base+".down.sql"))
	require.NoError(t, err)
	content := string(body)

	assert.Contains(t, content, "Side photographers moving into paid client delivery.")
	assert.Contains(t, content, "'Fast AI Face Search'")
	assert.Contains(t, content, "'Priority AI Face Search'")
	assert.Contains(t, content, "'Multi-branch Studio Support'")
}
