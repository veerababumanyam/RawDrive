package migrations_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const m183Base = "183_refresh_subscription_tier_positioning"

func TestM183_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)
	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, m183Base+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM183_RefreshesTierPositioning(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m183Base+".up.sql"))
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
	assert.Contains(t, content, "'studio'")
	assert.Contains(t, content, "Best-value hero plan")
	assert.Contains(t, content, "3298534883328",
		"elite studio default quota must be 3TB")
	assert.Contains(t, content, "'Multi-branch Studio Support'")
}

func TestM183_DownRestoresPreviousPositioning(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m183Base+".down.sql"))
	require.NoError(t, err)
	content := string(body)

	assert.Contains(t, content, "The main money plan for working pros.")
	assert.Contains(t, content, "6597069766656",
		"down must restore the previous 6TB elite default")
	assert.Contains(t, content, "'0% Selling Commission'")
}
