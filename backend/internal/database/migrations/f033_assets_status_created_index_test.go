package migrations_test

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Regression test for F-033:
//
//	Thumbnail worker ListByStatus query cannot use any existing index (full table scan +
//	top-N sort every 1 second).
//
// AssetRepo.ListByStatus (asset_repo.go) runs, across ALL workspaces:
//
//	SELECT ... FROM assets WHERE status = $1 AND deleted_at IS NULL ORDER BY created_at ASC LIMIT $2
//
// The thumbnail worker (internal/worker/thumbnail_worker.go) calls it every 1s with
// status='processing' LIMIT 10. No pre-existing index supports this predicate:
//   - idx_assets_workspace_status ON assets(workspace_id, status) (migration 011) has leading
//     column workspace_id, which is absent from the cross-workspace predicate.
//   - idx_assets_processing_status ON assets(processing_status) (migration 038) is on the
//     different column processing_status.
//
// Migration 129 adds a partial index idx_assets_status_created ON assets(status, created_at)
// WHERE deleted_at IS NULL AND status = 'processing' whose key order satisfies both the status
// equality filter and the created_at ASC ordering, and whose predicate matches the worker query
// exactly so the index stays tiny.
//
// These are pure file-content contract assertions (no DB required), matching the pattern in the
// f002 / f025 / m35 / m39 / m41 migration tests. They fail before migration 129 exists and pass
// after. The shared migrationDir(t) helper lives in admin_migrations_test.go.

// normalizeF033SQL lowercases and collapses all runs of whitespace to a single space so index
// definitions match regardless of formatting/line-wrapping.
func normalizeF033SQL(sql string) string {
	return regexp.MustCompile(`\s+`).ReplaceAllString(strings.ToLower(sql), " ")
}

// stripF033Comments removes `-- ...` line comments before DDL-safety assertions so prose that
// merely mentions an index name (e.g. "drop the partial index ... idx_assets_workspace_status
// is untouched") cannot be mistaken for an actual CREATE/DROP/ALTER statement against it. Only
// real, executable DDL should trip the "untouched" guards.
func stripF033Comments(sql string) string {
	var b strings.Builder
	for _, line := range strings.Split(sql, "\n") {
		if i := strings.Index(line, "--"); i >= 0 {
			line = line[:i]
		}
		b.WriteString(line)
		b.WriteByte('\n')
	}
	return normalizeF033SQL(b.String())
}

func readF033Migration(t *testing.T, name string) string {
	t.Helper()
	dir := migrationDir(t)
	b, err := os.ReadFile(filepath.Join(dir, name))
	require.NoError(t, err, "reading migration %s", name)
	return string(b)
}

var (
	// Partial index keyed on (status, created_at) so a single index scan satisfies both the
	// status equality and the created_at ASC ordering of the ListByStatus query. The index name
	// and column-list are asserted; the partial WHERE clause is asserted separately so
	// wording/order is tolerant.
	f033StatusIndex = regexp.MustCompile(`create index if not exists idx_assets_status_created on assets\s*\(\s*status\s*,\s*created_at\s*\)`)
	// The pre-existing composite index that does NOT satisfy a status-only (workspace-absent)
	// predicate because its leading column is workspace_id.
	f033WorkspaceStatusIndex = regexp.MustCompile(`idx_assets_workspace_status on assets\s*\(\s*workspace_id\s*,\s*status\s*\)`)
	// Any DDL statement operating on the pre-existing composite index. Used to assert migration
	// 129 does not touch it — prose comments mentioning the name are fine.
	f033WorkspaceStatusDDL = regexp.MustCompile(`(create|drop|alter)\b[^;]*idx_assets_workspace_status`)
	// Any DDL operating on the unrelated processing_status index from migration 038.
	f033ProcessingStatusDDL = regexp.MustCompile(`(create|drop|alter)\b[^;]*idx_assets_processing_status`)
)

// TestF033_StatusCreatedIndexExists asserts migration 129 adds a partial index on
// assets(status, created_at) whose predicate matches the worker poll query (WHERE deleted_at IS
// NULL AND status = 'processing'), so ListByStatus can use an index scan instead of a sequential
// scan + top-N sort on every 1s tick.
func TestF033_StatusCreatedIndexExists(t *testing.T) {
	up129 := normalizeF033SQL(readF033Migration(t, "129_assets_status_created_index.up.sql"))

	assert.True(t, f033StatusIndex.MatchString(up129),
		"migration 129 must create a partial index idx_assets_status_created ON assets(status, created_at)")

	assert.Contains(t, up129, "where",
		"the status index must be partial (WHERE clause) so it stays scoped to the worker backlog")
	assert.Contains(t, up129, "deleted_at is null",
		"the partial index predicate must include deleted_at IS NULL to match the ListByStatus query")
	assert.Contains(t, up129, "status = 'processing'",
		"the partial index predicate must include status = 'processing' to match the worker poll predicate exactly")
}

// TestF033_PreExistingIndexesUntouched documents that the two indexes the audit cited as
// non-applicable still exist in their committed migrations and that migration 129 does not drop
// or duplicate them. The composite index cannot serve the cross-workspace status predicate
// (leading column workspace_id is absent), and idx_assets_processing_status is on a different
// column — which is precisely why the new partial index is required.
func TestF033_PreExistingIndexesUntouched(t *testing.T) {
	up011 := normalizeF033SQL(readF033Migration(t, "011_create_assets.up.sql"))
	up038 := normalizeF033SQL(readF033Migration(t, "038_m11_asset_metadata_albums.up.sql"))
	up129DDL := stripF033Comments(readF033Migration(t, "129_assets_status_created_index.up.sql"))

	assert.True(t, f033WorkspaceStatusIndex.MatchString(up011),
		"migration 011 must still contain idx_assets_workspace_status ON assets(workspace_id, status); committed migrations must not be edited")
	assert.Contains(t, up038, "idx_assets_processing_status on assets",
		"migration 038 must still contain idx_assets_processing_status; committed migrations must not be edited")

	assert.False(t, f033WorkspaceStatusDDL.MatchString(up129DDL),
		"migration 129 must not CREATE/DROP/ALTER the pre-existing idx_assets_workspace_status")
	assert.False(t, f033ProcessingStatusDDL.MatchString(up129DDL),
		"migration 129 must not CREATE/DROP/ALTER the pre-existing idx_assets_processing_status")
}

// TestF033_DownMigrationDropsStatusIndex asserts the rollback is the exact inverse: it drops the
// partial status index by name and leaves the pre-existing indexes alone.
func TestF033_DownMigrationDropsStatusIndex(t *testing.T) {
	down129 := normalizeF033SQL(readF033Migration(t, "129_assets_status_created_index.down.sql"))
	down129DDL := stripF033Comments(readF033Migration(t, "129_assets_status_created_index.down.sql"))

	assert.Contains(t, down129, "drop index if exists idx_assets_status_created",
		"down migration must drop the partial idx_assets_status_created index")

	assert.False(t, f033WorkspaceStatusDDL.MatchString(down129DDL),
		"down migration must not CREATE/DROP/ALTER the pre-existing idx_assets_workspace_status")
	assert.False(t, f033ProcessingStatusDDL.MatchString(down129DDL),
		"down migration must not CREATE/DROP/ALTER the pre-existing idx_assets_processing_status")
}

// TestF033_MigrationFilesExist asserts both halves of the new migration pair exist and are
// non-empty, matching the TestMNN_MigrationFilesExist convention in this package.
func TestF033_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)
	for _, name := range []string{
		"129_assets_status_created_index.up.sql",
		"129_assets_status_created_index.down.sql",
	} {
		info, err := os.Stat(filepath.Join(dir, name))
		require.NoError(t, err, "migration file must exist: %s", name)
		assert.Greater(t, info.Size(), int64(0), "%s must not be empty", name)
	}
}
