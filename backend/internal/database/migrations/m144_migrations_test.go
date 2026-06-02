package migrations_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Migration 144 — photographer Terms-of-Service / copyright acceptance capture.
// File-content contract tests, mirroring the M133 pattern in this directory.
// 144 is the next free slot (current max committed is 143).

func TestM144_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)

	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, "144_user_terms_acceptance"+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM144_UpCreatesTablesColumnsAndImmutability(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, "144_user_terms_acceptance.up.sql"))
	require.NoError(t, err)
	content := string(body)

	// Both tables.
	assert.Contains(t, content, "CREATE TABLE IF NOT EXISTS terms_versions",
		"up must create the terms_versions catalog")
	assert.Contains(t, content, "CREATE TABLE IF NOT EXISTS user_terms_acceptances",
		"up must create the acceptance ledger")

	// Append-only immutability rules mirror audit_logs (migration 034).
	assert.Contains(t, content, "user_terms_acceptances_no_update")
	assert.Contains(t, content, "user_terms_acceptances_no_delete")
	assert.Contains(t, content, "DO INSTEAD NOTHING")

	// Audit columns required for IT Act §10A / DPDP evidence.
	for _, col := range []string{"version_hash", "ip_address", "user_agent", "acceptance_method", "accepted_at", "legal_basis"} {
		assert.Contains(t, content, col, "ledger must capture audit column %q", col)
	}

	// user_id must NOT cascade/FK to users — proof survives account deletion
	// (mirrors audit_logs.actor_id). Guard against a future regression that
	// adds a cascading FK and silently purges acceptance proof.
	assert.NotContains(t, content, "user_id           UUID NOT NULL REFERENCES users",
		"user_id must not carry an FK to users — acceptance proof is retained after deletion")

	// Denormalized fast-path columns on users.
	assert.Contains(t, content, "terms_accepted_version")
	assert.Contains(t, content, "terms_accepted_at")

	// Seed the initial active version, with an in-DB computed hash.
	assert.Contains(t, content, "tos-privacy/2026-04", "up must seed an initial active version")
	assert.Contains(t, content, "digest(", "seed hash must be computed in-DB via pgcrypto")
}

func TestM144_DownDropsEverything(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, "144_user_terms_acceptance.down.sql"))
	require.NoError(t, err)
	content := string(body)

	assert.Contains(t, content, "DROP TABLE IF EXISTS user_terms_acceptances")
	assert.Contains(t, content, "DROP TABLE IF EXISTS terms_versions")
	assert.Contains(t, content, "DROP COLUMN IF EXISTS terms_accepted_version")
	assert.Contains(t, content, "DROP COLUMN IF EXISTS terms_accepted_at")

	// Down must drop tables AFTER dropping the dependent rules, and must not
	// reference the rules on a table it already dropped.
	rulePos := strings.Index(content, "DROP RULE IF EXISTS user_terms_acceptances_no_update")
	tablePos := strings.Index(content, "DROP TABLE IF EXISTS user_terms_acceptances")
	require.NotEqual(t, -1, rulePos)
	require.NotEqual(t, -1, tablePos)
	assert.Less(t, rulePos, tablePos, "rules must be dropped before the table")
}
