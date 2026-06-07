package migrations_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const m187Base = "187_storage_deletion_jobs"

func TestM187_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)
	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, m187Base+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM187_AddsDurableStorageDeletionQueue(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m187Base+".up.sql"))
	require.NoError(t, err)
	content := string(body)
	normalized := strings.Join(strings.Fields(content), " ")

	assert.Contains(t, content, "CREATE TABLE IF NOT EXISTS storage_deletion_jobs")
	assert.Contains(t, content, "workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE")
	assert.Contains(t, content, "storage_key TEXT NOT NULL")
	assert.Contains(t, normalized, "CHECK (status IN ('pending', 'processing', 'deleted', 'failed'))")
	assert.Contains(t, content, "idx_storage_deletion_jobs_claim")
	assert.Contains(t, normalized, "WHERE status IN ('pending', 'failed')")
}

func TestM187_DownDropsDurableStorageDeletionQueue(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m187Base+".down.sql"))
	require.NoError(t, err)
	content := string(body)

	assert.Contains(t, content, "DROP INDEX IF EXISTS idx_storage_deletion_jobs_claim")
	assert.Contains(t, content, "DROP TABLE IF EXISTS storage_deletion_jobs")
}
