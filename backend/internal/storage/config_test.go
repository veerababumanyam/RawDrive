package storage_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/storage"
)

func TestConfigValidate_LocalValid(t *testing.T) {
	cfg := storage.Config{Driver: "local", LocalDir: "/tmp/storage"}
	assert.NoError(t, cfg.Validate())
}

func TestConfigValidate_S3Valid(t *testing.T) {
	cfg := storage.Config{
		Driver: "s3", Bucket: "b", Region: "r", AccessKey: "a", SecretKey: "s",
	}
	assert.NoError(t, cfg.Validate())
}

func TestConfigValidate_EmptyDriver(t *testing.T) {
	err := storage.Config{}.Validate()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "driver")
}

func TestConfigValidate_InvalidDriver(t *testing.T) {
	err := storage.Config{Driver: "gcs"}.Validate()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "driver")
}

func TestConfigValidate_LocalMissingDir(t *testing.T) {
	err := storage.Config{Driver: "local"}.Validate()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "local_dir")
}

func TestConfigValidate_S3MissingBucket(t *testing.T) {
	err := storage.Config{Driver: "s3", Region: "r", AccessKey: "a", SecretKey: "s"}.Validate()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "bucket")
}

func TestConfigValidate_S3MissingRegion(t *testing.T) {
	err := storage.Config{Driver: "s3", Bucket: "b", AccessKey: "a", SecretKey: "s"}.Validate()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "region")
}

func TestConfigValidate_S3MissingAccessKey(t *testing.T) {
	err := storage.Config{Driver: "s3", Bucket: "b", Region: "r", SecretKey: "s"}.Validate()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "access_key")
}

func TestConfigValidate_S3MissingSecretKey(t *testing.T) {
	err := storage.Config{Driver: "s3", Bucket: "b", Region: "r", AccessKey: "a"}.Validate()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "secret_key")
}
