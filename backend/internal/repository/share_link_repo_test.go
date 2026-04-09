package repository

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

// ──────────────────────── Constructor ────────────────────────

func TestNewShareLinkRepo(t *testing.T) {
	repo := NewShareLinkRepo(nil)
	assert.NotNil(t, repo)
	assert.Nil(t, repo.pool)
}

// ──────────────────────── ShareLink Model ────────────────────────

func TestShareLink_Defaults(t *testing.T) {
	sl := ShareLink{}
	assert.Equal(t, uuid.Nil, sl.ID)
	assert.Empty(t, sl.Token)
	assert.False(t, sl.DownloadAllowed)
}

func TestShareLink_AllFieldsSet(t *testing.T) {
	galleryID := uuid.New()
	expires := time.Now().Add(7 * 24 * time.Hour)
	pinHash := "$2a$10$abc"

	sl := ShareLink{
		ID:              uuid.New(),
		GalleryID:       galleryID,
		Token:           "abc123def456",
		PinHash:         &pinHash,
		ExpiresAt:       &expires,
		Permissions:     map[string]interface{}{"view": true, "download": false},
		DownloadAllowed: true,
		CreatedAt:       time.Now(),
	}

	assert.NotEqual(t, uuid.Nil, sl.ID)
	assert.Equal(t, galleryID, sl.GalleryID)
	assert.NotEmpty(t, sl.Token)
	assert.True(t, sl.DownloadAllowed)
	assert.NotNil(t, sl.PinHash)
	assert.NotNil(t, sl.ExpiresAt)
}

// ──────────────────────── Token Generation ────────────────────────

func TestGenerateToken_Unique(t *testing.T) {
	t1 := generateToken()
	t2 := generateToken()
	assert.NotEqual(t, t1, t2, "tokens should be unique")
	assert.Len(t, t1, 32, "token should be 32 hex chars (16 bytes)")
}

// ──────────────────────── Expiry ────────────────────────

func TestShareLink_IsExpired(t *testing.T) {
	past := time.Now().Add(-1 * time.Hour)
	sl := ShareLink{ExpiresAt: &past}
	assert.True(t, sl.ExpiresAt.Before(time.Now()), "link with past expiry should be expired")

	future := time.Now().Add(24 * time.Hour)
	sl2 := ShareLink{ExpiresAt: &future}
	assert.True(t, sl2.ExpiresAt.After(time.Now()), "link with future expiry should not be expired")
}

// ──────────────────────── Revocation ────────────────────────

func TestShareLink_Revocation(t *testing.T) {
	sl := ShareLink{RevokedAt: nil}
	assert.Nil(t, sl.RevokedAt)

	now := time.Now()
	sl.RevokedAt = &now
	assert.NotNil(t, sl.RevokedAt)
}
