package migrations_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const m185Base = "185_gallery_media_keys"

func TestM185_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)
	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, m185Base+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM185_AddsGalleryMediaKeysEncryptedRegistry(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m185Base+".up.sql"))
	require.NoError(t, err)
	content := string(body)

	assert.Contains(t, content, "CREATE TABLE IF NOT EXISTS gallery_media_keys")
	assert.Contains(t, content, "gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE")
	assert.Contains(t, content, "key_id TEXT NOT NULL")
	assert.Contains(t, content, "encrypted_key BYTEA")
	assert.Contains(t, content, "dek_wrapped BYTEA")
	assert.Contains(t, content, "CONSTRAINT gallery_media_keys_unique_key UNIQUE (gallery_id, key_id)")
	assert.Contains(t, content, "gallery_media_keys_secret_present")
}

func TestM185_DownDropsGalleryMediaKeys(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, m185Base+".down.sql"))
	require.NoError(t, err)
	assert.Contains(t, string(body), "DROP TABLE IF EXISTS gallery_media_keys")
}
