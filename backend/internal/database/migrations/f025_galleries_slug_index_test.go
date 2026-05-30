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

// Regression test for F-025:
//
//	galleries.GetBySlug performs a full table scan — no standalone index on the slug column.
//
// GalleryRepo.GetBySlug (gallery_repo.go) runs
//
//	SELECT ... FROM galleries WHERE slug = $1 AND deleted_at IS NULL
//
// keyed on slug alone (public_gallery_handler.go / proofing_handler.go / cart_handler.go all
// resolve a gallery by slug without a workspace filter). The only pre-existing slug index is the
// composite UNIQUE idx_galleries_workspace_slug ON galleries(workspace_id, slug) from migration
// 012; Postgres cannot use a composite index whose leading column (workspace_id) is absent from
// the predicate, so the slug-only lookup degrades to a sequential scan.
//
// Migration 128 adds a standalone partial index idx_galleries_slug ON galleries(slug)
// WHERE deleted_at IS NULL whose predicate matches the query exactly.
//
// These are pure file-content contract assertions (no DB required), matching the pattern in the
// f002 / m35 / m39 / m41 migration tests. They fail before migration 128 exists and pass after.
// The shared migrationDir(t) helper lives in admin_migrations_test.go.

// normalizeF025SQL lowercases and collapses all runs of whitespace to a single space so index
// definitions match regardless of formatting/line-wrapping.
func normalizeF025SQL(sql string) string {
	return regexp.MustCompile(`\s+`).ReplaceAllString(strings.ToLower(sql), " ")
}

func readF025Migration(t *testing.T, name string) string {
	t.Helper()
	dir := migrationDir(t)
	b, err := os.ReadFile(filepath.Join(dir, name))
	require.NoError(t, err, "reading migration %s", name)
	return string(b)
}

// stripF025Comments removes full-line `-- ...` SQL comments so DDL assertions are not fooled by
// prose that mentions an index name, then normalizes the remaining executable SQL.
func stripF025Comments(sql string) string {
	var b strings.Builder
	for _, line := range strings.Split(sql, "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), "--") {
			continue
		}
		b.WriteString(line)
		b.WriteString("\n")
	}
	return normalizeF025SQL(b.String())
}

var (
	// Standalone partial index on slug only, with the deleted_at IS NULL predicate matching
	// the GetBySlug query exactly. Index name and column-list are asserted; the partial WHERE
	// clause is asserted separately so wording/order is tolerant.
	f025SlugIndex = regexp.MustCompile(`create index if not exists idx_galleries_slug on galleries\s*\(\s*slug\s*\)`)
	// The pre-existing composite index that does NOT satisfy a slug-only predicate.
	f025CompositeIndex = regexp.MustCompile(`idx_galleries_workspace_slug on galleries\s*\(\s*workspace_id\s*,\s*slug\s*\)`)
	// Any DDL statement that operates on (creates/drops/alters) the composite index. Used to
	// assert migration 128 does not touch it — prose comments mentioning the name are fine.
	f025CompositeDDL = regexp.MustCompile(`(create|drop|alter)\b[^;]*idx_galleries_workspace_slug`)
)

// TestF025_StandaloneSlugIndexExists asserts migration 128 adds a standalone partial index on
// galleries(slug) whose predicate matches GetBySlug (WHERE deleted_at IS NULL), so the public
// slug lookup can use an index scan instead of a sequential scan.
func TestF025_StandaloneSlugIndexExists(t *testing.T) {
	up128 := normalizeF025SQL(readF025Migration(t, "128_galleries_slug_index.up.sql"))

	assert.True(t, f025SlugIndex.MatchString(up128),
		"migration 128 must create a standalone index idx_galleries_slug ON galleries(slug)")

	assert.Contains(t, up128, "where deleted_at is null",
		"the slug index must be partial on deleted_at IS NULL to match the GetBySlug predicate exactly")
}

// TestF025_CompositeIndexUntouched documents that the pre-existing composite UNIQUE index from
// migration 012 still exists and that migration 128 does not drop or duplicate it. The composite
// index cannot serve a slug-only predicate (leading column workspace_id is absent), which is why
// the standalone index is required.
func TestF025_CompositeIndexUntouched(t *testing.T) {
	up012 := normalizeF025SQL(readF025Migration(t, "012_alter_galleries_m2.up.sql"))
	up128DDL := stripF025Comments(readF025Migration(t, "128_galleries_slug_index.up.sql"))

	assert.True(t, f025CompositeIndex.MatchString(up012),
		"migration 012 must still contain the composite UNIQUE idx_galleries_workspace_slug; committed migrations must not be edited")

	assert.False(t, f025CompositeDDL.MatchString(up128DDL),
		"migration 128 must not CREATE/DROP/ALTER the pre-existing composite index idx_galleries_workspace_slug")
}

// TestF025_DownMigrationDropsSlugIndex asserts the rollback is the exact inverse: it drops the
// standalone slug index by name and leaves the composite index alone.
func TestF025_DownMigrationDropsSlugIndex(t *testing.T) {
	down128DDL := stripF025Comments(readF025Migration(t, "128_galleries_slug_index.down.sql"))

	assert.Contains(t, down128DDL, "drop index if exists idx_galleries_slug",
		"down migration must drop the standalone idx_galleries_slug index")

	assert.False(t, f025CompositeDDL.MatchString(down128DDL),
		"down migration must not CREATE/DROP/ALTER the pre-existing composite index idx_galleries_workspace_slug")
}

// TestF025_MigrationFilesExist asserts both halves of the new migration pair exist and are
// non-empty, matching the TestMNN_MigrationFilesExist convention in this package.
func TestF025_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)
	for _, name := range []string{
		"128_galleries_slug_index.up.sql",
		"128_galleries_slug_index.down.sql",
	} {
		info, err := os.Stat(filepath.Join(dir, name))
		require.NoError(t, err, "migration file must exist: %s", name)
		assert.Greater(t, info.Size(), int64(0), "%s must not be empty", name)
	}
}
