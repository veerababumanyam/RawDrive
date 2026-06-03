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
