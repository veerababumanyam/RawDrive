package migrations_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestM150_AssetsStorageDriverMigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)

	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, "150_assets_storage_driver_s3"+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM150_UpConvergesR2MetadataToS3(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, "150_assets_storage_driver_s3.up.sql"))
	require.NoError(t, err)
	content := strings.ToLower(string(body))

	assert.Contains(t, content, "alter column storage_driver set default 's3'")
	assert.Contains(t, content, "where storage_driver = 'r2'")
	assert.Contains(t, content, "set storage_driver = 's3'")
}
