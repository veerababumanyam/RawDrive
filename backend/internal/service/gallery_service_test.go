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

// ──────────────────────── Gallery State Machine (ISS-016) ────────────────────────

func TestCanTransitionGallery(t *testing.T) {
	tests := []struct {
		name     string
		from     GalleryState
		to       GalleryState
		expected bool
	}{
		{"draft to shared", GalleryDraft, GalleryShared, true},
		{"draft to protected", GalleryDraft, GalleryProtected, true},
		{"draft to archived", GalleryDraft, GalleryArchived, true},
		{"draft to deleted", GalleryDraft, GalleryDeleted, true},
		{"shared to draft", GalleryShared, GalleryDraft, true},
		{"shared to expired", GalleryShared, GalleryExpired, true},
		{"shared to archived", GalleryShared, GalleryArchived, true},
		{"expired to shared (re-publish)", GalleryExpired, GalleryShared, true},
		{"expired to archived", GalleryExpired, GalleryArchived, true},
		{"archived to draft (restore)", GalleryArchived, GalleryDraft, true},
		{"archived to deleted", GalleryArchived, GalleryDeleted, true},
		{"deleted to draft (restore)", GalleryDeleted, GalleryDraft, true},
		// Invalid transitions
		{"expired to draft (not allowed)", GalleryExpired, GalleryDraft, false},
		{"deleted to shared (not allowed)", GalleryDeleted, GalleryShared, false},
		{"deleted to archived (not allowed)", GalleryDeleted, GalleryArchived, false},
		{"archived to shared (not allowed)", GalleryArchived, GalleryShared, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.expected, CanTransitionGallery(tt.from, tt.to))
		})
	}
}

func TestGalleryState_Constants(t *testing.T) {
	assert.Equal(t, GalleryState("draft"), GalleryDraft)
	assert.Equal(t, GalleryState("shared"), GalleryShared)
	assert.Equal(t, GalleryState("expired"), GalleryExpired)
	assert.Equal(t, GalleryState("protected"), GalleryProtected)
	assert.Equal(t, GalleryState("archived"), GalleryArchived)
	assert.Equal(t, GalleryState("deleted"), GalleryDeleted)
}
