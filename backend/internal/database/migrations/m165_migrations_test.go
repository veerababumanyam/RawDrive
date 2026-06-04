package migrations_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Migration 165 — pg_trgm GIN indexes for owner gallery title/description search.
//
// GalleryRepo.List (repository/gallery_repo.go) backs the owner gallery search:
//   WHERE g.workspace_id = $1 AND g.deleted_at IS NULL
//     AND (g.title ILIKE $n OR g.description ILIKE $n)   -- arg = "%" + term + "%"
//   ORDER BY g.created_at DESC
// The search term is wrapped in leading + trailing wildcards ("%term%"). A btree
// index cannot serve a leading-wildcard ILIKE, so every search falls back to a
// sequential scan over the workspace's galleries with a per-row ILIKE filter
// (D2 in the 2026-06-04 perf audit). pg_trgm GIN indexes on title and
// description make the `ILIKE '%term%'` predicate index-usable (bitmap index
// scan), which Postgres can BitmapAnd with the workspace_id/deleted_at filter —
// no seq scan. The query text is unchanged (trigram GIN serves ILIKE / ~~*
// directly), so search semantics and results are identical.
//
// File-content contract test, mirroring the m153/m154 perf-index pattern in this
// directory (no DB required — these migration tests are hermetic). A runtime
// pg_indexes assertion lives in the integration-tagged suite
// (m165_migrations_integration_test.go), which runs only with -tags=integration
// against TEST_DATABASE_URL.
//
// Numbered 165: 164 (fix ai_tags index) is the current max committed on
// origin/main (163 was reserved/skipped); 165 is the next free number.
// Additive + idempotent (CREATE EXTENSION / CREATE INDEX IF NOT EXISTS) — no
// table is touched, fully reversible by 165_*.down.sql.

const m165Base = "165_gallery_search_trgm"

func TestM165_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)
	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, m165Base+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM165_Up_CreatesTrgmGINIndexes(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m165Base+".up.sql"))
	require.NoError(t, err)
	content := string(body)

	// Must be wrapped in a transaction so both indexes apply atomically.
	assert.Contains(t, content, "BEGIN", "up must be wrapped in a transaction")
	assert.Contains(t, content, "COMMIT", "up must commit the transaction")

	// pg_trgm must be guaranteed present before the trgm operator classes are
	// referenced. Idempotent so re-running and a pre-existing extension are safe.
	assert.Contains(t, content, "CREATE EXTENSION IF NOT EXISTS pg_trgm",
		"up must ensure the pg_trgm extension exists (idempotent)")

	// GIN trigram index on galleries.title serving `g.title ILIKE '%term%'`
	// as a bitmap index scan instead of a sequential scan + filter.
	assert.Contains(t, content,
		"CREATE INDEX IF NOT EXISTS idx_galleries_title_trgm ON galleries USING gin (title gin_trgm_ops)",
		"up must create the galleries.title pg_trgm GIN index")

	// GIN trigram index on galleries.description serving
	// `g.description ILIKE '%term%'` the same way.
	assert.Contains(t, content,
		"CREATE INDEX IF NOT EXISTS idx_galleries_description_trgm ON galleries USING gin (description gin_trgm_ops)",
		"up must create the galleries.description pg_trgm GIN index")

	// Idempotent creation so re-running the migration is safe.
	assert.Contains(t, content, "CREATE INDEX IF NOT EXISTS",
		"indexes must be created IF NOT EXISTS (idempotent)")

	// SAFETY: additive only — extension + index DDL, never table DDL.
	stripped := stripSQLComments(content)
	assert.NotContains(t, stripped, "DROP TABLE", "165 up must NOT drop any table")
	assert.NotContains(t, stripped, "CREATE TABLE", "165 up must NOT create any table — CREATE INDEX only")
	assert.NotContains(t, stripped, "ALTER TABLE", "165 up must NOT alter any table — CREATE INDEX only")
}

func TestM165_Down_DropsBothIndexes(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m165Base+".down.sql"))
	require.NoError(t, err)
	content := string(body)

	// Both indexes added by up must be dropped, idempotently.
	assert.Contains(t, content, "DROP INDEX IF EXISTS idx_galleries_title_trgm",
		"down must drop the galleries.title trgm index (idempotent IF EXISTS)")
	assert.Contains(t, content, "DROP INDEX IF EXISTS idx_galleries_description_trgm",
		"down must drop the galleries.description trgm index (idempotent IF EXISTS)")

	// SAFETY: down drops only the indexes it added — it must NOT drop the
	// shared pg_trgm extension (other migrations / indexes depend on it), and
	// must NOT drop or recreate any table.
	stripped := stripSQLComments(content)
	assert.NotContains(t, stripped, "DROP EXTENSION", "165 down must NOT drop the shared pg_trgm extension")
	assert.NotContains(t, stripped, "DROP TABLE", "165 down must NOT drop any table")
	assert.NotContains(t, stripped, "CREATE TABLE", "165 down must NOT create any table")
}
