package service

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

func TestNewGalleryService(t *testing.T) {
	svc := NewGalleryService(nil, nil, nil)
	assert.NotNil(t, svc)
}

func TestCreateGalleryInput_Fields(t *testing.T) {
	wsID := uuid.New()
	userID := uuid.New()

	input := CreateGalleryInput{
		WorkspaceID: wsID,
		Title:       "Sharma Wedding",
		Description: "A beautiful ceremony",
		GalleryType: "proofing",
		CreatedBy:   userID,
	}

	assert.Equal(t, wsID, input.WorkspaceID)
	assert.Equal(t, "Sharma Wedding", input.Title)
	assert.Equal(t, "proofing", input.GalleryType)
	assert.Equal(t, userID, input.CreatedBy)
}

func TestCreateGalleryInput_GalleryTypes(t *testing.T) {
	validTypes := []string{"proofing", "delivery", "portfolio", "album"}
	for _, gt := range validTypes {
		input := CreateGalleryInput{GalleryType: gt}
		assert.NotEmpty(t, input.GalleryType)
	}
}
