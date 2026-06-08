package migrations_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const m192Base = "192_elite_studio_self_serve_checkout"

func TestM192_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)
	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, m192Base+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM192_EnablesEliteStudioSelfServeCheckout(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m192Base+".up.sql"))
	require.NoError(t, err)
	content := string(body)
	normalized := strings.Join(strings.Fields(content), " ")

	assert.Contains(t, content, "BEGIN", "up must be transactional")
	assert.Contains(t, content, "COMMIT", "up must commit")
	assert.Contains(t, normalized, "UPDATE subscription_plans SET self_serve = TRUE")
	assert.Contains(t, normalized, "WHERE tier = 'elite_studio'")
	assert.Contains(t, normalized, "INSERT INTO subscription_plan_versions")
	assert.Contains(t, normalized, "OR lv.self_serve IS DISTINCT FROM TRUE",
		"up must be idempotent and only insert a new version when the latest version differs")
}

func TestM192_DownRestoresSalesAssistedEliteStudio(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m192Base+".down.sql"))
	require.NoError(t, err)
	normalized := strings.Join(strings.Fields(string(body)), " ")

	assert.Contains(t, normalized, "UPDATE subscription_plans SET self_serve = FALSE")
	assert.Contains(t, normalized, "WHERE tier = 'elite_studio'")
	assert.Contains(t, normalized, "OR lv.self_serve IS DISTINCT FROM FALSE")
}
