package repository

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

func TestNewAlbumRepo(t *testing.T) {
	repo := NewAlbumRepo(nil)
	assert.NotNil(t, repo)
	assert.Nil(t, repo.pool)
}

func TestAlbum_Defaults(t *testing.T) {
	a := Album{}
	assert.Equal(t, uuid.Nil, a.ID)
	assert.Empty(t, a.Name)
	assert.Nil(t, a.ParentID)
	assert.Nil(t, a.CoverAssetID)
	assert.Equal(t, 0, a.Position)
	assert.Equal(t, 0, a.AssetCount)
}

func TestAlbum_AllFieldsSet(t *testing.T) {
	galleryID := uuid.New()
	parentID := uuid.New()
	coverID := uuid.New()
	now := time.Now()

	a := Album{
		ID:           uuid.New(),
		GalleryID:    galleryID,
		ParentID:     &parentID,
		Name:         "Ceremony",
		Description:  "Wedding ceremony shots",
		CoverAssetID: &coverID,
		Position:     1,
		SmartFilter:  map[string]interface{}{"type": "image"},
		AssetCount:   42,
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	assert.NotEqual(t, uuid.Nil, a.ID)
	assert.Equal(t, galleryID, a.GalleryID)
	assert.Equal(t, &parentID, a.ParentID)
	assert.Equal(t, "Ceremony", a.Name)
	assert.Equal(t, "Wedding ceremony shots", a.Description)
	assert.Equal(t, &coverID, a.CoverAssetID)
	assert.Equal(t, 1, a.Position)
	assert.Equal(t, map[string]interface{}{"type": "image"}, a.SmartFilter)
	assert.Equal(t, 42, a.AssetCount)
	assert.Equal(t, now, a.CreatedAt)
	assert.Equal(t, now, a.UpdatedAt)
}

func TestAlbumAsset_Fields(t *testing.T) {
	aa := AlbumAsset{
		AlbumID:  uuid.New(),
		AssetID:  uuid.New(),
		Position: 3,
		AddedAt:  time.Now(),
	}
	assert.NotEqual(t, uuid.Nil, aa.AlbumID)
	assert.NotEqual(t, uuid.Nil, aa.AssetID)
	assert.Equal(t, 3, aa.Position)
	assert.False(t, aa.AddedAt.IsZero())
}
