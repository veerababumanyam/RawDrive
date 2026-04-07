package service

import (
	"context"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

// GalleryCoverService handles auto cover selection for galleries.
type GalleryCoverService struct {
	galleryRepo      *repository.GalleryRepo
	galleryAssetRepo *repository.GalleryAssetRepo
}

// NewGalleryCoverService creates a new GalleryCoverService.
func NewGalleryCoverService(gr *repository.GalleryRepo, gar *repository.GalleryAssetRepo) *GalleryCoverService {
	return &GalleryCoverService{galleryRepo: gr, galleryAssetRepo: gar}
}

// AutoSetCover sets the cover to the first asset in the gallery.
func (s *GalleryCoverService) AutoSetCover(ctx context.Context, galleryID uuid.UUID) error {
	firstID, err := s.galleryAssetRepo.GetFirstAssetID(ctx, galleryID)
	if err != nil {
		return err
	}
	return s.galleryRepo.UpdateCover(ctx, galleryID, firstID)
}

// SetCover manually sets the cover asset for a gallery.
func (s *GalleryCoverService) SetCover(ctx context.Context, galleryID uuid.UUID, assetID *uuid.UUID) error {
	return s.galleryRepo.UpdateCover(ctx, galleryID, assetID)
}
