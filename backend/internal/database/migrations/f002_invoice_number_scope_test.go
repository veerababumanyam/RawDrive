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

// Regression test for F-002:
//
//	invoices.invoice_number UNIQUE constraint must be workspace-scoped, not global.
//
// Invoice numbers are generated per-workspace as INV-{FY}-{SEQ:06d} where SEQ is a
// COUNT(*) of that workspace's invoices in the financial year (see invoice_repo.go).
// A GLOBAL UNIQUE (invoice_number) — as originally written in migration 022 — causes
// two different workspaces that each create their first invoice in the same FY to both
// compute SEQ=1, produce INV-2024-25-000001, and collide on the second INSERT, which
// surfaces a raw DB unique-violation verbatim to the user (invoice_handler.go).
//
// Migration 127 fixes this by dropping the global constraint and adding the
// workspace-scoped UNIQUE (workspace_id, invoice_number), mirroring migration 088's
// streaming_invoices_number_unique for the identical per-workspace numbering scheme.
//
// These are pure file-content contract assertions (no DB required), matching the
// pattern in m35/m39/m41 migration tests. They fail before migration 127 exists
// (when only the global 022 constraint is present) and pass after. The shared
// migrationDir(t) helper lives in admin_migrations_test.go.

const (
	f002ScopeUpFile   = "127_scope_invoice_number_unique.up.sql"
	f002ScopeDownFile = "127_scope_invoice_number_unique.down.sql"
)

// f002NormalizeSQL lowercases and collapses all runs of whitespace to a single space
// so constraint definitions match regardless of formatting/line-wrapping.
func f002NormalizeSQL(sql string) string {
	return regexp.MustCompile(`\s+`).ReplaceAllString(strings.ToLower(sql), " ")
}

// f002StripComments removes `--` line comments so the negative "must not contain a
// global UNIQUE" assertion targets executable SQL only. The migration's own prose
// quotes the old 022 constraint verbatim, which would otherwise trip the check.
func f002StripComments(sql string) string {
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

func f002ReadMigration(t *testing.T, name string) string {
	t.Helper()
	dir := migrationDir(t)
	b, err := os.ReadFile(filepath.Join(dir, name))
	require.NoError(t, err, "reading migration %s", name)
	return string(b)
}

var (
	f002GlobalConstraint = regexp.MustCompile(`unique\s*\(\s*invoice_number\s*\)`)
	f002ScopedConstraint = regexp.MustCompile(`unique\s*\(\s*workspace_id\s*,\s*invoice_number\s*\)`)
)

// TestF002_InvoiceNumberUniqueIsWorkspaceScoped asserts that, taking migrations 022
// and 127 together, the effective UNIQUE constraint on invoices.invoice_number is
// scoped by workspace_id and that the original global constraint has been dropped.
func TestF002_InvoiceNumberUniqueIsWorkspaceScoped(t *testing.T) {
	up022 := f002NormalizeSQL(f002ReadMigration(t, "022_create_m4_billing_tables.up.sql"))
	up127raw := f002ReadMigration(t, f002ScopeUpFile)
	up127 := f002NormalizeSQL(up127raw)
	up127exec := f002NormalizeSQL(f002StripComments(up127raw))

	// 022 historically (and still) declares the global constraint — committed
	// migrations are never edited; the fix is an append-only follow-up.
	assert.True(t, f002GlobalConstraint.MatchString(up022),
		"migration 022 must still contain the original global UNIQUE (invoice_number); committed migrations must not be edited")

	// 127 must DROP the global constraint by name.
	assert.Contains(t, up127, "drop constraint if exists invoices_number_unique",
		"migration 127 must drop the global constraint invoices_number_unique")

	// 127 must ADD a workspace-scoped UNIQUE (workspace_id, invoice_number).
	assert.True(t, f002ScopedConstraint.MatchString(up127),
		"migration 127 must add UNIQUE (workspace_id, invoice_number) so invoice numbers are unique per-workspace, not globally")

	// 127's executable SQL (comments stripped) must NOT re-introduce a global
	// UNIQUE (invoice_number). The prose comments legitimately quote the old 022
	// constraint, so they are excluded from this check.
	assert.False(t, f002GlobalConstraint.MatchString(up127exec),
		"migration 127 executable SQL must not re-create a global UNIQUE (invoice_number); that would reintroduce F-002")
}

// TestF002_DownMigrationRestoresGlobalConstraint asserts the rollback is the exact
// inverse: it drops the scoped constraint and restores the original global one, so the
// migration is reversible per repo SQL-migration rules.
func TestF002_DownMigrationRestoresGlobalConstraint(t *testing.T) {
	down127exec := f002NormalizeSQL(f002StripComments(f002ReadMigration(t, f002ScopeDownFile)))

	assert.Contains(t, down127exec, "drop constraint if exists invoices_workspace_number_unique",
		"down migration must drop the scoped constraint invoices_workspace_number_unique")

	assert.True(t, f002GlobalConstraint.MatchString(down127exec),
		"down migration must restore the original global UNIQUE (invoice_number)")
}

// TestF002_MatchesStreamingInvoicesPattern documents that migration 127 uses the same
// workspace-scoped uniqueness pattern already proven correct in migration 088 for the
// streaming_invoices table, which uses the identical per-workspace numbering scheme.
func TestF002_MatchesStreamingInvoicesPattern(t *testing.T) {
	up088 := f002NormalizeSQL(f002ReadMigration(t, "088_f014_recharge_invoices.up.sql"))
	up127 := f002NormalizeSQL(f002ReadMigration(t, f002ScopeUpFile))

	if !f002ScopedConstraint.MatchString(up088) {
		t.Skip("migration 088 no longer contains the reference UNIQUE (workspace_id, invoice_number) pattern; skipping cross-check")
	}
	assert.True(t, f002ScopedConstraint.MatchString(up127),
		"migration 127 should mirror migration 088's UNIQUE (workspace_id, invoice_number) scoping")
}

// TestF002_MigrationFilesExist asserts both halves of the new migration pair exist and
// are non-empty, matching the TestMNN_MigrationFilesExist convention in this package.
func TestF002_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)
	for _, name := range []string{f002ScopeUpFile, f002ScopeDownFile} {
		info, err := os.Stat(filepath.Join(dir, name))
		require.NoError(t, err, "migration file must exist: %s", name)
		assert.Greater(t, info.Size(), int64(0), "%s must not be empty", name)
	}
}
