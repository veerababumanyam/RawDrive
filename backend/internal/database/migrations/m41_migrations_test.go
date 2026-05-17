package migrations_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// M41 Round 1 — foundation migrations for the Upload Credit Top-up feature:
//
//   102_upload_packages_and_rate_cards — catalogue + pricing for add-credits flow
//
// Mirrors the M40 file-content contract pattern: tests read the .up.sql and
// .down.sql files from disk and assert the required SQL substrings are present.
// No DB required. The shared migrationDir() helper lives in
// admin_migrations_test.go.

type m41Migration struct {
	Number          string
	Description     string
	UpMustContain   []string
	DownMustContain []string
}

var m41Migrations = []m41Migration{
	{
		Number:      "102",
		Description: "upload_packages + upload_rate_cards (catalogue + pricing)",
		UpMustContain: []string{
			// Packages table — canonical list of credit bundles (starter/pro/studio).
			"CREATE TABLE IF NOT EXISTS upload_packages",
			"code",
			"credits",
			"display_name",
			"active",
			// Rate cards — paise-denominated price per package, effective-dated
			// so price changes are appendable rather than destructive.
			"CREATE TABLE IF NOT EXISTS upload_rate_cards",
			"package_code",
			"price_paise",
			"effective_from",
			"effective_to",
			// Seed rows — starter/pro/studio per PRD §D1. Credits are the
			// contract; paise prices are the current snapshot.
			"INSERT INTO upload_packages",
			"'starter'",
			"'pro'",
			"'studio'",
			"INSERT INTO upload_rate_cards",
			// Unique constraints — one code per package, only one active rate
			// card per package at a time (enforced via partial unique index
			// or WHERE effective_to IS NULL).
			"UNIQUE",
		},
		DownMustContain: []string{
			// Drop order: rate_cards (child) before packages (parent) to avoid
			// FK violations if the parent link is enforced.
			"DROP TABLE IF EXISTS upload_rate_cards",
			"DROP TABLE IF EXISTS upload_packages",
		},
	},
}

func TestM41_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)
	for _, m := range m41Migrations {
		upPath := filepath.Join(dir, m.Number+"_upload_packages_and_rate_cards.up.sql")
		downPath := filepath.Join(dir, m.Number+"_upload_packages_and_rate_cards.down.sql")
		t.Run(m.Number+"_up", func(t *testing.T) {
			info, err := os.Stat(upPath)
			require.NoError(t, err, "migration %s up.sql must exist at %s", m.Number, upPath)
			assert.Greater(t, info.Size(), int64(0), "%s up must not be empty", m.Number)
		})
		t.Run(m.Number+"_down", func(t *testing.T) {
			info, err := os.Stat(downPath)
			require.NoError(t, err, "migration %s down.sql must exist at %s", m.Number, downPath)
			assert.Greater(t, info.Size(), int64(0), "%s down must not be empty", m.Number)
		})
	}
}

func TestM41_102_PackagesAndRateCards_Schema(t *testing.T) {
	dir := migrationDir(t)
	content, err := os.ReadFile(filepath.Join(dir, "102_upload_packages_and_rate_cards.up.sql"))
	require.NoError(t, err)
	sql := string(content)

	for _, substr := range m41Migrations[0].UpMustContain {
		assert.Contains(t, sql, substr,
			"102 up must contain %q (M41 catalogue + pricing for upload credits)", substr)
	}
	// Idempotent replay — required so re-running migrations during dev is safe.
	assert.Contains(t, strings.ToUpper(sql), "IF NOT EXISTS",
		"102 up must use IF NOT EXISTS for idempotent replay")
	// ON CONFLICT on seed inserts so applying twice is a no-op.
	assert.Contains(t, strings.ToUpper(sql), "ON CONFLICT",
		"102 up seed INSERTs must use ON CONFLICT so replay is safe")
}

func TestM41_102_PackagesAndRateCards_Down(t *testing.T) {
	dir := migrationDir(t)
	content, err := os.ReadFile(filepath.Join(dir, "102_upload_packages_and_rate_cards.down.sql"))
	require.NoError(t, err)
	sql := string(content)

	for _, substr := range m41Migrations[0].DownMustContain {
		assert.Contains(t, sql, substr, "102 down must contain %q", substr)
	}

	// Drop order — rate_cards must appear before packages in the file so the
	// child table is dropped before the parent it references.
	ratesIdx := strings.Index(sql, "DROP TABLE IF EXISTS upload_rate_cards")
	pkgsIdx := strings.Index(sql, "DROP TABLE IF EXISTS upload_packages")
	require.GreaterOrEqual(t, ratesIdx, 0, "102 down must DROP upload_rate_cards")
	require.GreaterOrEqual(t, pkgsIdx, 0, "102 down must DROP upload_packages")
	assert.Less(t, ratesIdx, pkgsIdx,
		"102 down must drop rate_cards BEFORE packages (child before parent)")
}

// TestM41_103_ThumbnailURLBackfill — content-contract test for the data
// backfill that strips the absolute production-host prefix from
// assets.thumbnail_urls. Locks the predicate so a future widener cannot
// accidentally clobber legitimate CDN URLs, and locks the no-op down so
// the broken-<img> bug cannot be re-introduced via a rollback.
func TestM41_103_ThumbnailURLBackfill(t *testing.T) {
	dir := migrationDir(t)
	upPath := filepath.Join(dir, "103_asset_thumbnail_urls_strip_host.up.sql")
	downPath := filepath.Join(dir, "103_asset_thumbnail_urls_strip_host.down.sql")

	upInfo, err := os.Stat(upPath)
	require.NoError(t, err, "103 up.sql must exist at %s", upPath)
	assert.Greater(t, upInfo.Size(), int64(0), "103 up must not be empty")

	downInfo, err := os.Stat(downPath)
	require.NoError(t, err, "103 down.sql must exist at %s", downPath)
	assert.Greater(t, downInfo.Size(), int64(0), "103 down must not be empty")

	upBytes, err := os.ReadFile(upPath)
	require.NoError(t, err)
	up := string(upBytes)
	for _, substr := range []string{
		"UPDATE assets",
		"thumbnail_urls",
		"regexp_replace",
		"https://api\\.rawdrive\\.in/storage/", // literal prefix (escaped dot for regex)
		"api.rawdrive.in/storage/",             // unescaped form lives in the WHERE LIKE
	} {
		assert.Contains(t, up, substr,
			"103 up must contain %q so the targeted backfill is unambiguous", substr)
	}

	downBytes, err := os.ReadFile(downPath)
	require.NoError(t, err)
	down := string(downBytes)
	// The down is intentionally a no-op. Asserting absence of UPDATE/INSERT
	// here locks the choice — re-baking the production host would
	// reintroduce the broken-<img> bug.
	assert.NotContains(t, strings.ToUpper(down), "UPDATE ASSETS",
		"103 down must be a no-op — reinstating the absolute URL prefix would re-introduce broken <img> renders")
	assert.NotContains(t, strings.ToUpper(down), "INSERT INTO",
		"103 down must be a no-op")
}

// TestM41_104_WebPThumbnailsToPublicPath — content-contract test for the
// JSONB rewrite that moves WebP thumbnail keys from `derivatives/` (auth-
// required) to `thumbnails/` (public path). Locks both the scope of the
// rewrite (only the three thumb sizes) and the exclusion of display_webp
// (which is full-res and intentionally stays auth-gated).
func TestM41_104_WebPThumbnailsToPublicPath(t *testing.T) {
	dir := migrationDir(t)
	upPath := filepath.Join(dir, "104_webp_thumbnails_to_public_path.up.sql")
	downPath := filepath.Join(dir, "104_webp_thumbnails_to_public_path.down.sql")

	upInfo, err := os.Stat(upPath)
	require.NoError(t, err, "104 up.sql must exist at %s", upPath)
	assert.Greater(t, upInfo.Size(), int64(0), "104 up must not be empty")

	downInfo, err := os.Stat(downPath)
	require.NoError(t, err, "104 down.sql must exist at %s", downPath)
	assert.Greater(t, downInfo.Size(), int64(0), "104 down must not be empty")

	upBytes, err := os.ReadFile(upPath)
	require.NoError(t, err)
	up := string(upBytes)

	// The rewrite must cover the three thumbnail-sized WebP variants and
	// no others. Editing this list also requires updating
	// service.isWebPThumbnailVariant (and probably the storage proxy's
	// public-prefix guard); the test exists to catch divergence.
	for _, substr := range []string{
		"UPDATE assets",
		"thumbnail_urls",
		"regexp_replace",
		"derivatives/",
		"thumbnails/",
		"thumb_(sm|md|lg)_webp",
	} {
		assert.Contains(t, up, substr,
			"104 up must contain %q so the targeted WebP rewrite is unambiguous", substr)
	}

	// CRITICAL: display_webp must NOT appear in any executable SQL — it
	// intentionally stays under derivatives/. The migration's prose
	// comments DO mention display_webp (to document the exclusion), so we
	// strip SQL comments before the substring check. A future migration
	// widening this rewrite to cover display_webp would silently move a
	// full-res asset onto the public storage path; this guard rejects
	// that change.
	upSQL := stripSQLComments(up)
	assert.NotContains(t, upSQL, "display_webp",
		"104 up SQL (comments stripped) must not rewrite display_webp keys — full-res variant intentionally stays auth-gated")

	downBytes, err := os.ReadFile(downPath)
	require.NoError(t, err)
	down := string(downBytes)
	// Down is the symmetric inverse so rollback composes with a worker revert.
	for _, substr := range []string{"UPDATE assets", "thumbnails/", "derivatives/", "thumb_(sm|md|lg)_webp"} {
		assert.Contains(t, down, substr, "104 down must mirror the up rewrite shape")
	}
	assert.NotContains(t, stripSQLComments(down), "display_webp",
		"104 down SQL (comments stripped) must also leave display_webp keys alone")
}

// stripSQLComments removes `--` line comments from a SQL blob so assertions
// can target executable SQL only. Documentation prose in comment blocks
// often legitimately mentions identifiers the SQL itself avoids; this
// helper lets the test distinguish "appears in a comment" from "appears
// in a regexp_replace target". Simple line-by-line strip is sufficient
// for our migrations — none use block comments or string literals that
// span `--`.
func stripSQLComments(sql string) string {
	lines := strings.Split(sql, "\n")
	out := make([]string, 0, len(lines))
	for _, line := range lines {
		if idx := strings.Index(line, "--"); idx >= 0 {
			line = line[:idx]
		}
		out = append(out, line)
	}
	return strings.Join(out, "\n")
}
