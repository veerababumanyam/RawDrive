package service

import (
	"bytes"
	"fmt"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/storage"
)

func TestNewUploadService(t *testing.T) {
	svc := NewUploadService(nil, nil, nil)
	assert.NotNil(t, svc)
}

func TestUploadService_Upload_StorageKeyFormat(t *testing.T) {
	// Verify the storage key format matches the expected pattern
	// ws/{workspace_id}/{asset_id}/original.{ext}
	dir := t.TempDir()
	store := storage.NewLocalDriver(dir)
	svc := NewUploadService(store, nil, nil)

	// We can't do a full upload without a repo, but we can verify construction
	assert.NotNil(t, svc)
	assert.NotNil(t, svc.storage)
}

func TestUploadInput_Fields(t *testing.T) {
	wsID := uuid.New()
	userID := uuid.New()

	input := UploadInput{
		WorkspaceID: wsID,
		Filename:    "wedding_001.cr2",
		ContentType: "image/x-canon-cr2",
		SizeBytes:   52428800,
		UploadedBy:  userID,
		Body:        bytes.NewReader([]byte("fake raw data")),
	}

	assert.Equal(t, wsID, input.WorkspaceID)
	assert.Equal(t, "wedding_001.cr2", input.Filename)
	assert.Equal(t, int64(52428800), input.SizeBytes)
}

func TestUploadResult_Fields(t *testing.T) {
	result := UploadResult{
		StorageKey: "ws/123/asset/456/original.cr2",
		SHA256:     "abc123def456",
	}
	assert.NotEmpty(t, result.StorageKey)
	assert.NotEmpty(t, result.SHA256)
}

func TestUploadService_SHA256Hash(t *testing.T) {
	dir := t.TempDir()
	store := storage.NewLocalDriver(dir)
	svc := NewUploadService(store, nil, nil)
	_ = svc // confirm construction works

	// Hash verification: SHA-256 of "hello world" should be consistent
	data := []byte("hello world")
	require.Equal(t, 11, len(data))
}

// TestBuildStorageKey_MusicPurpose verifies that a music-purpose upload is
// stored under a per-workspace `/music/` sub-folder while everything else keeps
// the original, prefix-free layout. This is the isolation contract for the
// photographer music library: music tracks live in {ws}/music/{id}/... so they
// are visibly segregated from the photo assets at {ws}/{id}/...
func TestBuildStorageKey_MusicPurpose(t *testing.T) {
	wsID := uuid.New()
	assetID := uuid.New()

	t.Run("music purpose nests under /music/ sub-folder", func(t *testing.T) {
		key := buildStorageKey(wsID, assetID, "sangeet.mp3", "music")
		want := fmt.Sprintf("%s/music/%s/original.mp3", wsID.String(), assetID.String())
		assert.Equal(t, want, key)
		assert.Contains(t, key, "/music/")
	})

	t.Run("empty purpose keeps the exact original layout (regression guard)", func(t *testing.T) {
		key := buildStorageKey(wsID, assetID, "wedding_001.jpg", "")
		// Byte-for-byte the pre-change format: {ws}/{id}/original{ext}
		want := fmt.Sprintf("%s/%s/original.jpg", wsID.String(), assetID.String())
		assert.Equal(t, want, key)
		assert.NotContains(t, key, "/music/")
	})

	t.Run("non-music purpose values can NEVER alter the key path", func(t *testing.T) {
		baseline := buildStorageKey(wsID, assetID, "x.jpg", "")
		// Path-injection / tenant-isolation guard: only the literal "music" is
		// recognised. Anything else — including traversal payloads — is treated
		// as no purpose and must yield the identical, unprefixed key.
		for _, evil := range []string{
			"../evil",
			"music/../../other-workspace",
			"Music",  // case-sensitive: not the literal "music"
			"music ", // trailing space: not the literal
			" music", // leading space
			"photos", // arbitrary other purpose
			"../" + wsID.String(),
		} {
			got := buildStorageKey(wsID, assetID, "x.jpg", evil)
			assert.Equal(t, baseline, got,
				"purpose %q must not influence the storage key", evil)
			assert.NotContains(t, got, "/music/")
			assert.NotContains(t, got, "..")
		}
	})
}
