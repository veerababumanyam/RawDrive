package migrations_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const m179Base = "179_face_identity_aliases"

func TestM179_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)
	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, m179Base+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM179_AddsFaceIdentityAliases(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m179Base+".up.sql"))
	require.NoError(t, err)
	normalized := strings.Join(strings.Fields(string(body)), " ")

	assert.Contains(t, normalized, "CREATE TABLE IF NOT EXISTS face_identity_aliases")
	assert.Contains(t, normalized, "CONSTRAINT face_identity_aliases_workspace_alias_unique UNIQUE (workspace_id, alias_label)")
	assert.Contains(t, normalized, "ALTER TABLE face_identity_aliases ENABLE ROW LEVEL SECURITY")
	assert.Contains(t, normalized, "CREATE INDEX IF NOT EXISTS idx_face_identity_aliases_canonical")
}

func TestM179_DownDropsFaceIdentityAliases(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m179Base+".down.sql"))
	require.NoError(t, err)
	content := string(body)

	assert.Contains(t, content, "DROP INDEX IF EXISTS idx_face_identity_aliases_canonical")
	assert.Contains(t, content, "DROP TABLE IF EXISTS face_identity_aliases")
}
