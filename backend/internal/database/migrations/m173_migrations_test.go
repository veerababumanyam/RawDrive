package migrations_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Migration 173 — the phone-reuse enforcement migration: drop the global
// byte-exact users_phone_key and add a partial UNIQUE index enforcing at most
// one 'free' account per normalized phone. Hermetic file-content contract test.

const m173Base = "173_users_phone_reuse_unique"

func TestM173_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)
	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, m173Base+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM173_Up_SwapsConstraintForPartialUniqueIndex(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m173Base+".up.sql"))
	require.NoError(t, err)
	content := string(body)
	normalized := normalizeWhitespace(content)

	assert.Contains(t, content, "BEGIN", "up must be transactional")
	assert.Contains(t, content, "COMMIT", "up must commit")

	// Fail-closed precondition: abort if any unresolved free/free collision
	// remains (the backfill must have auto-resolved them first).
	assert.Contains(t, content, "RAISE EXCEPTION",
		"up must fail closed when unresolved free collisions remain")
	assert.Contains(t, normalized, "phone_reuse_state = 'free' GROUP BY phone_normalized HAVING count(*) > 1",
		"up precheck must count free accounts grouped by normalized phone")

	// The byte-exact global constraint is dropped (idempotently).
	assert.Contains(t, content, "DROP CONSTRAINT IF EXISTS users_phone_key",
		"up must drop the legacy users_phone_key constraint")

	// The replacement: a PARTIAL UNIQUE index on normalized phone, scoped to the
	// free state, idempotent. The WHERE clause is load-bearing — without it the
	// rule would block legitimate paid second accounts.
	assert.Contains(t, normalized,
		"CREATE UNIQUE INDEX IF NOT EXISTS users_phone_normalized_free_unique ON users (phone_normalized) WHERE phone_normalized IS NOT NULL AND phone_reuse_state = 'free'",
		"up must create the partial unique index scoped to free accounts")

	// Must NOT be CONCURRENTLY (the migrator runs each file in a transaction;
	// CREATE INDEX CONCURRENTLY cannot run inside one).
	assert.NotContains(t, normalized, "CONCURRENTLY",
		"index must not be CONCURRENTLY (transactional migrator)")

	// SAFETY: no table create/drop, no column drop.
	stripped := stripSQLComments(content)
	assert.NotContains(t, stripped, "DROP TABLE", "173 up must NOT drop any table")
	assert.NotContains(t, stripped, "CREATE TABLE", "173 up must NOT create any table")
	assert.NotContains(t, stripped, "DROP COLUMN", "173 up must NOT drop any column")
}

func TestM173_Down_RestoresGlobalUnique(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m173Base+".down.sql"))
	require.NoError(t, err)
	content := string(body)
	normalized := normalizeWhitespace(content)

	assert.Contains(t, content, "DROP INDEX IF EXISTS users_phone_normalized_free_unique",
		"down must drop the partial unique index")
	assert.Contains(t, normalized, "ADD CONSTRAINT users_phone_key UNIQUE (phone)",
		"down must restore the original global unique constraint")
}
