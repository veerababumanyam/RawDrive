package repository

import (
	"context"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	backendcrypto "github.com/rawdrive/backend/internal/crypto"
)

func TestGalleryMediaKeyRepo_ValidationWithoutDB(t *testing.T) {
	repo := NewGalleryMediaKeyRepo(nil)
	_, err := repo.Upsert(t.Context(), GalleryMediaKey{})
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "pool is nil")
}

func TestGalleryMediaKeyRepo_EncryptedRoundTrip(t *testing.T) {
	pool := getRetryTestPool(t)
	ctx := context.Background()
	ownerID := uuid.New()
	workspaceID := uuid.New()
	galleryID := uuid.New()
	keyID := "gallery:" + galleryID.String() + ":abcdef1234567890"
	exportedKey := "browser-portable-exported-key"

	_, err := pool.Exec(ctx,
		`INSERT INTO users (id, display_name, created_at, updated_at)
		 VALUES ($1, 'Media Key Owner', now(), now())`,
		ownerID,
	)
	require.NoError(t, err)
	_, err = pool.Exec(ctx,
		`INSERT INTO workspaces (id, name, owner_id, created_at)
		 VALUES ($1, 'Media Key Workspace', $2, now())`,
		workspaceID, ownerID,
	)
	require.NoError(t, err)
	_, err = pool.Exec(ctx,
		`INSERT INTO galleries (id, workspace_id, title, slug, created_by, created_at, updated_at)
		 VALUES ($1, $2, 'Media Key Gallery', $3, $4, now(), now())`,
		galleryID, workspaceID, "media-key-"+galleryID.String(), ownerID,
	)
	require.NoError(t, err)
	t.Cleanup(func() {
		cleanupCtx := context.Background()
		_, _ = pool.Exec(cleanupCtx, `DELETE FROM galleries WHERE id = $1`, galleryID)
		_, _ = pool.Exec(cleanupCtx, `DELETE FROM workspaces WHERE id = $1`, workspaceID)
		_, _ = pool.Exec(cleanupCtx, `DELETE FROM users WHERE id = $1`, ownerID)
	})

	envelope, err := backendcrypto.NewEnvelopeFromHex(strings.Repeat("01", 32))
	require.NoError(t, err)
	repo := NewGalleryMediaKeyRepo(pool).WithEnvelope(envelope)

	saved, err := repo.Upsert(ctx, GalleryMediaKey{
		GalleryID:   galleryID,
		KeyID:       keyID,
		ExportedKey: exportedKey,
		UpdatedBy:   &ownerID,
	})
	require.NoError(t, err)
	require.NotNil(t, saved)
	assert.Equal(t, exportedKey, saved.ExportedKey)

	var plaintext string
	var encryptedKey, dekWrapped []byte
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT exported_key, encrypted_key, dek_wrapped
		 FROM gallery_media_keys
		 WHERE gallery_id = $1 AND key_id = $2`,
		galleryID, keyID,
	).Scan(&plaintext, &encryptedKey, &dekWrapped))
	assert.Empty(t, plaintext)
	assert.NotEmpty(t, encryptedKey)
	assert.NotEmpty(t, dekWrapped)

	keys, err := repo.ListByGallery(ctx, galleryID)
	require.NoError(t, err)
	require.Len(t, keys, 1)
	assert.Equal(t, keyID, keys[0].KeyID)
	assert.Equal(t, exportedKey, keys[0].ExportedKey)
}
