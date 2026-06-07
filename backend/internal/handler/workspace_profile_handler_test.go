package handler

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

func TestWorkspaceProfileLogoMetadataForAsset_InvalidUUIDIsClientError(t *testing.T) {
	assetID, metadata, storageKey, err := (&WorkspaceProfileHandler{}).logoMetadataForAsset(
		context.Background(),
		uuid.New(),
		"not-a-uuid",
	)

	assert.Equal(t, uuid.Nil, assetID)
	assert.Nil(t, metadata)
	assert.Empty(t, storageKey)
	assert.True(t, errors.Is(err, errInvalidLogoAssetID), "invalid logo UUID must be mapped to a 400 response")
}

func TestWorkspaceProfileJSONBValue_EncodesLogoMetadataAsJSONText(t *testing.T) {
	assetID := uuid.New()
	value, err := workspaceProfileJSONBValue(map[string]interface{}{
		"asset_id":       assetID.String(),
		"filename":       "download.jfif",
		"content_type":   "image/jpeg",
		"size_bytes":     int64(8020),
		"storage_key":    "workspace/asset/original.jfif",
		"storage_driver": "s3",
	})

	assert.NoError(t, err)
	assert.NotEmpty(t, value)

	var decoded map[string]interface{}
	assert.NoError(t, json.Unmarshal([]byte(value), &decoded))
	assert.Equal(t, assetID.String(), decoded["asset_id"])
	assert.Equal(t, "download.jfif", decoded["filename"])
	assert.Equal(t, "image/jpeg", decoded["content_type"])
	assert.Equal(t, "s3", decoded["storage_driver"])
}

func TestGalleryBrandingDefaultsFromGalleryDefaults_NormalizesStudioBranding(t *testing.T) {
	defaults := galleryBrandingDefaultsFromGalleryDefaults(map[string]interface{}{
		"studio_branding": map[string]interface{}{
			"logo_placement":    "bottom-right",
			"monogram":          "asharavi",
			"watermark_style":   "tiled",
			"logo_size":         float64(120),
			"logo_opacity":      float64(92),
			"watermark_text":    "Asha Ravi Studio",
			"watermark_opacity": float64(8),
		},
	})

	assert.Equal(t, "bottom-right", defaults.LogoPlacement)
	assert.Equal(t, "ASHA", defaults.Monogram)
	assert.Equal(t, "tiled", defaults.WatermarkStyle)
	assert.Equal(t, 96, defaults.LogoSize)
	assert.Equal(t, 92, defaults.LogoOpacity)
	assert.Equal(t, "Asha Ravi Studio", defaults.WatermarkText)
	assert.Equal(t, 8, defaults.WatermarkOpacity)
}

func TestGalleryBrandingDefaultsFromGalleryDefaults_InvalidFallsBack(t *testing.T) {
	defaults := galleryBrandingDefaultsFromGalleryDefaults(map[string]interface{}{
		"studio_branding": map[string]interface{}{
			"logo_placement": "middle",
		},
	})

	assert.Equal(t, defaultGalleryBrandingDefaults, defaults)
}
