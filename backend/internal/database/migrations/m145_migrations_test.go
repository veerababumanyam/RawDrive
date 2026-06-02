package migrations_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestM145_TermsVersionEffectiveActiveGuard(t *testing.T) {
	dir := migrationDir(t)
	up, err := os.ReadFile(filepath.Join(dir, "145_terms_versions_active_effective_unique.up.sql"))
	require.NoError(t, err)
	content := string(up)

	assert.Contains(t, content, "idx_terms_versions_active_lookup")
	assert.Contains(t, content, "enforce_single_effective_terms_version")
	assert.Contains(t, content, "NEW.effective_at <= now()")
	assert.Contains(t, content, "version <> NEW.version")
	assert.NotContains(t, strings.ToUpper(content), "CREATE UNIQUE INDEX",
		"future-dated terms must be stageable while the current version remains active")

	down, err := os.ReadFile(filepath.Join(dir, "145_terms_versions_active_effective_unique.down.sql"))
	require.NoError(t, err)
	rollback := string(down)
	assert.Contains(t, rollback, "DROP TRIGGER IF EXISTS trg_enforce_single_effective_terms_version")
	assert.Contains(t, rollback, "DROP FUNCTION IF EXISTS enforce_single_effective_terms_version")
	assert.Contains(t, rollback, "idx_terms_versions_active")
}
