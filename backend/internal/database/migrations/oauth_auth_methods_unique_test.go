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

func normalizeOAuthAuthMethodsSQL(sql string) string {
	return regexp.MustCompile(`\s+`).ReplaceAllString(strings.ToLower(sql), " ")
}

func TestOAuthAuthMethodsUniqueMigration(t *testing.T) {
	dir := migrationDir(t)
	up, err := os.ReadFile(filepath.Join(dir, "133_user_auth_methods_unique.up.sql"))
	require.NoError(t, err)
	normalized := normalizeOAuthAuthMethodsSQL(string(up))

	assert.Contains(t, normalized, "unique index if not exists idx_user_auth_methods_provider_subject")
	assert.Contains(t, normalized, "on user_auth_methods (provider, provider_subject)")
	assert.Contains(t, normalized, "unique index if not exists idx_user_auth_methods_user_provider")
	assert.Contains(t, normalized, "on user_auth_methods (user_id, provider)")
	assert.Contains(t, normalized, "google_oauth_state_key")
	assert.Contains(t, normalized, "is_secret, description")
}

func TestOAuthAuthMethodsUniqueDownMigration(t *testing.T) {
	dir := migrationDir(t)
	down, err := os.ReadFile(filepath.Join(dir, "133_user_auth_methods_unique.down.sql"))
	require.NoError(t, err)
	normalized := normalizeOAuthAuthMethodsSQL(string(down))

	assert.Contains(t, normalized, "drop index if exists idx_user_auth_methods_user_provider")
	assert.Contains(t, normalized, "drop index if exists idx_user_auth_methods_provider_subject")
	assert.Contains(t, normalized, "google_oauth_state_key")
}
