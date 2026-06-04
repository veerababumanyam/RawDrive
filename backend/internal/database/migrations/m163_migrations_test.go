package migrations_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestM163_PhotographerProfilesSchema(t *testing.T) {
	dir := migrationDir(t)
	content, err := os.ReadFile(filepath.Join(dir, "163_photographer_profiles.up.sql"))
	require.NoError(t, err)
	sql := string(content)

	for _, want := range []string{
		"CREATE TABLE IF NOT EXISTS photographer_profiles",
		"photographer_id UUID NOT NULL REFERENCES users(id)",
		"workspace_id UUID NOT NULL REFERENCES workspaces(id)",
		"last_name VARCHAR(100)",
		"featured_galleries UUID[]",
		"visibility_config JSONB",
		`"show_profile_photo": true`,
		`"show_custom_links": true`,
		"CREATE UNIQUE INDEX IF NOT EXISTS idx_photographer_profiles_slug_unique",
		"CREATE INDEX IF NOT EXISTS idx_photographer_profiles_public_slug",
		"CREATE INDEX IF NOT EXISTS idx_photographer_profiles_featured_galleries",
		"CREATE TABLE IF NOT EXISTS photographer_profile_view_events",
	} {
		assert.Contains(t, sql, want, "163 up must contain %q", want)
	}
}

func TestM163_PhotographerProfilesDown(t *testing.T) {
	dir := migrationDir(t)
	content, err := os.ReadFile(filepath.Join(dir, "163_photographer_profiles.down.sql"))
	require.NoError(t, err)
	sql := string(content)

	for _, want := range []string{
		"DROP TABLE IF EXISTS photographer_profile_view_events",
		"DROP INDEX IF EXISTS idx_photographer_profiles_slug_unique",
		"DROP TABLE IF EXISTS photographer_profiles",
	} {
		assert.Contains(t, sql, want, "163 down must contain %q", want)
	}
}
