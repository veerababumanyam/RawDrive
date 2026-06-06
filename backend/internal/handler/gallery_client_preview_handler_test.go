package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

func TestGalleryClientPreview_RequiresWorkspaceAuth(t *testing.T) {
	h := NewGalleryHandler(nil)
	req := httptest.NewRequest("GET", "/api/v1/galleries/"+uuid.NewString()+"/client-preview", nil)
	routeCtx := chi.NewRouteContext()
	routeCtx.URLParams.Add("id", uuid.NewString())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, routeCtx))

	rec := httptest.NewRecorder()
	h.ClientPreview(rec, req)

	require.Equal(t, 400, rec.Code)
}

func TestGalleryClientPreview_UnpublishedPayloadAndAlbumScope_RealDB(t *testing.T) {
	ctx := context.Background()
	pool := includeAssetsTestPool(t)

	var stateID int
	require.NoError(t, pool.QueryRow(ctx, `SELECT id FROM states LIMIT 1`).Scan(&stateID))
	var ownerID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO users (display_name, state_id, created_at, updated_at)
		 VALUES ('Client Preview Owner', $1, NOW(), NOW()) RETURNING id`, stateID).Scan(&ownerID))
	var workspaceID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx,
		`INSERT INTO workspaces (name, state_id, owner_id, plan_tier, created_at)
		 VALUES ('Client Preview Workspace', $1, $2, 'pro_photographer', NOW()) RETURNING id`, stateID, ownerID).Scan(&workspaceID))
	require.NoError(t, pool.QueryRow(ctx,
		`UPDATE workspaces
		    SET business_profile_slug=$2,
		        business_unique_code=$3,
		        plan_tier='pro_photographer',
		        brand_name='Preview Studio',
		        brand_accent_color='#1456b8',
		        public_branding_enabled=true
		  WHERE id=$1
		  RETURNING id`,
		workspaceID,
		"client-preview-"+uuid.NewString()[:8],
		uuid.NewString()[:8],
	).Scan(&workspaceID))

	t.Cleanup(func() {
		c := context.Background()
		_, _ = pool.Exec(c, `DELETE FROM gallery_products WHERE workspace_id = $1`, workspaceID)
		_, _ = pool.Exec(c, `DELETE FROM gallery_banners WHERE workspace_id = $1`, workspaceID)
		_, _ = pool.Exec(c, `DELETE FROM album_assets WHERE album_id IN (SELECT id FROM albums WHERE gallery_id IN (SELECT id FROM galleries WHERE workspace_id = $1))`, workspaceID)
		_, _ = pool.Exec(c, `DELETE FROM albums WHERE gallery_id IN (SELECT id FROM galleries WHERE workspace_id = $1)`, workspaceID)
		_, _ = pool.Exec(c, `DELETE FROM gallery_assets WHERE workspace_id = $1`, workspaceID)
		_, _ = pool.Exec(c, `DELETE FROM galleries WHERE workspace_id = $1`, workspaceID)
		_, _ = pool.Exec(c, `DELETE FROM assets WHERE workspace_id = $1`, workspaceID)
		_, _ = pool.Exec(c, `DELETE FROM workspaces WHERE id = $1`, workspaceID)
		_, _ = pool.Exec(c, `DELETE FROM users WHERE id = $1`, ownerID)
	})

	galleryRepo := repository.NewGalleryRepo(pool)
	galleryAssetRepo := repository.NewGalleryAssetRepo(pool)
	assetRepo := repository.NewAssetRepo(pool)
	albumRepo := repository.NewAlbumRepo(pool)
	productRepo := repository.NewProductRepo(pool)
	bannerRepo := repository.NewBannerRepo(pool)

	desktopThumbs := `{"thumb_sm_webp":"ws/client/desktop-sm.webp","thumb_md_webp":"ws/client/desktop-md.webp","thumb_lg_webp":"ws/client/desktop-lg.webp","display_webp":"ws/client/desktop-display.webp"}`
	phoneThumbs := `{"thumb_sm_webp":"ws/client/phone-sm.webp","thumb_md_webp":"ws/client/phone-md.webp","thumb_lg_webp":"ws/client/phone-lg.webp","display_webp":"ws/client/phone-display.webp"}`
	foreignThumbs := `{"thumb_sm_webp":"ws/client/foreign-sm.webp","thumb_md_webp":"ws/client/foreign-md.webp","thumb_lg_webp":"ws/client/foreign-lg.webp","display_webp":"ws/client/foreign-display.webp"}`
	asset1 := seedIncludeAsset(t, ctx, pool, workspaceID, "Wedding (42).jpg", desktopThumbs)
	asset2 := seedIncludeAsset(t, ctx, pool, workspaceID, "veera.jpg", phoneThumbs)
	unlinkedCoverAsset := seedIncludeAsset(t, ctx, pool, workspaceID, "not-in-gallery.jpg", foreignThumbs)

	gallery := &repository.Gallery{
		WorkspaceID: workspaceID,
		Title:       "Client Preview Wedding",
		Slug:        "client-preview-wedding",
		GalleryType: "proofing",
		Settings: map[string]interface{}{
			"design_config": map[string]interface{}{
				"cover": map[string]interface{}{"assetId": unlinkedCoverAsset.String()},
			},
		},
		Status:        "draft",
		CreatedBy:     &ownerID,
		IsPublished:   false,
		MaxSelections: 12,
	}
	require.NoError(t, galleryRepo.Create(ctx, gallery))
	require.NoError(t, galleryAssetRepo.Add(ctx, gallery.ID, asset1, workspaceID, 0))
	require.NoError(t, galleryAssetRepo.Add(ctx, gallery.ID, asset2, workspaceID, 1))

	album := &repository.Album{GalleryID: gallery.ID, Name: "Ceremony", Position: 0}
	require.NoError(t, albumRepo.Create(ctx, album))
	require.NoError(t, albumRepo.AddAsset(ctx, album.ID, asset2, workspaceID, 0))

	foreignGallery := &repository.Gallery{
		WorkspaceID: workspaceID,
		Title:       "Foreign Album Gallery",
		Slug:        "foreign-album-gallery",
		GalleryType: "proofing",
		Status:      "draft",
		CreatedBy:   &ownerID,
	}
	require.NoError(t, galleryRepo.Create(ctx, foreignGallery))
	foreignAlbum := &repository.Album{GalleryID: foreignGallery.ID, Name: "Other", Position: 0}
	require.NoError(t, albumRepo.Create(ctx, foreignAlbum))

	require.NoError(t, productRepo.Create(ctx, &repository.GalleryProduct{
		GalleryID:     gallery.ID,
		WorkspaceID:   workspaceID,
		Name:          "Live print",
		ProductType:   repository.ProductTypePrint,
		PriceAmount:   10000,
		PriceCurrency: "INR",
		IsActive:      true,
	}))
	require.NoError(t, productRepo.Create(ctx, &repository.GalleryProduct{
		GalleryID:     gallery.ID,
		WorkspaceID:   workspaceID,
		Name:          "Paused print",
		ProductType:   repository.ProductTypePrint,
		PriceAmount:   10000,
		PriceCurrency: "INR",
		IsActive:      false,
	}))

	future := time.Now().UTC().Add(24 * time.Hour)
	require.NoError(t, bannerRepo.Create(ctx, &repository.GalleryBanner{
		GalleryID:   gallery.ID,
		WorkspaceID: workspaceID,
		Title:       "Live banner",
		IsActive:    true,
	}))
	require.NoError(t, bannerRepo.Create(ctx, &repository.GalleryBanner{
		GalleryID:   gallery.ID,
		WorkspaceID: workspaceID,
		Title:       "Future banner",
		ActiveFrom:  &future,
		IsActive:    true,
	}))
	require.NoError(t, bannerRepo.Create(ctx, &repository.GalleryBanner{
		GalleryID:   gallery.ID,
		WorkspaceID: workspaceID,
		Title:       "Paused banner",
		IsActive:    false,
	}))

	h := NewGalleryHandler(service.NewGalleryService(galleryRepo, galleryAssetRepo, nil)).
		WithPool(pool).
		WithClientPreviewDeps(
			service.NewAlbumService(albumRepo).WithAssetRepo(assetRepo),
			service.NewBannerService(bannerRepo),
			service.NewProductService(productRepo),
			"https://app.rawdrive.in",
		)

	rec := httptest.NewRecorder()
	h.ClientPreview(rec, clientPreviewRequest(gallery.ID, workspaceID, "?album="+album.ID.String()))
	require.Equal(t, 200, rec.Code, "body=%s", rec.Body.String())

	var body galleryClientPreviewResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.False(t, body.IsPublished)
	require.Equal(t, gallery.ID, body.Gallery.ID)
	require.Len(t, body.Assets, 1)
	require.Equal(t, asset2.String(), body.Assets[0].ID)
	require.Len(t, body.Albums, 1)
	require.Equal(t, 2, body.TotalAssetCount)
	require.Len(t, body.Products, 1)
	require.Equal(t, "Live print", body.Products[0].Name)
	require.Len(t, body.Banners, 1)
	require.Equal(t, "Live banner", body.Banners[0].Title)
	require.NotEmpty(t, body.PublicURL)
	require.Contains(t, body.PublicURL, ".rawdrive.in/client-preview-wedding")
	require.NotContains(t, body.Gallery.Settings, "asset_access_token")
	require.NotContains(t, body.Gallery.Settings, "cover_thumbnails")
	require.NotContains(t, body.Gallery.Settings, "cover_asset_resolved_id")

	nextSettings, err := json.Marshal(map[string]interface{}{
		"design_config": map[string]interface{}{
			"cover": map[string]interface{}{
				"assetId": asset1.String(),
				"deviceProfiles": map[string]interface{}{
					"desktop": map[string]interface{}{"assetId": asset1.String()},
					"phone":   map[string]interface{}{"assetId": asset2.String()},
				},
			},
		},
	})
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `UPDATE galleries SET settings = $2::jsonb WHERE id = $1`, gallery.ID, string(nextSettings))
	require.NoError(t, err)

	profileRec := httptest.NewRecorder()
	h.ClientPreview(profileRec, clientPreviewRequest(gallery.ID, workspaceID, "?album="+album.ID.String()))
	require.Equal(t, 200, profileRec.Code, "body=%s", profileRec.Body.String())
	var profileBody galleryClientPreviewResponse
	require.NoError(t, json.Unmarshal(profileRec.Body.Bytes(), &profileBody))
	require.Equal(t, asset1.String(), profileBody.Gallery.Settings["cover_asset_resolved_id"])
	coverThumbs := profileBody.Gallery.Settings["cover_thumbnails"].(map[string]interface{})
	require.Equal(t, "ws/client/desktop-md.webp", coverThumbs["thumb_md_webp"])
	profileThumbs := profileBody.Gallery.Settings["cover_profile_thumbnails"].(map[string]interface{})
	desktopProfileThumbs := profileThumbs["desktop"].(map[string]interface{})
	phoneProfileThumbs := profileThumbs["phone"].(map[string]interface{})
	require.Equal(t, "ws/client/desktop-md.webp", desktopProfileThumbs["thumb_md_webp"])
	require.Equal(t, "ws/client/phone-md.webp", phoneProfileThumbs["thumb_md_webp"])

	foreignRec := httptest.NewRecorder()
	h.ClientPreview(foreignRec, clientPreviewRequest(gallery.ID, workspaceID, "?album="+foreignAlbum.ID.String()))
	require.Equal(t, 404, foreignRec.Code)
}

func clientPreviewRequest(galleryID, workspaceID uuid.UUID, query string) *http.Request {
	req := httptest.NewRequest("GET", "/api/v1/galleries/"+galleryID.String()+"/client-preview"+query, nil)
	routeCtx := chi.NewRouteContext()
	routeCtx.URLParams.Add("id", galleryID.String())
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, routeCtx)
	ctx = middleware.WithWorkspaceID(ctx, workspaceID.String())
	return req.WithContext(ctx)
}
