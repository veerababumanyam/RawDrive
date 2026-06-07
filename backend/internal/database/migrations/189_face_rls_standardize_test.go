package migrations_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const m189Base = "189_face_rls_standardize"

// TestM189_MigrationFilesExist locks in the paired up/down migration files.
func TestM189_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)
	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, m189Base+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

// TestM189_StandardizesOnCurrentWorkspaceID asserts the up migration replaces the
// face_identity_contacts policy so it keys ONLY on app.current_workspace_id — the
// canonical variable for the face tables — and no longer carries the defensive
// app.workspace_id fallback from migration 180. Isolation intent is preserved:
// the bypass + workspace_id-match predicate is retained exactly.
func TestM189_StandardizesOnCurrentWorkspaceID(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m189Base+".up.sql"))
	require.NoError(t, err)
	content := string(body)
	normalized := strings.Join(strings.Fields(content), " ")

	// Replaces the existing policy in place (drop-then-create on the same name).
	assert.Contains(t, content, "DROP POLICY IF EXISTS face_identity_contacts_workspace_isolation ON face_identity_contacts")
	assert.Contains(t, content, "CREATE POLICY face_identity_contacts_workspace_isolation ON face_identity_contacts")

	// Isolation predicate is preserved exactly: bypass OR current_workspace_id match.
	assert.Contains(t, normalized, "current_setting('app.bypass_rls', true) = 'on'")
	assert.Contains(t, normalized, "workspace_id::text = current_setting('app.current_workspace_id', true)")

	// The defensive dual-variable fallback is GONE — no app.workspace_id predicate.
	assert.NotContains(t, content, "current_setting('app.workspace_id'",
		"the up migration must drop the app.workspace_id fallback (standardize on current_workspace_id)")
}

// TestM189_DownRestoresDualVariableCoverage asserts the down migration restores
// the migration-180 dual-variable defensive policy (matching EITHER
// app.current_workspace_id OR app.workspace_id), so the rollback is exact.
func TestM189_DownRestoresDualVariableCoverage(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m189Base+".down.sql"))
	require.NoError(t, err)
	content := string(body)
	normalized := strings.Join(strings.Fields(content), " ")

	assert.Contains(t, content, "DROP POLICY IF EXISTS face_identity_contacts_workspace_isolation ON face_identity_contacts")
	assert.Contains(t, content, "CREATE POLICY face_identity_contacts_workspace_isolation ON face_identity_contacts")

	// Both variables are present again — the transitional dual coverage from 180.
	assert.Contains(t, normalized, "workspace_id::text = current_setting('app.current_workspace_id', true)")
	assert.Contains(t, normalized, "workspace_id::text = current_setting('app.workspace_id', true)")
}
