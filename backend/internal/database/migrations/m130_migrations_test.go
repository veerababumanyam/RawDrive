package migrations_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Migration 130 — F-001 plaintext-password backfill (audit 2026-05-30).
// File-content contract tests, mirroring the M96 / M35 patterns in this dir.
// Numbered 130 because this branch already uses 124–129 and 123 is reserved
// for the sibling security/audit-fixes-2026-05-30 RLS migration.

func TestM130_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)

	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, "130_f001_backfill_plaintext_password_reset"+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM130_UpLocksOnlyNonBcryptHashesAndRevokesFirst(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, "130_f001_backfill_plaintext_password_reset.up.sql"))
	require.NoError(t, err)
	content := string(body)

	// Every bcrypt variant + argon2 must be excluded so real hashes are never
	// touched — only pre-fix plaintext values are locked.
	for _, prefix := range []string{"$2a$", "$2b$", "$2y$", "$argon2"} {
		assert.Contains(t, content, prefix,
			"up must exclude %s-prefixed hashes from the lock predicate", prefix)
	}

	// Refresh sessions must be revoked BEFORE the hash is overwritten, otherwise
	// the predicate no longer matches the affected users.
	revokePos := strings.Index(content, "refresh_sessions")
	lockPos := strings.Index(content, "!F001-LOCKED-REQUIRES-RESET")
	require.NotEqual(t, -1, revokePos, "up must revoke refresh_sessions for affected users")
	require.NotEqual(t, -1, lockPos, "up must overwrite plaintext with the lock sentinel")
	assert.Less(t, revokePos, lockPos, "refresh-session revoke must precede the hash overwrite")

	// Locked accounts must be forced through a password reset.
	assert.Contains(t, content, "must_change_password = TRUE",
		"locked accounts must be flagged for a forced password reset")
}

func TestM130_DownIsIntentionalNoop(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, "130_f001_backfill_plaintext_password_reset.down.sql"))
	require.NoError(t, err)
	content := string(body)

	// Irreversible by design — the down must NOT attempt to mutate users (it
	// can neither restore plaintext nor safely clear must_change_password).
	assert.NotContains(t, content, "UPDATE users",
		"down must not mutate users — the backfill is intentionally irreversible")
}
