package migrations_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Migration 096 — per-owner workspace name uniqueness (Issue #5 from
// RawDrive_NewUniqueIssues.xlsx). File-content contract tests, mirroring
// the M35 / M39 patterns in this directory.

func TestM96_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)

	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, "096_workspaces_unique_owner_name"+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM96_UpDedupesAndCreatesUniqueIndex(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, "096_workspaces_unique_owner_name.up.sql"))
	require.NoError(t, err)
	content := string(body)

	// Defensive dedupe must run before the index is created so existing
	// duplicate rows do not fail the index build.
	dedupePos := strings.Index(content, "ROW_NUMBER() OVER")
	indexPos := strings.Index(content, "CREATE UNIQUE INDEX")
	require.NotEqual(t, -1, dedupePos, "up migration must dedupe before adding the unique index")
	require.NotEqual(t, -1, indexPos, "up migration must create the unique index")
	assert.Less(t, dedupePos, indexPos, "dedupe must precede CREATE UNIQUE INDEX")

	// Index name is the contract — repo.isDuplicateOwnerName matches on it.
	assert.Contains(t, content, "workspaces_owner_lower_name_uniq",
		"index name must match the constraint name the repo matches against")

	// Case-insensitive uniqueness via functional index.
	assert.Contains(t, content, "lower(name)",
		"uniqueness must be case-insensitive to catch 'Studio' vs 'studio'")

	// Per-owner scope — owner_id must appear in the index expression.
	assert.Contains(t, content, "owner_id",
		"index must be (owner_id, lower(name)) — global uniqueness is intentionally NOT enforced")
}

func TestM96_DownDropsIndex(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, "096_workspaces_unique_owner_name.down.sql"))
	require.NoError(t, err)
	content := string(body)

	assert.Contains(t, content, "DROP INDEX")
	assert.Contains(t, content, "workspaces_owner_lower_name_uniq")
	assert.Contains(t, content, "IF EXISTS",
		"DROP must be idempotent so a partial up rollback is safe")
}
