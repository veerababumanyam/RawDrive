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

// CreateSmartAlbum creates an album with a smart filter that is evaluated
// lazily by GetSmartAlbumAssets. Used by M3 E8-S3 to turn a face cluster
// into a gallery-scoped smart album ("All photos with Veera in them").
// Returns the new album ID.
func (s *AlbumService) CreateSmartAlbum(ctx context.Context, galleryID uuid.UUID, name string, smartFilter map[string]any) (uuid.UUID, error) {
	if name == "" {
		return uuid.Nil, fmt.Errorf("album name is required")
	}
	if smartFilter == nil {
		return uuid.Nil, fmt.Errorf("smart_filter required for smart album")
	}
	album := &repository.Album{
		GalleryID:   galleryID,
		Name:        name,
		SmartFilter: smartFilter,
	}
	if err := s.albumRepo.Create(ctx, album); err != nil {
		return uuid.Nil, fmt.Errorf("album service create smart album: %w", err)
	}
	return album.ID, nil
}

// Delete removes an album.
func (s *AlbumService) Delete(ctx context.Context, id uuid.UUID) error {
	return s.albumRepo.Delete(ctx, id)
}

// GetSmartAlbumAssets evaluates the smart filter and returns matching assets.
func (s *AlbumService) GetSmartAlbumAssets(ctx context.Context, albumID uuid.UUID, assetRepo *repository.AssetRepo) ([]repository.Asset, error) {
	album, err := s.albumRepo.GetByID(ctx, albumID)
	if err != nil || album == nil {
		return nil, fmt.Errorf("album not found")
	}
	if album.SmartFilter == nil || len(album.SmartFilter) == 0 {
		return nil, nil // Not a smart album
	}

	// Build asset filter from smart_filter JSON
	f := repository.AssetFilter{GalleryID: &album.GalleryID, Limit: 200}
	if ct, ok := album.SmartFilter["content_type"].(string); ok {
		f.ContentType = ct
	}
	if status, ok := album.SmartFilter["status"].(string); ok {
		f.Status = status
	}
	if search, ok := album.SmartFilter["search"].(string); ok {
		f.Search = search
	}

	return assetRepo.List(ctx, f)
}

// UtilityAlbums are well-known smart albums seeded on gallery creation.
var UtilityAlbums = []struct {
	Name        string
	SmartFilter map[string]interface{}
}{
	{Name: "Favorites", SmartFilter: map[string]interface{}{"is_favorite": true}},
	{Name: "Videos", SmartFilter: map[string]interface{}{"content_type": "video/"}},
	{Name: "RAW", SmartFilter: map[string]interface{}{"content_type": "image/x-"}},
}

// SeedUtilityAlbums creates the standard smart albums for a new gallery.
func (s *AlbumService) SeedUtilityAlbums(ctx context.Context, galleryID uuid.UUID) error {
	for i, u := range UtilityAlbums {
		album := &repository.Album{
			GalleryID:   galleryID,
			Name:        u.Name,
			Position:    i + 1000, // high position so they sort last
			SmartFilter: u.SmartFilter,
		}
		if err := s.albumRepo.Create(ctx, album); err != nil {
			return fmt.Errorf("seed utility album %s: %w", u.Name, err)
		}
	}
	return nil
}
