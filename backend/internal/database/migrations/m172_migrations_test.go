package migrations_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Migration 172 — users.phone_reuse_state + users.paid_phone_verified_at
// (slice 2 of the phone-reuse epic). Additive + idempotent + reversible: it adds
// two columns (state defaults to 'free' for every existing row) and a CHECK +
// lookup index, and changes NO uniqueness behavior (users_phone_key stays until
// 173). The authoritative state values are written by
// cmd/backfill-phone-reuse-state, not in SQL.
//
// Hermetic file-content contract test (mirrors m167/m171; shared helpers
// migrationDir/stripSQLComments + normalizeWhitespace are reused from the package).

const m172Base = "172_users_phone_reuse_state"

func TestM172_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)
	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, m172Base+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM172_Up_AddsStateColumnsAndCheck(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m172Base+".up.sql"))
	require.NoError(t, err)
	content := string(body)
	normalized := normalizeWhitespace(content)

	assert.Contains(t, content, "BEGIN", "up must be wrapped in a transaction")
	assert.Contains(t, content, "COMMIT", "up must commit the transaction")

	// State column: NOT NULL DEFAULT 'free' so every existing row is valid the
	// moment the column lands.
	assert.Contains(t, normalized,
		"ADD COLUMN IF NOT EXISTS phone_reuse_state VARCHAR(20) NOT NULL DEFAULT 'free'",
		"up must add phone_reuse_state NOT NULL DEFAULT 'free' (idempotent)")
	assert.Contains(t, normalized,
		"ADD COLUMN IF NOT EXISTS paid_phone_verified_at TIMESTAMPTZ",
		"up must add the paid_phone_verified_at timestamp (idempotent)")

	// CHECK must pin exactly the four valid states, and be added idempotently
	// (drop-if-exists then add) so re-running is safe.
	assert.Contains(t, normalized,
		"CHECK (phone_reuse_state IN ('free', 'paid_pending', 'paid_active', 'paid_expired'))",
		"up must constrain phone_reuse_state to the four valid states")
	assert.Contains(t, content, "DROP CONSTRAINT IF EXISTS users_phone_reuse_state_check",
		"CHECK must be added idempotently (drop-if-exists first)")

	assert.Contains(t, normalized,
		"CREATE INDEX IF NOT EXISTS idx_users_phone_reuse_state ON users (phone_reuse_state)",
		"up must create the state lookup index")

	// SAFETY: additive only — does not touch users_phone_key or any other table.
	stripped := stripSQLComments(content)
	assert.NotContains(t, stripped, "DROP TABLE", "172 up must NOT drop any table")
	assert.NotContains(t, stripped, "CREATE TABLE", "172 up must NOT create any table")
	assert.NotContains(t, stripped, "DROP COLUMN", "172 up must NOT drop any column")
	assert.NotContains(t, stripped, "users_phone_key", "172 must NOT touch users_phone_key (that is migration 173)")
	assert.NotContains(t, normalizeWhitespace(stripped), "CREATE UNIQUE INDEX",
		"172 must NOT create a UNIQUE index — uniqueness is migration 173")
}

func TestM172_Down_DropsCheckColumnsAndIndex(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m172Base+".down.sql"))
	require.NoError(t, err)
	content := string(body)
	normalized := normalizeWhitespace(content)

	assert.Contains(t, content, "DROP INDEX IF EXISTS idx_users_phone_reuse_state",
		"down must drop the state index")
	assert.Contains(t, content, "DROP CONSTRAINT IF EXISTS users_phone_reuse_state_check",
		"down must drop the CHECK constraint")
	assert.Contains(t, normalized, "DROP COLUMN IF EXISTS paid_phone_verified_at",
		"down must drop paid_phone_verified_at")
	assert.Contains(t, normalized, "DROP COLUMN IF EXISTS phone_reuse_state",
		"down must drop phone_reuse_state")

	stripped := stripSQLComments(content)
	assert.NotContains(t, stripped, "DROP TABLE", "172 down must NOT drop any table")
}
