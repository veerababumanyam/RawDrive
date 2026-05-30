package service

import (
	"context"
	"fmt"
	"time"

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
	albumRepo     *repository.AlbumRepo
	galleryRepo   *repository.GalleryRepo          // optional — needed by face smart-album resolver to look up workspace_id
	faceResolver  FaceClusterResolver              // optional — when set, smart albums with face_cluster_label resolve to real assets
	assetRepo     *repository.AssetRepo            // optional — needed by ListAssets to dispatch smart-album resolution
	favoritesRepo *repository.GalleryFavoritesRepo // optional — when set, "Favorites" smart album resolves real guest hearts
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

// WithAssetRepo wires the asset repo so ListAssets can dispatch smart-album
// resolution without the handler having to know which albums are smart.
// Optional — when nil, ListAssets falls back to the manual join-table read
// (which is the historical behavior). Returns the receiver for fluent
// chaining.
func (s *AlbumService) WithAssetRepo(assetRepo *repository.AssetRepo) *AlbumService {
	s.assetRepo = assetRepo
	return s
}

// WithFavoritesRepo wires the gallery favorites repo so the "Favorites"
// utility smart album can resolve to the asset IDs that guests have
// hearted on the public viewer (see migration 105). Optional — when nil,
// the "Favorites" album returns an empty list (matching the legacy
// behavior before server-side favorites shipped). Returns the receiver
// for fluent chaining.
func (s *AlbumService) WithFavoritesRepo(favoritesRepo *repository.GalleryFavoritesRepo) *AlbumService {
	s.favoritesRepo = favoritesRepo
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

// ListAssets returns the asset rows that belong to an album.
//
// For manual albums this is the historical join-table read (album_assets
// rows). For smart albums (any album with a non-empty smart_filter) it
// dispatches to GetSmartAlbumAssets and synthesizes []AlbumAsset rows so
// the existing wire format keeps working unchanged from the handler's
// perspective — the frontend has no idea whether the album is manual or
// smart, and shouldn't need to.
//
// Smart-album dispatch only fires when WithAssetRepo has been wired; this
// keeps existing tests that construct a bare AlbumService working. When
// assetRepo is nil the smart album returns an empty slice with a clear
// noop-comment in code rather than crashing.
func (s *AlbumService) ListAssets(ctx context.Context, albumID uuid.UUID) ([]repository.AlbumAsset, error) {
	album, err := s.albumRepo.GetByID(ctx, albumID)
	if err != nil {
		return nil, fmt.Errorf("album service list assets: lookup album: %w", err)
	}
	if album == nil {
		return nil, fmt.Errorf("album not found")
	}

	// Smart album path: resolve via the filter and rewrap as AlbumAsset
	// so the API shape is identical to the manual join.
	if len(album.SmartFilter) > 0 {
		if s.assetRepo == nil {
			// No asset repo wired — degrade gracefully to "no matches"
			// rather than 500. The album still exists, the filter is
			// known, but we can't resolve assets without the repo.
			return []repository.AlbumAsset{}, nil
		}
		assets, err := s.GetSmartAlbumAssets(ctx, albumID, s.assetRepo)
		if err != nil {
			return nil, fmt.Errorf("album service list assets: smart resolve: %w", err)
		}
		now := time.Now().UTC()
		out := make([]repository.AlbumAsset, 0, len(assets))
		for i, a := range assets {
			out = append(out, repository.AlbumAsset{
				AlbumID:  albumID,
				AssetID:  a.ID,
				Position: i,
				AddedAt:  now,
			})
		}
		return out, nil
	}

	return s.albumRepo.ListAssets(ctx, albumID)
}

// ListAssetIDsByGallery returns album_id -> []asset_id for every album in a
// gallery, collapsing the per-album ListAssets fan-out (F-091). Manual albums
// are resolved in a single batched repo query; smart albums reuse the existing
// per-album resolution, which is already batched internally via
// AssetRepo.GetByIDs. The result always has an entry (possibly empty) per album.
func (s *AlbumService) ListAssetIDsByGallery(ctx context.Context, galleryID uuid.UUID) (map[uuid.UUID][]uuid.UUID, error) {
	albums, err := s.albumRepo.ListByGallery(ctx, galleryID)
	if err != nil {
		return nil, err
	}
	manual, err := s.albumRepo.ListAssetIDsByGallery(ctx, galleryID)
	if err != nil {
		return nil, err
	}
	out := make(map[uuid.UUID][]uuid.UUID, len(albums))
	for _, al := range albums {
		if len(al.SmartFilter) > 0 {
			assets, err := s.ListAssets(ctx, al.ID)
			if err != nil {
				return nil, err
			}
			ids := make([]uuid.UUID, 0, len(assets))
			for _, a := range assets {
				ids = append(ids, a.AssetID)
			}
			out[al.ID] = ids
			continue
		}
		if ids := manual[al.ID]; ids != nil {
			out[al.ID] = ids
		} else {
			out[al.ID] = []uuid.UUID{}
		}
	}
	return out, nil
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
//   - is_favorite                    — M41/105, requires WithFavoritesRepo
//
// When the album carries a face_cluster_label and the resolver is wired,
// we look up the workspace via the gallery, ask the resolver for the
// asset IDs in that cluster, then intersect with the gallery's assets.
// If the resolver isn't wired we log and return an empty slice — the
// album exists in the DB and will start returning assets the moment
// WithFaceResolver is called.
//
// is_favorite dispatches to the gallery_favorites repo to fetch the asset
// IDs that any guest session has hearted on the public viewer. Same
// degradation rule as the face resolver: if the favorites repo isn't
// wired, return an empty slice rather than failing.
func (s *AlbumService) GetSmartAlbumAssets(ctx context.Context, albumID uuid.UUID, assetRepo *repository.AssetRepo) ([]repository.Asset, error) {
	album, err := s.albumRepo.GetByID(ctx, albumID)
	if err != nil || album == nil {
		return nil, fmt.Errorf("album not found")
	}
	if len(album.SmartFilter) == 0 {
		return nil, nil // Not a smart album
	}

	// is_favorite branch (M41/105). Evaluated FIRST because it's an
	// independent asset-id source — not a column filter — and combining
	// it with content_type/status would require an intersection. None of
	// the seeded utility albums combine these flags so we treat
	// is_favorite as an early-return resolver.
	if fav, ok := album.SmartFilter["is_favorite"].(bool); ok && fav {
		if s.favoritesRepo == nil {
			// Repo not wired — return empty rather than 500. The album
			// will start populating the moment WithFavoritesRepo is
			// called on the service.
			return []repository.Asset{}, nil
		}
		favIDs, err := s.favoritesRepo.ListAssetIDsByGallery(ctx, album.GalleryID)
		if err != nil {
			return nil, fmt.Errorf("smart album: list favorites: %w", err)
		}
		// Single batched lookup instead of one GetByID per favorite. The
		// favorites list for a popular gallery can be large and this path
		// is reachable by anonymous public-gallery visitors, so the old
		// per-id loop was a genuine N+1. Deleted/missing assets are
		// dropped (not an error) so the album doesn't 500; the favorite
		// row remains in the DB and the album resumes including it if the
		// asset is restored. orderAssetsByIDs preserves the
		// most-favorited-first ordering ListAssetIDsByGallery returns.
		rows, err := assetRepo.GetByIDs(ctx, favIDs)
		if err != nil {
			return nil, fmt.Errorf("smart album: load favorite assets: %w", err)
		}
		return orderAssetsByIDs(favIDs, rows), nil
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
		// Resolve cluster asset IDs in a single batched query rather than
		// one GetByID per id. A face cluster for a popular subject can
		// reach 50-200 photos and this path is reachable by anonymous
		// public-gallery visitors, so the old per-id loop was a genuine
		// N+1. Deleted/missing assets are dropped (not an error);
		// orderAssetsByIDs preserves the resolver's cluster ordering.
		rows, err := assetRepo.GetByIDs(ctx, clusterAssets)
		if err != nil {
			return nil, fmt.Errorf("smart album: load cluster assets: %w", err)
		}
		return orderAssetsByIDs(clusterAssets, rows), nil
	}

	return assetRepo.List(ctx, f)
}

// orderAssetsByIDs reshapes the unordered result of a batched
// AssetRepo.GetByIDs lookup back into the order of the requested ids.
//
// Smart-album sources (favorites = most-favorited-first, face clusters =
// resolver order) carry meaningful ordering that a single
// `WHERE id = ANY($1)` query does not preserve, so we index the fetched
// assets by id and walk the original id slice. IDs that did not resolve
// (deleted/missing assets) are skipped — matching the skip-missing
// behavior of the per-id GetByID loops this replaced. Returns a non-nil
// empty slice when nothing matched so callers never have to nil-check.
func orderAssetsByIDs(ids []uuid.UUID, assets []*repository.Asset) []repository.Asset {
	byID := make(map[uuid.UUID]*repository.Asset, len(assets))
	for _, a := range assets {
		if a != nil {
			byID[a.ID] = a
		}
	}
	out := make([]repository.Asset, 0, len(ids))
	for _, id := range ids {
		if a, ok := byID[id]; ok {
			out = append(out, *a)
		}
	}
	return out
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
//
// 2026-05-18: "RAW" smart album dropped from the seed list. The
// content_type=image/x- filter caught raw camera files (CR2, NEF, ARW,
// DNG, RAF) but raw originals are never exposed to clients — the gallery
// only serves WebP derivatives, so a guest-facing "RAW" chip surfaced
// nothing they could open. Photographers managing the dashboard side
// also have no use for filtering by raw container type since every
// thumbnail is already WebP regardless of origin. Existing galleries
// still have a "RAW" row in the DB; the frontend filters it out at the
// list-API layer (lib/api/galleries.ts) so the chip disappears for
// both new and historical galleries without a data migration.
var UtilityAlbums = []struct {
	Name        string
	SmartFilter map[string]interface{}
}{
	{Name: "Favorites", SmartFilter: map[string]interface{}{"is_favorite": true}},
	{Name: "Videos", SmartFilter: map[string]interface{}{"content_type": "video/"}},
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
