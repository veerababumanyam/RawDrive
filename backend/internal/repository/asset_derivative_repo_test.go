package repository

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

func TestNewAssetDerivativeRepo(t *testing.T) {
	repo := NewAssetDerivativeRepo(nil)
	assert.NotNil(t, repo)
	assert.Nil(t, repo.pool)
}

func TestAssetDerivative_Defaults(t *testing.T) {
	d := AssetDerivative{}
	assert.Equal(t, uuid.Nil, d.ID)
	assert.Empty(t, d.Variant)
	assert.Empty(t, d.StorageKey)
	assert.Equal(t, int64(0), d.SizeBytes)
}

func TestAssetDerivative_AllFieldsSet(t *testing.T) {
	assetID := uuid.New()
	now := time.Now()

	d := AssetDerivative{
		ID:         uuid.New(),
		AssetID:    assetID,
		Variant:    "cover_1920",
		StorageKey: "derivatives/abc/cover_1920.jpg",
		Width:      1920,
		Height:     1080,
		SizeBytes:  245000,
		Format:     "jpeg",
		CreatedAt:  now,
	}

	assert.NotEqual(t, uuid.Nil, d.ID)
	assert.Equal(t, assetID, d.AssetID)
	assert.Equal(t, "cover_1920", d.Variant)
	assert.Equal(t, "derivatives/abc/cover_1920.jpg", d.StorageKey)
	assert.Equal(t, 1920, d.Width)
	assert.Equal(t, 1080, d.Height)
	assert.Equal(t, int64(245000), d.SizeBytes)
	assert.Equal(t, "jpeg", d.Format)
	assert.Equal(t, now, d.CreatedAt)
}

func TestAssetDerivative_Variants(t *testing.T) {
	validVariants := []string{"thumb_sm", "thumb_md", "thumb_lg", "cover_1920", "cover_1280", "cover_640", "og_image", "watermark"}
	for _, v := range validVariants {
		d := AssetDerivative{Variant: v}
		assert.NotEmpty(t, d.Variant)
	}
}
