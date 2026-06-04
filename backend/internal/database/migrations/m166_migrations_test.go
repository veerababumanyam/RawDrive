package migrations_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const m166Base = "166_photographer_business_logo"

func TestM166_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)
	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, m166Base+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM166_UpAddsPublicBusinessLogoColumns(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m166Base+".up.sql"))
	require.NoError(t, err)
	sql := strings.ToLower(string(body))

	assert.Contains(t, sql, "alter table photographer_profiles", "up must alter the profiles table")
	for _, col := range []string{
		"business_logo_url",
		"business_logo_rendered_url",
		"business_logo_position",
		"business_logo_uploaded_at",
	} {
		assert.Contains(t, sql, col, "up must add %q", col)
	}
	assert.Contains(t, sql, "add column", "up must add columns additively")
	assert.NotContains(t, sql, "drop table", "up must not drop tables")
}

func TestM166_DownDropsTheColumns(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m166Base+".down.sql"))
	require.NoError(t, err)
	sql := strings.ToLower(string(body))

	assert.Contains(t, sql, "drop column", "down must drop the added columns")
	for _, col := range []string{
		"business_logo_url",
		"business_logo_rendered_url",
		"business_logo_position",
		"business_logo_uploaded_at",
	} {
		assert.Contains(t, sql, col, "down must drop %q", col)
	}
	assert.NotContains(t, sql, "drop table", "down must not drop the table")
}
