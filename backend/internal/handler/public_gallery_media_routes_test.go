package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
)

type fakePublicGalleryResolver struct {
	gallery *repository.Gallery
}

func (f *fakePublicGalleryResolver) GetByID(context.Context, uuid.UUID) (*repository.Gallery, error) {
	return f.gallery, nil
}

func (f *fakePublicGalleryResolver) GetBySlug(context.Context, string) (*repository.Gallery, error) {
	return f.gallery, nil
}

func (f *fakePublicGalleryResolver) GetByBusinessSubdomainAndSlug(context.Context, string, string) (*repository.Gallery, error) {
	return f.gallery, nil
}

func (f *fakePublicGalleryResolver) ListAssets(context.Context, uuid.UUID) ([]repository.GalleryAsset, error) {
	return nil, nil
}

func requestWithGallerySlug(path, slug string) *http.Request {
	req := httptest.NewRequest(http.MethodGet, path, nil)
	routeCtx := chi.NewRouteContext()
	routeCtx.URLParams.Add("slug", slug)
	return req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, routeCtx))
}

func TestGetGalleryMusic_PrivateGalleryDeniedBeforeStorage(t *testing.T) {
	gallery := publishedPublicGallery()
	gallery.AccessMode = "private"
	gallery.WorkspaceID = uuid.New()
	gallery.MusicAssetID = uuidPtr(uuid.New())
	h := NewPublicGalleryHandler(&fakePublicGalleryResolver{gallery: gallery}, nil, nil)

	rec := httptest.NewRecorder()
	h.GetGalleryMusic(rec, requestWithGallerySlug("/api/v1/public/galleries/wedding/music", "wedding"))

	if rec.Code != http.StatusForbidden {
		t.Fatalf("private gallery music must be access-gated before storage checks; got %d body=%s", rec.Code, rec.Body.String())
	}
}

func TestGetBrandingLogo_PrivateGalleryDeniedBeforeStorage(t *testing.T) {
	gallery := publishedPublicGallery()
	gallery.AccessMode = "private"
	gallery.WorkspaceID = uuid.New()
	h := NewPublicGalleryHandler(&fakePublicGalleryResolver{gallery: gallery}, nil, nil)

	rec := httptest.NewRecorder()
	h.GetBrandingLogo(rec, requestWithGallerySlug("/api/v1/public/galleries/wedding/branding/logo", "wedding"))

	if rec.Code != http.StatusForbidden {
		t.Fatalf("private gallery logo must be access-gated before storage checks; got %d body=%s", rec.Code, rec.Body.String())
	}
}

func TestPublicGalleryMusicAndLogoReachMediaDependencyPath(t *testing.T) {
	gallery := publishedPublicGallery()
	gallery.WorkspaceID = uuid.New()
	gallery.MusicAssetID = uuidPtr(uuid.New())
	h := NewPublicGalleryHandler(&fakePublicGalleryResolver{gallery: gallery}, nil, nil)

	musicRec := httptest.NewRecorder()
	h.GetGalleryMusic(musicRec, requestWithGallerySlug("/api/v1/public/galleries/wedding/music", "wedding"))
	if musicRec.Code != http.StatusServiceUnavailable {
		t.Fatalf("public gallery music should pass access gate and fail only on unwired media deps; got %d body=%s", musicRec.Code, musicRec.Body.String())
	}

	logoRec := httptest.NewRecorder()
	h.GetBrandingLogo(logoRec, requestWithGallerySlug("/api/v1/public/galleries/wedding/branding/logo", "wedding"))
	if logoRec.Code != http.StatusServiceUnavailable {
		t.Fatalf("public gallery logo should pass access gate and fail only on unwired media deps; got %d body=%s", logoRec.Code, logoRec.Body.String())
	}
}
