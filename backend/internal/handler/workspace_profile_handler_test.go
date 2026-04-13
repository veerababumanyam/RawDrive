package handler

import (
	"context"
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
