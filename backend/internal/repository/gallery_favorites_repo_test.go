package repository

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

// Mirrors proofing_repo_test.go in shape — unit tests for the struct
// shape and constructor only. Integration coverage against a live
// Postgres comes from the broader m41_migrations_test.go pattern + the
// frontend behavior tests; no test container is wired into this repo
// today, so query semantics are validated end-to-end via the API.

func TestNewGalleryFavoritesRepo(t *testing.T) {
	repo := NewGalleryFavoritesRepo(nil)
	assert.NotNil(t, repo)
	assert.Nil(t, repo.pool)
}

func TestGalleryFavorite_Defaults(t *testing.T) {
	fav := GalleryFavorite{}
	assert.Equal(t, uuid.Nil, fav.ID)
	assert.Equal(t, uuid.Nil, fav.GalleryID)
	assert.Equal(t, uuid.Nil, fav.AssetID)
	assert.Empty(t, fav.GuestSessionID)
	assert.True(t, fav.CreatedAt.IsZero())
}

func TestGalleryFavorite_AllFieldsSet(t *testing.T) {
	galleryID := uuid.New()
	assetID := uuid.New()
	now := time.Now().UTC()
	sessionID := "guest-" + uuid.New().String()

	fav := GalleryFavorite{
		ID:             uuid.New(),
		GalleryID:      galleryID,
		AssetID:        assetID,
		GuestSessionID: sessionID,
		CreatedAt:      now,
	}

	assert.NotEqual(t, uuid.Nil, fav.ID)
	assert.Equal(t, galleryID, fav.GalleryID)
	assert.Equal(t, assetID, fav.AssetID)
	assert.Equal(t, sessionID, fav.GuestSessionID)
	assert.Equal(t, now, fav.CreatedAt)
}

func TestGalleryFavoritesSummary_Defaults(t *testing.T) {
	s := GalleryFavoritesSummary{}
	assert.Equal(t, uuid.Nil, s.GalleryID)
	assert.Equal(t, 0, s.TotalFavorites)
	assert.Equal(t, 0, s.UniqueAssetsCount)
	assert.Equal(t, 0, s.UniqueSessions)
	assert.Nil(t, s.ByAsset)
}

func TestGalleryFavoritesSummary_PopulatedShape(t *testing.T) {
	galleryID := uuid.New()
	a1 := uuid.New()
	a2 := uuid.New()
	s := GalleryFavoritesSummary{
		GalleryID:         galleryID,
		TotalFavorites:    7,
		UniqueAssetsCount: 2,
		UniqueSessions:    3,
		ByAsset: []GalleryFavoriteByAsset{
			{AssetID: a1, Count: 5},
			{AssetID: a2, Count: 2},
		},
	}

	assert.Equal(t, galleryID, s.GalleryID)
	assert.Equal(t, 7, s.TotalFavorites)
	assert.Equal(t, 2, s.UniqueAssetsCount)
	assert.Equal(t, 3, s.UniqueSessions)
	assert.Len(t, s.ByAsset, 2)
	assert.Equal(t, a1, s.ByAsset[0].AssetID)
	assert.Equal(t, 5, s.ByAsset[0].Count)
	assert.Equal(t, a2, s.ByAsset[1].AssetID)
	assert.Equal(t, 2, s.ByAsset[1].Count)
}
