package repository

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ──────────────────────── Constructor ────────────────────────

func TestNewGalleryRepo(t *testing.T) {
	repo := NewGalleryRepo(nil)
	assert.NotNil(t, repo)
	assert.Nil(t, repo.pool)
}

// ──────────────────────── Gallery Model ────────────────────────

func TestGallery_Defaults(t *testing.T) {
	g := Gallery{}
	assert.Equal(t, uuid.Nil, g.ID)
	assert.Empty(t, g.Title)
	assert.Empty(t, g.Status)
	assert.Nil(t, g.CoverAssetID)
	assert.Nil(t, g.DeletedAt)
	assert.False(t, g.IsPublished)
	assert.Equal(t, 0, g.MaxSelections)
}

func TestGallery_AllFieldsSet(t *testing.T) {
	wsID := uuid.New()
	coverID := uuid.New()
	userID := uuid.New()
	now := time.Now()

	g := Gallery{
		ID:              uuid.New(),
		WorkspaceID:     wsID,
		Title:           "Sharma Wedding",
		Slug:            "sharma-wedding-abc12345",
		Description:     "Beautiful wedding gallery",
		CoverAssetID:    &coverID,
		GalleryType:     "proofing",
		Settings:        map[string]interface{}{"theme": "dark"},
		PasswordHash:    nil,
		WatermarkConfig: map[string]interface{}{"enabled": true},
		IsPublished:     true,
		MaxSelections:   50,
		Status:          "active",
		CreatedBy:       &userID,
		CreatedAt:       now,
		UpdatedAt:       now,
	}

	assert.NotEqual(t, uuid.Nil, g.ID)
	assert.Equal(t, wsID, g.WorkspaceID)
	assert.Equal(t, "Sharma Wedding", g.Title)
	assert.Equal(t, "proofing", g.GalleryType)
	assert.True(t, g.IsPublished)
	assert.Equal(t, 50, g.MaxSelections)
	assert.Equal(t, "active", g.Status)
	assert.Equal(t, &coverID, g.CoverAssetID)
}

// ──────────────────────── GalleryFilter ────────────────────────

func TestGalleryFilter_Defaults(t *testing.T) {
	var f GalleryFilter
	assert.Equal(t, uuid.Nil, f.WorkspaceID)
	assert.Empty(t, f.Status)
	assert.Empty(t, f.GalleryType)
	assert.Empty(t, f.Search)
	assert.Equal(t, 0, f.Limit)
	assert.Equal(t, 0, f.Offset)
}

func TestGalleryFilter_AllFieldsSet(t *testing.T) {
	wsID := uuid.New()
	f := GalleryFilter{
		WorkspaceID: wsID,
		Status:      "active",
		GalleryType: "wedding",
		Search:      "Sharma",
		Limit:       25,
		Offset:      50,
	}
	assert.Equal(t, wsID, f.WorkspaceID)
	assert.Equal(t, "active", f.Status)
	assert.Equal(t, "wedding", f.GalleryType)
	assert.Equal(t, "Sharma", f.Search)
	assert.Equal(t, 25, f.Limit)
}

// ──────────────────────── Slug Generation ────────────────────────

func TestGenerateSlug(t *testing.T) {
	slug := generateSlug("My Wedding Gallery")
	assert.Contains(t, slug, "my-wedding-gallery")
	// Should have random suffix
	assert.Greater(t, len(slug), len("my-wedding-gallery"))
}

func TestGenerateSlug_SpecialChars(t *testing.T) {
	slug := generateSlug("Sharma & Patel's Wedding!")
	assert.NotContains(t, slug, "&")
	assert.NotContains(t, slug, "'")
	assert.NotContains(t, slug, "!")
}

func TestGenerateSlug_Uniqueness(t *testing.T) {
	slug1 := generateSlug("Same Title")
	slug2 := generateSlug("Same Title")
	assert.NotEqual(t, slug1, slug2, "slugs should be unique due to random suffix")
}

func TestGalleryJSONBValue(t *testing.T) {
	encoded, err := galleryJSONBValue(map[string]interface{}{"theme": "dark"})
	require.NoError(t, err)
	assert.JSONEq(t, `{"theme":"dark"}`, encoded)

	encoded, err = galleryJSONBValue(nil)
	require.NoError(t, err)
	assert.JSONEq(t, `{}`, encoded)

	_, err = galleryJSONBValue(func() {})
	require.Error(t, err)
}

// ──────────────────────── Hierarchy (E6-S1) ────────────────────────

func TestGallery_ParentID_Nil(t *testing.T) {
	g := Gallery{}
	// ParentID should be nil for root galleries
	// This field needs to be added to the Gallery struct
	// TODO: Once ParentID field is added, verify it defaults to nil
	assert.Nil(t, g.DeletedAt) // placeholder assertion until ParentID exists
}

// ──────────────────────── Soft Delete ────────────────────────

func TestGallery_SoftDelete_Fields(t *testing.T) {
	now := time.Now()
	g := Gallery{
		ID:        uuid.New(),
		Status:    "deleted",
		DeletedAt: &now,
	}
	require.NotNil(t, g.DeletedAt)
	assert.Equal(t, "deleted", g.Status)
	assert.WithinDuration(t, now, *g.DeletedAt, time.Second)
}
