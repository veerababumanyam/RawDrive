package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

func TestPublicGalleryGetBySlug_MintsAssetAccessTokenForEncryptedOpenGallery(t *testing.T) {
	ctx := context.Background()
	pool := includeAssetsTestPool(t)

	var stateID int
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM states LIMIT 1`).Scan(&stateID))
	var ownerID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO users (display_name, state_id, created_at, updated_at)
		 VALUES ('Encrypted Public Gallery Owner', $1, NOW(), NOW()) RETURNING id`, stateID).Scan(&ownerID))
	var workspaceID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO workspaces (name, state_id, owner_id, created_at)
		 VALUES ('Encrypted Public Gallery Workspace', $1, $2, NOW()) RETURNING id`, stateID, ownerID).Scan(&workspaceID))

	t.Cleanup(func() {
		c := context.Background()
		_, _ = pool.Exec(c, `DELETE FROM gallery_assets WHERE gallery_id IN (SELECT id FROM galleries WHERE workspace_id = $1)`, workspaceID)
		_, _ = pool.Exec(c, `DELETE FROM galleries WHERE workspace_id = $1`, workspaceID)
		_, _ = pool.Exec(c, `DELETE FROM assets WHERE workspace_id = $1`, workspaceID)
		_, _ = pool.Exec(c, `DELETE FROM workspaces WHERE id = $1`, workspaceID)
		_, _ = pool.Exec(c, `DELETE FROM users WHERE id = $1`, ownerID)
	})

	galleryRepo := repository.NewGalleryRepo(pool)
	galleryAssetRepo := repository.NewGalleryAssetRepo(pool)
	gallerySvc := service.NewGalleryService(galleryRepo, galleryAssetRepo, nil)

	thumbs := `{"thumb_lg_webp":"thumbnails/encrypted/thumb_lg_webp.webp"}`
	assetID := seedIncludeAsset(t, ctx, pool, workspaceID, "Wedding (42).jpg", thumbs)
	require.NoError(t, pool.QueryRow(ctx,
		`UPDATE assets
		    SET is_encrypted = true,
		        encryption_algo = 'client-side-aes-256-gcm',
		        media_encryption = '{}'::jsonb
		  WHERE id = $1
		  RETURNING id`,
		assetID,
	).Scan(&assetID))

	gallery := &repository.Gallery{
		WorkspaceID:  workspaceID,
		Title:        "Encrypted Public Wedding",
		Slug:         "encrypted-public-" + uuid.NewString()[:8],
		GalleryType:  "delivery",
		Status:       "active",
		AccessMode:   "public",
		CreatedBy:    &ownerID,
		IsPublished:  true,
		CoverAssetID: &assetID,
	}
	require.NoError(t, galleryRepo.Create(ctx, gallery))
	_, err := pool.Exec(ctx, `UPDATE galleries SET access_mode = 'public' WHERE id = $1`, gallery.ID)
	require.NoError(t, err)
	require.NoError(t, galleryAssetRepo.Add(ctx, gallery.ID, assetID, workspaceID, 0))

	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(0x21 + i)
	}
	accessSvc := service.NewGalleryAccessService(galleryRepo, nil).WithSessionSigningKey(key)
	h := NewPublicGalleryHandler(gallerySvc, nil, nil).
		WithM13Deps(pool, nil).
		WithGalleryAccessService(accessSvc)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/public/galleries/"+gallery.Slug, nil)
	routeCtx := chi.NewRouteContext()
	routeCtx.URLParams.Add("slug", gallery.Slug)
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, routeCtx))
	rec := httptest.NewRecorder()

	h.GetBySlug(rec, req)

	require.Equal(t, http.StatusOK, rec.Code, "body=%s", rec.Body.String())
	require.Contains(t, rec.Header().Get("Cache-Control"), "no-store")
	var body repository.Gallery
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	token, ok := body.Settings["asset_access_token"].(string)
	require.True(t, ok, "settings.asset_access_token missing from body: %#v", body.Settings)
	require.NotEmpty(t, token)
}
