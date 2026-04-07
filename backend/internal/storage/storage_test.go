package storage_test

import (
	"bytes"
	"context"
	"io"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/storage"
)

func TestProviderInterfaceCompliance(t *testing.T) {
	var _ storage.Provider = (*storage.LocalDriver)(nil)
	var _ storage.Provider = (*storage.S3Driver)(nil)
}

func TestLocalDriver_PutAndGet(t *testing.T) {
	dir := t.TempDir()
	driver := storage.NewLocalDriver(dir)
	ctx := context.Background()

	data := []byte("hello world")
	err := driver.Put(ctx, "test/file.txt", bytes.NewReader(data), int64(len(data)), "text/plain")
	require.NoError(t, err)

	written, err := os.ReadFile(filepath.Join(dir, "test", "file.txt"))
	require.NoError(t, err)
	assert.Equal(t, data, written)

	reader, err := driver.Get(ctx, "test/file.txt")
	require.NoError(t, err)
	defer reader.Close()
	got, err := io.ReadAll(reader)
	require.NoError(t, err)
	assert.Equal(t, data, got)
}

func TestLocalDriver_GetNotFound(t *testing.T) {
	driver := storage.NewLocalDriver(t.TempDir())
	_, err := driver.Get(context.Background(), "nonexistent.txt")
	assert.Error(t, err)
}

func TestLocalDriver_Delete(t *testing.T) {
	dir := t.TempDir()
	driver := storage.NewLocalDriver(dir)
	ctx := context.Background()

	data := []byte("to delete")
	require.NoError(t, driver.Put(ctx, "del.txt", bytes.NewReader(data), int64(len(data)), "text/plain"))
	require.NoError(t, driver.Delete(ctx, "del.txt"))

	_, err := os.Stat(filepath.Join(dir, "del.txt"))
	assert.True(t, os.IsNotExist(err))
}

func TestLocalDriver_PresignURL(t *testing.T) {
	dir := t.TempDir()
	driver := storage.NewLocalDriver(dir)
	ctx := context.Background()

	data := []byte("presign")
	require.NoError(t, driver.Put(ctx, "p.txt", bytes.NewReader(data), int64(len(data)), "text/plain"))
	url, err := driver.PresignURL(ctx, "p.txt", storage.PresignOptions{ExpiresInSeconds: 3600})
	require.NoError(t, err)
	assert.NotEmpty(t, url)
}

func TestNewProvider_Local(t *testing.T) {
	cfg := storage.Config{Driver: "local", LocalDir: t.TempDir()}
	p, err := storage.NewProvider(cfg)
	require.NoError(t, err)
	_, ok := p.(*storage.LocalDriver)
	assert.True(t, ok)
}

func TestNewProvider_S3(t *testing.T) {
	cfg := storage.Config{
		Driver: "s3", Bucket: "b", Region: "r", AccessKey: "a", SecretKey: "s",
	}
	p, err := storage.NewProvider(cfg)
	require.NoError(t, err)
	_, ok := p.(*storage.S3Driver)
	assert.True(t, ok)
}

func TestNewProvider_UnknownDriver(t *testing.T) {
	_, err := storage.NewProvider(storage.Config{Driver: "azure"})
	assert.Error(t, err)
}

func TestHealthCheck_LocalDriver(t *testing.T) {
	driver := storage.NewLocalDriver(t.TempDir())
	status := driver.HealthCheck()
	assert.Equal(t, "ok", status.Status)
	assert.Equal(t, "local", status.Driver)
}
