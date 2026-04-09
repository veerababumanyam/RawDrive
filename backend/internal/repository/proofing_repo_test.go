package repository

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

// ──────────────────────── Constructor ────────────────────────

func TestNewProofingRepo(t *testing.T) {
	repo := NewProofingRepo(nil)
	assert.NotNil(t, repo)
	assert.Nil(t, repo.pool)
}

// ──────────────────────── ProofingSelection Model ────────────────────────

func TestProofingSelection_Defaults(t *testing.T) {
	ps := ProofingSelection{}
	assert.Equal(t, uuid.Nil, ps.ID)
	assert.Empty(t, ps.ClientName)
	assert.Empty(t, ps.ClientEmail)
	assert.Empty(t, ps.Status)
	assert.Empty(t, ps.Note)
}

func TestProofingSelection_AllFieldsSet(t *testing.T) {
	galleryID := uuid.New()
	assetID := uuid.New()
	now := time.Now()

	ps := ProofingSelection{
		ID:          uuid.New(),
		GalleryID:   galleryID,
		AssetID:     assetID,
		ClientName:  "Priya Mehta",
		ClientEmail: "priya@example.com",
		Status:      "selected",
		Note:        "Love this shot!",
		CreatedAt:   now,
	}

	assert.NotEqual(t, uuid.Nil, ps.ID)
	assert.Equal(t, galleryID, ps.GalleryID)
	assert.Equal(t, assetID, ps.AssetID)
	assert.Equal(t, "Priya Mehta", ps.ClientName)
	assert.Equal(t, "priya@example.com", ps.ClientEmail)
	assert.Equal(t, "selected", ps.Status)
	assert.Equal(t, "Love this shot!", ps.Note)
}

// ──────────────────────── Status Values ────────────────────────

func TestProofingSelection_StatusValues(t *testing.T) {
	validStatuses := []string{"selected", "rejected", "pending"}
	for _, status := range validStatuses {
		ps := ProofingSelection{Status: status}
		assert.NotEmpty(t, ps.Status)
	}
}
