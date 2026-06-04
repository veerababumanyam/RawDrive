package migrations_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Migration 167 — indexes for the asset filter (camera model) + sort (filename /
// size_bytes) hot paths exercised by AssetRepo.List (repository/asset_repo.go).
//
// AssetRepo.List builds, for the owner asset grid:
//   FROM assets WHERE workspace_id = $1 AND deleted_at IS NULL
//     [ AND (filename ILIKE $n OR exif_data->>'model' ILIKE $n) ]   -- f.Search
//     [ AND exif_data->>'model' ILIKE $n ]                          -- f.CameraModel
//     ...
//   ORDER BY <created_at|filename|size_bytes|capture_date> <ASC|DESC> LIMIT .. OFFSET ..
//
// Two cost problems before this migration (Q-5):
//
//  1. CAMERA-MODEL FILTER (asset_repo.go ~264 / ~269): `exif_data->>'model' ILIKE
//     '%term%'` is a leading-wildcard ILIKE over a per-row JSONB key extraction.
//     No index serves it, so the planner sequentially scans the workspace's
//     assets and re-extracts + ILIKEs the JSONB ->>'model' on every row. A
//     pg_trgm GIN index on the *expression* (exif_data->>'model') makes that
//     predicate index-usable (Bitmap Index Scan) — the existing
//     idx_assets_filename_trgm (043) only covers the filename half of f.Search.
//
//  2. FILENAME / SIZE SORT (asset_repo.go ~284-292): ORDER BY filename and
//     ORDER BY size_bytes have no btree, so every sorted grid page adds a Sort
//     node over the workspace's matching assets. The list is already
//     workspace_id-scoped + deleted_at IS NULL, so a partial composite btree
//     (workspace_id, <col>) WHERE deleted_at IS NULL serves both the WHERE and
//     the ORDER BY, dropping the Sort node (mirrors the shipped
//     idx_assets_workspace_created (workspace_id, created_at DESC) partial index).
//
// The query text in asset_repo.go is UNCHANGED — these are additive indexes, so
// the planner uses them transparently and results are byte-identical.
//
// File-content contract test, mirroring the m165_gallery_search_trgm pattern in
// this directory (hermetic — no DB required). A runtime pg_indexes + EXPLAIN
// assertion lives in the integration-tagged suite
// (m167_migrations_integration_test.go), which runs only with -tags=integration
// against TEST_DATABASE_URL.
//
// Numbered 167: 166 (photographer_business_logo) is the current max committed on
// origin/main; 167 is the next free number (verified against origin/main —
// 163/164/166 landed via concurrent automation; a prior attempt at 166 (PR #98)
// was closed for a collision, hence 167). Additive + idempotent
// (CREATE EXTENSION / CREATE INDEX IF NOT EXISTS) — no table is touched, fully
// reversible by 167_*.down.sql.

const m167Base = "167_asset_filter_sort_indexes"

func TestM167_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)
	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, m167Base+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM167_Up_CreatesFilterAndSortIndexes(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m167Base+".up.sql"))
	require.NoError(t, err)
	content := string(body)

	// Must be wrapped in a transaction so all three indexes apply atomically.
	assert.Contains(t, content, "BEGIN", "up must be wrapped in a transaction")
	assert.Contains(t, content, "COMMIT", "up must commit the transaction")

	// pg_trgm must be guaranteed present before gin_trgm_ops is referenced.
	// Idempotent so re-running and a pre-existing extension are both safe.
	assert.Contains(t, content, "CREATE EXTENSION IF NOT EXISTS pg_trgm",
		"up must ensure the pg_trgm extension exists (idempotent)")

	// Normalize whitespace so multi-line, readable DDL still matches the contract
	// (the SQL wraps long CREATE INDEX statements across lines for legibility).
	normalized := normalizeWhitespace(content)

	// 1. GIN trigram index on the exif_data->>'model' EXPRESSION serving the
	//    camera-model filter `exif_data->>'model' ILIKE '%term%'` as a Bitmap
	//    Index Scan instead of a seq scan + per-row JSONB extract.
	assert.Contains(t, normalized,
		"CREATE INDEX IF NOT EXISTS idx_assets_exif_model_trgm ON assets USING gin ((exif_data->>'model') gin_trgm_ops)",
		"up must create the exif_data->>'model' pg_trgm GIN expression index")

	// 2. Partial composite btree (workspace_id, filename) WHERE deleted_at IS NULL
	//    serving the workspace-scoped ORDER BY filename without a Sort node.
	assert.Contains(t, normalized,
		"CREATE INDEX IF NOT EXISTS idx_assets_workspace_filename ON assets (workspace_id, filename)",
		"up must create the (workspace_id, filename) sort index")

	// 3. Partial composite btree (workspace_id, size_bytes) WHERE deleted_at IS NULL
	//    serving the workspace-scoped ORDER BY size_bytes without a Sort node.
	assert.Contains(t, normalized,
		"CREATE INDEX IF NOT EXISTS idx_assets_workspace_size ON assets (workspace_id, size_bytes)",
		"up must create the (workspace_id, size_bytes) sort index")

	// All three indexes must be partial on the active rows only (matches the
	// repository predicate `deleted_at IS NULL`), so they stay small and aligned
	// with the planner's filter — exactly like idx_assets_workspace_created.
	// Count against comment-stripped SQL so the explanatory header (which also
	// mentions the predicate) is not counted as a fourth occurrence.
	strippedUp := stripSQLComments(content)
	assert.Equal(t, 3, countOccurrences(strippedUp, "WHERE deleted_at IS NULL"),
		"all three indexes must be partial on `WHERE deleted_at IS NULL`")

	// Idempotent creation so re-running the migration is safe.
	assert.Contains(t, content, "CREATE INDEX IF NOT EXISTS",
		"indexes must be created IF NOT EXISTS (idempotent)")

	// SAFETY: additive only — extension + index DDL, never table DDL.
	stripped := stripSQLComments(content)
	assert.NotContains(t, stripped, "DROP TABLE", "167 up must NOT drop any table")
	assert.NotContains(t, stripped, "CREATE TABLE", "167 up must NOT create any table — CREATE INDEX only")
	assert.NotContains(t, stripped, "ALTER TABLE", "167 up must NOT alter any table — CREATE INDEX only")
}

func TestM167_Down_DropsAllThreeIndexes(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m167Base+".down.sql"))
	require.NoError(t, err)
	content := string(body)

	// All three indexes added by up must be dropped, idempotently.
	assert.Contains(t, content, "DROP INDEX IF EXISTS idx_assets_exif_model_trgm",
		"down must drop the exif-model trgm index (idempotent IF EXISTS)")
	assert.Contains(t, content, "DROP INDEX IF EXISTS idx_assets_workspace_filename",
		"down must drop the (workspace_id, filename) sort index (idempotent IF EXISTS)")
	assert.Contains(t, content, "DROP INDEX IF EXISTS idx_assets_workspace_size",
		"down must drop the (workspace_id, size_bytes) sort index (idempotent IF EXISTS)")

	// SAFETY: down drops only the indexes it added — it must NOT drop the shared
	// pg_trgm extension (migration 043 created it and other trigram indexes
	// depend on it), and must NOT drop or recreate any table.
	stripped := stripSQLComments(content)
	assert.NotContains(t, stripped, "DROP EXTENSION", "167 down must NOT drop the shared pg_trgm extension")
	assert.NotContains(t, stripped, "DROP TABLE", "167 down must NOT drop any table")
	assert.NotContains(t, stripped, "CREATE TABLE", "167 down must NOT create any table")
}

// normalizeWhitespace collapses any run of whitespace (incl. newlines used to
// wrap long DDL across lines) into a single space and trims. Lets the contract
// assert on the logical SQL statement regardless of source formatting.
func normalizeWhitespace(s string) string {
	return strings.Join(strings.Fields(s), " ")
}

// countOccurrences returns the number of non-overlapping occurrences of substr
// in s. Local helper so the contract test stays self-contained.
func countOccurrences(s, substr string) int {
	if substr == "" {
		return 0
	}
	count := 0
	for i := 0; i+len(substr) <= len(s); {
		if s[i:i+len(substr)] == substr {
			count++
			i += len(substr)
			continue
		}
		i++
	}
	return count
}
