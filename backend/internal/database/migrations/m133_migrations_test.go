package migrations_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Migration 133 — user_auth_methods uniqueness (S1-G2 / AREA-AUTH-3).
// File-content contract tests, mirroring the M130 pattern in this directory.
// 133 is the next free slot (current max committed is 132).

func TestM133_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)

	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, "133_user_auth_methods_unique"+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM133_UpAddsBothUniqueConstraintsAfterDedup(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, "133_user_auth_methods_unique.up.sql"))
	require.NoError(t, err)
	content := string(body)

	// Both required uniqueness guarantees must be present.
	assert.Contains(t, content, "UNIQUE (provider, provider_subject)",
		"up must enforce one Google subject -> one local account")
	assert.Contains(t, content, "UNIQUE (user_id, provider)",
		"up must enforce at most one identity per provider per account")

	// De-dup must precede the constraint add, otherwise ADD CONSTRAINT fails on a
	// dirty table.
	dedupPos := strings.Index(content, "DELETE FROM user_auth_methods")
	constraintPos := strings.Index(content, "ADD CONSTRAINT")
	require.NotEqual(t, -1, dedupPos, "up must de-duplicate existing rows first")
	require.NotEqual(t, -1, constraintPos, "up must add the unique constraints")
	assert.Less(t, dedupPos, constraintPos,
		"de-duplication must run before the unique constraints are added")
}

func TestM133_DownDropsBothConstraints(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, "133_user_auth_methods_unique.down.sql"))
	require.NoError(t, err)
	content := string(body)

	assert.Contains(t, content, "DROP CONSTRAINT IF EXISTS user_auth_methods_provider_subject_unique")
	assert.Contains(t, content, "DROP CONSTRAINT IF EXISTS user_auth_methods_user_provider_unique")

	// The down must not attempt to resurrect the collapsed duplicate rows.
	assert.NotContains(t, content, "INSERT INTO user_auth_methods",
		"down must not reconstruct de-duplicated rows — the collapse is irreversible")
}
