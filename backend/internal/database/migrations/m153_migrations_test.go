package migrations_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Migration 153 — gallery/album asset hot-path covering indexes.
//
// Two ordering queries open on every gallery/album view but had no covering
// index, so Postgres fell back to Sort -> Seq/Index Scan + Filter on every open
// (EXPLAIN-confirmed against PG 17 in the 2026-06-04 perf audit, PERF-01/02):
//
//   * GalleryAssetRepo.ListByGallery (repository/gallery_asset_repo.go):
//       WHERE ga.gallery_id = $1 ... ORDER BY ga.sort_order ASC
//     Migration 013 only ships single-column idx_gallery_assets_gallery_id /
//     _asset_id, so the sort_order ordering is never index-served.
//
//   * AlbumRepo.ListAssets / ListAssetsForAlbums (repository/album_repo.go):
//       WHERE aa.album_id = $1 ORDER BY aa.position ASC, aa.added_at ASC
//     album_assets carries only its (album_id, asset_id) PRIMARY KEY — no index
//     matches the position/added_at ordering.
//
// A running dev DB already carried equivalent indexes, but they lived in NO
// migration and NO docs/db/schema.sql, so prod (built from migrations) sorted
// on every open. This migration ships them for real.
//
// File-content contract tests, mirroring the m152 pattern in this directory
// (no DB required — migration tests here are hermetic file-content contracts).
//
// Numbered 153 deliberately: 152 (asset retry tracking) is the current max
// committed; 153 is the next free number. Additive + idempotent
// (CREATE INDEX IF NOT EXISTS) — no table is touched, fully reversible.

const m153Base = "153_gallery_asset_hot_path_indexes"

func TestM153_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)
	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, m153Base+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM153_Up_CreatesHotPathCoveringIndexes(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m153Base+".up.sql"))
	require.NoError(t, err)
	content := string(body)

	// Must be wrapped in a transaction so both indexes apply atomically.
	assert.Contains(t, content, "BEGIN", "up must be wrapped in a transaction")
	assert.Contains(t, content, "COMMIT", "up must commit the transaction")

	// gallery_assets: composite covering index serving
	//   WHERE gallery_id = $1 ORDER BY sort_order ASC
	// as an index range scan (key order matches predicate + sort).
	assert.Contains(t, content,
		"CREATE INDEX IF NOT EXISTS idx_gallery_assets_gallery_sort ON gallery_assets (gallery_id, sort_order, asset_id)",
		"up must create the gallery_assets (gallery_id, sort_order, asset_id) covering index")
	// INCLUDE the remaining ListByGallery projection columns so the scan is
	// index-only (id, is_hero, added_at; gallery_id/sort_order/asset_id are keys).
	assert.Contains(t, content, "INCLUDE (id, is_hero, added_at)",
		"gallery_assets index must INCLUDE the projected non-key columns for an index-only scan")

	// album_assets: composite index serving
	//   WHERE album_id = $1 ORDER BY position ASC, added_at ASC
	// (the (album_id, asset_id) PRIMARY KEY can't order by position).
	assert.Contains(t, content,
		"CREATE INDEX IF NOT EXISTS idx_album_assets_album_position ON album_assets (album_id, position, added_at)",
		"up must create the album_assets (album_id, position, added_at) covering index")

	// Idempotent creation so re-running the migration is safe.
	assert.Contains(t, content, "CREATE INDEX IF NOT EXISTS",
		"indexes must be created IF NOT EXISTS (idempotent)")

	// SAFETY: additive only — index DDL, never table DDL.
	stripped := stripSQLComments(content)
	assert.NotContains(t, stripped, "DROP TABLE", "153 up must NOT drop any table")
	assert.NotContains(t, stripped, "CREATE TABLE", "153 up must NOT create any table — CREATE INDEX only")
	assert.NotContains(t, stripped, "ALTER TABLE", "153 up must NOT alter any table — CREATE INDEX only")
}

func TestM153_Down_DropsBothIndexes(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m153Base+".down.sql"))
	require.NoError(t, err)
	content := string(body)

	// Both indexes added by up must be dropped, idempotently.
	assert.Contains(t, content, "DROP INDEX IF EXISTS idx_gallery_assets_gallery_sort",
		"down must drop the gallery_assets covering index (idempotent IF EXISTS)")
	assert.Contains(t, content, "DROP INDEX IF EXISTS idx_album_assets_album_position",
		"down must drop the album_assets covering index (idempotent IF EXISTS)")

	// SAFETY: down must NOT drop or recreate any table.
	stripped := stripSQLComments(content)
	assert.NotContains(t, stripped, "DROP TABLE", "153 down must NOT drop any table")
	assert.NotContains(t, stripped, "CREATE TABLE", "153 down must NOT create any table")
}
