package service

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
)

type fakeGalleryMusicAssetSource struct {
	asset *repository.Asset
}

func (f *fakeGalleryMusicAssetSource) GetByIDAndWorkspace(context.Context, uuid.UUID, uuid.UUID) (*repository.Asset, error) {
	return f.asset, nil
}

func (f *fakeGalleryMusicAssetSource) ListGroupedByDate(context.Context, uuid.UUID, int) ([]repository.TimelineGroup, error) {
	return nil, nil
}

func TestSetGalleryMusic_CrossWorkspaceAssetRejected(t *testing.T) {
	svc := NewGalleryService(nil, nil, nil).
		WithAssetRepo(nil)
	svc.assetRepo = &fakeGalleryMusicAssetSource{asset: nil}

	musicAssetID := uuid.New()
	err := svc.SetGalleryMusic(context.Background(), uuid.New(), uuid.New(), &musicAssetID)

	if !errors.Is(err, ErrMusicAssetNotFound) {
		t.Fatalf("expected ErrMusicAssetNotFound for a missing or foreign asset, got %v", err)
	}
}

func TestSetGalleryMusic_NonAudioAssetRejected(t *testing.T) {
	svc := NewGalleryService(nil, nil, nil).
		WithAssetRepo(nil)
	svc.assetRepo = &fakeGalleryMusicAssetSource{
		asset: &repository.Asset{ID: uuid.New(), ContentType: "image/jpeg"},
	}

	musicAssetID := uuid.New()
	err := svc.SetGalleryMusic(context.Background(), uuid.New(), uuid.New(), &musicAssetID)

	if !errors.Is(err, ErrMusicAssetNotAudio) {
		t.Fatalf("expected ErrMusicAssetNotAudio for image asset, got %v", err)
	}
}
