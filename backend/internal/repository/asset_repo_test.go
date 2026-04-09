package repository

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

// ──────────────────────── Constructor ────────────────────────

func TestNewAssetRepo(t *testing.T) {
	repo := NewAssetRepo(nil)
	assert.NotNil(t, repo)
	assert.Nil(t, repo.pool)
}

// ──────────────────────── Asset Model ────────────────────────

func TestAsset_Defaults(t *testing.T) {
	a := Asset{}
	assert.Equal(t, uuid.Nil, a.ID)
	assert.Empty(t, a.Filename)
	assert.Empty(t, a.ContentType)
	assert.Equal(t, int64(0), a.SizeBytes)
	assert.Empty(t, a.Status)
}

func TestAsset_AllFieldsSet(t *testing.T) {
	wsID := uuid.New()
	userID := uuid.New()
	now := time.Now()
	width := 6000
	height := 4000
	blurhash := "LEHV6nWB2yk8pyo0adR*.7kCMdnj"

	a := Asset{
		ID:            uuid.New(),
		WorkspaceID:   wsID,
		Filename:      "wedding_001.cr2",
		ContentType:   "image/x-canon-cr2",
		SizeBytes:     52428800, // 50MB
		StorageKey:    "ws/abc/assets/wedding_001.cr2",
		StorageDriver: "local",
		Width:         &width,
		Height:        &height,
		Blurhash:      &blurhash,
		ExifData:      map[string]interface{}{"camera": "Canon EOS R5"},
		ThumbnailURLs: map[string]string{"small": "/thumb/200.webp"},
		UploadedBy:    &userID,
		Status:        "ready",
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	assert.NotEqual(t, uuid.Nil, a.ID)
	assert.Equal(t, wsID, a.WorkspaceID)
	assert.Equal(t, "wedding_001.cr2", a.Filename)
	assert.Equal(t, int64(52428800), a.SizeBytes)
	assert.Equal(t, "ready", a.Status)
	assert.Equal(t, "local", a.StorageDriver)
	assert.Equal(t, 6000, *a.Width)
	assert.Equal(t, &blurhash, a.Blurhash)
}

// ──────────────────────── AssetFilter ────────────────────────

func TestAssetFilter_Defaults(t *testing.T) {
	var f AssetFilter
	assert.Equal(t, uuid.Nil, f.WorkspaceID)
	assert.Empty(t, f.ContentType)
	assert.Empty(t, f.Status)
	assert.Equal(t, 0, f.Limit)
}

func TestAssetFilter_AllFieldsSet(t *testing.T) {
	wsID := uuid.New()
	f := AssetFilter{
		WorkspaceID: wsID,
		ContentType: "image",
		Status:      "ready",
		Limit:       25,
		Offset:      0,
	}
	assert.Equal(t, wsID, f.WorkspaceID)
	assert.Equal(t, "image", f.ContentType)
	assert.Equal(t, "ready", f.Status)
}
