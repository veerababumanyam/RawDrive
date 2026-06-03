package migrations_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Migration 154 — assets dashboard-grid hot-path covering index.
//
// AssetRepo.List (repository/asset_repo.go) backs the workspace asset grid:
//   WHERE workspace_id = $1 AND deleted_at IS NULL ... ORDER BY created_at DESC
// created_at DESC is the default sort. Migration 011 ships only
// idx_assets_workspace_id (workspace_id) and idx_assets_workspace_status
// (workspace_id, status) WHERE deleted_at IS NULL — neither serves the
// created_at ordering, so EXPLAIN shows
//   Limit -> Sort (Sort Key: created_at DESC) -> Index Scan ... Filter: workspace_id
// (PERF-02 in the 2026-06-04 perf audit). This migration adds the partial
// composite that turns the default grid page into an index range scan with no
// Sort.
//
// File-content contract test, mirroring the m152/m153 pattern in this
// directory (no DB required — these migration tests are hermetic).
//
// Numbered 154: the next free number in the perf-audit index wave after 153
// (gallery/album hot-path indexes). Additive + idempotent — no table touched.

const m154Base = "154_assets_workspace_created_index"

func TestM154_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)
	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, m154Base+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM154_Up_CreatesWorkspaceCreatedIndex(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m154Base+".up.sql"))
	require.NoError(t, err)
	content := string(body)

	assert.Contains(t, content, "BEGIN", "up must be wrapped in a transaction")
	assert.Contains(t, content, "COMMIT", "up must commit the transaction")

	// Partial composite serving WHERE workspace_id = $1 AND deleted_at IS NULL
	// ORDER BY created_at DESC as an index range scan (no Sort).
	assert.Contains(t, content,
		"CREATE INDEX IF NOT EXISTS idx_assets_workspace_created ON assets (workspace_id, created_at DESC)",
		"up must create the (workspace_id, created_at DESC) index on assets")
	// Partial: scoped to live rows, matching the query's deleted_at IS NULL guard
	// and keeping the index small.
	assert.Contains(t, content, "WHERE deleted_at IS NULL",
		"the index must be partial on deleted_at IS NULL to match the grid query")

	// SAFETY: additive only — index DDL, never table DDL.
	stripped := stripSQLComments(content)
	assert.NotContains(t, stripped, "DROP TABLE", "154 up must NOT drop any table")
	assert.NotContains(t, stripped, "CREATE TABLE", "154 up must NOT create any table — CREATE INDEX only")
	assert.NotContains(t, stripped, "ALTER TABLE", "154 up must NOT alter any table — CREATE INDEX only")
}

func TestM154_Down_DropsIndex(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m154Base+".down.sql"))
	require.NoError(t, err)
	content := string(body)

	assert.Contains(t, content, "DROP INDEX IF EXISTS idx_assets_workspace_created",
		"down must drop the workspace_created index (idempotent IF EXISTS)")

	stripped := stripSQLComments(content)
	assert.NotContains(t, stripped, "DROP TABLE", "154 down must NOT drop any table")
	assert.NotContains(t, stripped, "CREATE TABLE", "154 down must NOT create any table")
}
