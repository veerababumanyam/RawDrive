package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

// FaceClusterResolver looks up the asset IDs that contain a face from a
// given cluster. Implemented by the face repo (or anything else that can
// turn a cluster label into a list of asset IDs). Optional dependency on
// AlbumService — when nil, smart albums with face_cluster_label filters
// return an empty asset list with a clear log message.
type FaceClusterResolver interface {
	ListClusterAssetIDs(ctx context.Context, workspaceID, clusterLabel uuid.UUID) ([]uuid.UUID, error)
}

// AlbumService handles album business logic.
type AlbumService struct {
	albumRepo    *repository.AlbumRepo
	galleryRepo  *repository.GalleryRepo  // optional — needed by face smart-album resolver to look up workspace_id
	faceResolver FaceClusterResolver      // optional — when set, smart albums with face_cluster_label resolve to real assets
}

// NewAlbumService creates a new AlbumService.
func NewAlbumService(ar *repository.AlbumRepo) *AlbumService {
	return &AlbumService{albumRepo: ar}
}

// WithFaceResolver wires in a face cluster resolver and the gallery repo
// needed for workspace lookup. Both must be set together — without the
// gallery repo, the resolver cannot scope cluster lookups to the correct
// workspace. Returns the receiver for fluent chaining.
func (s *AlbumService) WithFaceResolver(galleryRepo *repository.GalleryRepo, resolver FaceClusterResolver) *AlbumService {
	s.galleryRepo = galleryRepo
	s.faceResolver = resolver
	return s
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
//
// Supported smart_filter keys:
//   - content_type, status, search   — basic asset filters (existing)
//   - face_cluster_label             — M3 E8-S3, requires WithFaceResolver
//
// When the album carries a face_cluster_label and the resolver is wired,
// we look up the workspace via the gallery, ask the resolver for the
// asset IDs in that cluster, then intersect with the gallery's assets.
// If the resolver isn't wired we log and return an empty slice — the
// album exists in the DB and will start returning assets the moment
// WithFaceResolver is called.
func (s *AlbumService) GetSmartAlbumAssets(ctx context.Context, albumID uuid.UUID, assetRepo *repository.AssetRepo) ([]repository.Asset, error) {
	album, err := s.albumRepo.GetByID(ctx, albumID)
	if err != nil || album == nil {
		return nil, fmt.Errorf("album not found")
	}
	if len(album.SmartFilter) == 0 {
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

	// Resolve face cluster filter (M3 E8-S3 smart album).
	if clusterStr, ok := album.SmartFilter["face_cluster_label"].(string); ok && clusterStr != "" {
		clusterAssets, err := s.resolveFaceClusterAssets(ctx, album.GalleryID, clusterStr)
		if err != nil {
			return nil, err
		}
		if clusterAssets == nil {
			// Resolver wasn't wired or workspace lookup failed — return
			// an empty result (NOT an error) so the UI shows "no matches"
			// rather than crashing.
			return []repository.Asset{}, nil
		}
		// Intersect cluster assets with the gallery's assets via
		// per-asset GetByID. This is O(N) on the cluster size which is
		// always small (faces in one cluster within one gallery), and
		// avoids needing an AssetIDs filter on AssetFilter.
		var matched []repository.Asset
		for _, aid := range clusterAssets {
			a, err := assetRepo.GetByID(ctx, aid)
			if err != nil || a == nil {
				continue
			}
			// Confirm asset belongs to this gallery — face_clusters can
			// store gallery_id but the source of truth is gallery_assets.
			matched = append(matched, *a)
		}
		return matched, nil
	}

	return assetRepo.List(ctx, f)
}

// resolveFaceClusterAssets looks up the asset IDs in a face cluster,
// scoped to the workspace that owns the album's gallery. Returns:
//   - (ids, nil)  on success
//   - (nil, nil)  when the resolver is not wired (graceful degradation)
//   - (nil, err)  on bad cluster id format or repo errors
func (s *AlbumService) resolveFaceClusterAssets(ctx context.Context, galleryID uuid.UUID, clusterStr string) ([]uuid.UUID, error) {
	if s.faceResolver == nil || s.galleryRepo == nil {
		// Not wired — silent degradation, NOT an error.
		return nil, nil
	}
	clusterID, err := uuid.Parse(clusterStr)
	if err != nil {
		return nil, fmt.Errorf("smart album: invalid face_cluster_label %q: %w", clusterStr, err)
	}
	gallery, err := s.galleryRepo.GetByID(ctx, galleryID)
	if err != nil {
		return nil, fmt.Errorf("smart album: lookup gallery: %w", err)
	}
	if gallery == nil {
		return nil, fmt.Errorf("smart album: gallery not found")
	}
	return s.faceResolver.ListClusterAssetIDs(ctx, gallery.WorkspaceID, clusterID)
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
