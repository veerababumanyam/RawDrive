package migrations_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const m194Base = "194_gallery_account_shares_storage_attribution"

func TestM194_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)
	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, m194Base+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM194_CreatesGalleryWorkspaceShares(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m194Base+".up.sql"))
	require.NoError(t, err)
	normalized := strings.Join(strings.Fields(string(body)), " ")

	assert.Contains(t, normalized, "CREATE TABLE IF NOT EXISTS gallery_workspace_shares")
	assert.Contains(t, normalized, "gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE")
	assert.Contains(t, normalized, "shared_workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE")
	assert.Contains(t, normalized, "storage_billed_to_workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE")
	assert.Contains(t, normalized, "CHECK (owner_workspace_id <> shared_workspace_id)")
	assert.Contains(t, normalized, "CHECK (storage_billed_to_workspace_id IN (owner_workspace_id, shared_workspace_id))")
	assert.Contains(t, normalized, "gallery_workspace_shares_active_uniq")
	assert.Contains(t, normalized, "WHERE revoked_at IS NULL")
}

func TestM194_DownDropsGalleryWorkspaceShares(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m194Base+".down.sql"))
	require.NoError(t, err)
	normalized := strings.Join(strings.Fields(string(body)), " ")

	assert.Contains(t, normalized, "DROP INDEX IF EXISTS gallery_workspace_shares_active_uniq")
	assert.Contains(t, normalized, "DROP TABLE IF EXISTS gallery_workspace_shares")
}
