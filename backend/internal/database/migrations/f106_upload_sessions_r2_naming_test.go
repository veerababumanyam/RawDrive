package migrations_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Regression test for F-106 (audit, low / cosmetic).
//
// Finding: migration 066 created upload_sessions with two columns whose names
// (r2_multipart_upload_id, r2_part_etags) refer to the retired Cloudflare R2
// backend. The audit confirmed this is PURE METADATA with no functional effect
// — storage routes through the `s3` driver to Backblaze B2 — and the
// recommendation is an OPTIONAL cleanup.
//
// Why this is NOT remediated with a column rename: the literal column names are
// hardcoded in queries across non-migration code owned by other agents
// (backend/internal/repository/upload_sessions_repo.go INSERT/SELECT/UPDATE,
// backend/internal/worker/upload_session_cleanup_worker.go,
// backend/internal/handler/chunked_upload.go and their tests). A standalone
// schema migration that renamed the columns would break every one of those
// queries on a fresh database, turning a cosmetic finding into a real outage.
// A safe rename must be a single coordinated multi-file change, which is outside
// this file's ownership.
//
// The chosen, scope-safe remediation: a clarifying comment in the owned 066
// migration that documents the legacy naming and the current B2/s3 reality,
// which removes the onboarding/audit confusion that is the finding's entire
// stated impact.
//
// These are pure file-content assertions (no DB), matching the f002 / f025 /
// f033 / f065 / m34 / m35 patterns in this package. The shared migrationDir(t)
// helper lives in admin_migrations_test.go.

func readF106Migration(t *testing.T, name string) string {
	t.Helper()
	dir := migrationDir(t)
	b, err := os.ReadFile(filepath.Join(dir, name))
	require.NoError(t, err, "reading migration %s", name)
	return string(b)
}

// TestF106_066DocumentsLegacyR2Naming asserts the owned 066 migration carries
// the F-106 clarification linking the legacy r2_* naming to the current
// Backblaze B2 / s3-driver reality. This is the actual cosmetic remediation.
func TestF106_066DocumentsLegacyR2Naming(t *testing.T) {
	sql := readF106Migration(t, "066_upload_sessions.up.sql")
	lower := strings.ToLower(sql)

	assert.Contains(t, sql, "F-106",
		"066 must reference the finding ID so the naming clarification is traceable")
	assert.Contains(t, lower, "backblaze b2",
		"066 must document that storage routes to Backblaze B2 (not R2)")
	assert.Contains(t, lower, "s3-compatible",
		"066 must document that B2 is reached via its S3-compatible API")
	assert.Contains(t, lower, "no functional effect",
		"066 must state the r2_* prefix is cosmetic with no functional effect")
}

// TestF106_066KeepsR2ColumnsForCrossFileQueries pins the deliberate decision NOT
// to rename the columns: the queries in the (separately owned) repository,
// worker, and handler reference these exact names, so 066 must keep defining
// them. If a future change renames them here without updating that Go code, this
// guard fails and flags the break before it reaches a fresh DB.
func TestF106_066KeepsR2ColumnsForCrossFileQueries(t *testing.T) {
	sql := readF106Migration(t, "066_upload_sessions.up.sql")

	for _, col := range []string{"r2_multipart_upload_id", "r2_part_etags"} {
		assert.Contains(t, sql, col,
			"066 must keep column %q: it is hardcoded in upload_sessions_repo.go / "+
				"upload_session_cleanup_worker.go / chunked_upload.go queries; renaming it "+
				"in a standalone migration would break those queries on a fresh DB (F-106)", col)
	}
}

// TestF106_NoStandaloneRenameMigration guards against a future standalone rename
// migration reintroducing the break: no migration may RENAME these columns to
// s3_* unless the cross-file Go queries are updated in the same change. Because a
// migration cannot carry that Go change, any such standalone rename is rejected
// here. (A coordinated multi-file fix can delete this guard with intent.)
func TestF106_NoStandaloneRenameMigration(t *testing.T) {
	dir := migrationDir(t)
	entries, err := os.ReadDir(dir)
	require.NoError(t, err)

	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || !strings.HasSuffix(name, ".up.sql") {
			continue
		}
		body, err := os.ReadFile(filepath.Join(dir, name))
		require.NoError(t, err, "reading %s", name)
		lower := strings.ToLower(string(body))

		assert.NotContains(t, lower, "rename column r2_multipart_upload_id",
			"%s renames r2_multipart_upload_id; the repo/worker/handler queries still use the "+
				"old name and would break on a fresh DB — do the rename as a coordinated "+
				"multi-file change, not a standalone migration (F-106)", name)
		assert.NotContains(t, lower, "rename column r2_part_etags",
			"%s renames r2_part_etags; the repo/worker/handler queries still use the old name "+
				"and would break on a fresh DB — do the rename as a coordinated multi-file "+
				"change, not a standalone migration (F-106)", name)
	}
}
