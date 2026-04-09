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

// OnAssetDeleted checks if the deleted asset was the cover and auto-selects a replacement.
func (s *GalleryCoverService) OnAssetDeleted(ctx context.Context, galleryID uuid.UUID, deletedAssetID uuid.UUID) error {
	gallery, err := s.galleryRepo.GetByID(ctx, galleryID)
	if err != nil || gallery == nil {
		return err
	}

	// Only auto-update if the deleted asset was the current cover
	if gallery.CoverAssetID == nil || *gallery.CoverAssetID != deletedAssetID {
		return nil
	}

	// Select next available asset as cover
	return s.AutoSetCover(ctx, galleryID)
}

// ClearCover removes the cover from a gallery.
func (s *GalleryCoverService) ClearCover(ctx context.Context, galleryID uuid.UUID) error {
	return s.galleryRepo.UpdateCover(ctx, galleryID, nil)
}
