package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

// AlbumService handles album business logic.
type AlbumService struct {
	albumRepo *repository.AlbumRepo
}

// NewAlbumService creates a new AlbumService.
func NewAlbumService(ar *repository.AlbumRepo) *AlbumService {
	return &AlbumService{albumRepo: ar}
}

// CreateAlbumInput holds the input for creating an album.
type CreateAlbumInput struct {
	GalleryID   uuid.UUID
	ParentID    *uuid.UUID
	Name        string
	Description string
}

// Create creates a new album within a gallery.
func (s *AlbumService) Create(ctx context.Context, input CreateAlbumInput) (*repository.Album, error) {
	if input.Name == "" {
		return nil, fmt.Errorf("album name is required")
	}

	album := &repository.Album{
		GalleryID:   input.GalleryID,
		ParentID:    input.ParentID,
		Name:        input.Name,
		Description: input.Description,
	}

	if err := s.albumRepo.Create(ctx, album); err != nil {
		return nil, fmt.Errorf("album service create: %w", err)
	}
	return album, nil
}

// GetByID retrieves an album by ID.
func (s *AlbumService) GetByID(ctx context.Context, id uuid.UUID) (*repository.Album, error) {
	return s.albumRepo.GetByID(ctx, id)
}

// ListByGallery returns all albums for a gallery.
func (s *AlbumService) ListByGallery(ctx context.Context, galleryID uuid.UUID) ([]repository.Album, error) {
	return s.albumRepo.ListByGallery(ctx, galleryID)
}

// GetBreadcrumb returns the parent chain for breadcrumb navigation.
func (s *AlbumService) GetBreadcrumb(ctx context.Context, albumID uuid.UUID) ([]repository.Album, error) {
	return s.albumRepo.GetBreadcrumb(ctx, albumID)
}

// AddAsset adds an asset to an album.
func (s *AlbumService) AddAsset(ctx context.Context, albumID, assetID uuid.UUID, position int) error {
	return s.albumRepo.AddAsset(ctx, albumID, assetID, position)
}

// RemoveAsset removes an asset from an album.
func (s *AlbumService) RemoveAsset(ctx context.Context, albumID, assetID uuid.UUID) error {
	return s.albumRepo.RemoveAsset(ctx, albumID, assetID)
}

// Delete removes an album.
func (s *AlbumService) Delete(ctx context.Context, id uuid.UUID) error {
	return s.albumRepo.Delete(ctx, id)
}
