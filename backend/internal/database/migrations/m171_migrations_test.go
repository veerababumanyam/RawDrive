package migrations_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Migration 171 — users.phone_normalized, the canonical phone identity column
// (slice 1 of the phone-reuse epic). Additive + idempotent + reversible: it adds
// one nullable column and one partial lookup index, and changes NO uniqueness
// behavior (users_phone_key stays until migration 173). Historical rows are
// backfilled in Go by cmd/backfill-phone-reuse-state, not in SQL, so there is
// no SQL/Go normalization drift.
//
// Hermetic file-content contract test (mirrors the m167 pattern in this dir —
// shared helpers migrationDir / stripSQLComments live in admin_migrations_test.go;
// normalizeWhitespace lives in m167_migrations_test.go — same package, reused).
//
// Numbered 171: 170 is the current max committed on origin/main; 171 is the next
// free number (verified against origin/main).

const m171Base = "171_users_phone_normalized"

func TestM171_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)
	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, m171Base+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM171_Up_AddsPhoneNormalizedColumnAndLookupIndex(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m171Base+".up.sql"))
	require.NoError(t, err)
	content := string(body)
	normalized := normalizeWhitespace(content)

	// Transactional so column + index apply atomically.
	assert.Contains(t, content, "BEGIN", "up must be wrapped in a transaction")
	assert.Contains(t, content, "COMMIT", "up must commit the transaction")

	// The nullable canonical-identity column, added idempotently.
	assert.Contains(t, normalized,
		"ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_normalized VARCHAR(20)",
		"up must add the nullable phone_normalized VARCHAR(20) column (idempotent)")

	// Must NOT be NOT NULL — legacy rows are NULL until the Go backfill runs.
	stripped := stripSQLComments(content)
	assert.NotContains(t, normalizeWhitespace(stripped), "phone_normalized VARCHAR(20) NOT NULL",
		"phone_normalized must be nullable (legacy rows backfilled later in Go)")

	// Partial lookup index on the active values — NOT a uniqueness constraint
	// (that is migration 173). Asserting WHERE ... IS NOT NULL guards against
	// someone making it UNIQUE here by accident.
	assert.Contains(t, normalized,
		"CREATE INDEX IF NOT EXISTS idx_users_phone_normalized ON users (phone_normalized) WHERE phone_normalized IS NOT NULL",
		"up must create the non-unique partial lookup index")
	assert.NotContains(t, normalizeWhitespace(stripped), "CREATE UNIQUE INDEX",
		"171 must NOT create a UNIQUE index — uniqueness is enforced in migration 173")

	// SAFETY: additive only — never drops/creates a table, never drops a column,
	// never touches the existing users_phone_key constraint.
	assert.NotContains(t, stripped, "DROP TABLE", "171 up must NOT drop any table")
	assert.NotContains(t, stripped, "CREATE TABLE", "171 up must NOT create any table")
	assert.NotContains(t, stripped, "DROP COLUMN", "171 up must NOT drop any column")
	assert.NotContains(t, stripped, "users_phone_key", "171 must NOT touch users_phone_key (that is migration 173)")
}

func TestM171_Down_DropsIndexAndColumn(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m171Base+".down.sql"))
	require.NoError(t, err)
	content := string(body)
	normalized := normalizeWhitespace(content)

	assert.Contains(t, content, "DROP INDEX IF EXISTS idx_users_phone_normalized",
		"down must drop the lookup index (idempotent IF EXISTS)")
	assert.Contains(t, normalized, "ALTER TABLE users DROP COLUMN IF EXISTS phone_normalized",
		"down must drop the phone_normalized column (idempotent IF EXISTS)")

	// SAFETY: down must not touch any other table or the raw phone column.
	stripped := stripSQLComments(content)
	assert.NotContains(t, stripped, "DROP TABLE", "171 down must NOT drop any table")
	assert.NotContains(t, normalizeWhitespace(stripped), "DROP COLUMN IF EXISTS phone\n",
		"171 down must NOT drop the raw phone column")
}
