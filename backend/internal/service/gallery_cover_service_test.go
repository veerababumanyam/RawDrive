package service

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNewGalleryCoverService(t *testing.T) {
	svc := NewGalleryCoverService(nil, nil)
	assert.NotNil(t, svc)
}

// TODO: Add tests for SetAutoCover, GenerateCoverThumbnails, OnAssetDeleted
// These require storage and gallery repo mocks which will be added in GREEN phase
