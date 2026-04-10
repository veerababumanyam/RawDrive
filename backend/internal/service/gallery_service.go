package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

// GalleryService handles gallery business logic.
type GalleryService struct {
	galleryRepo      *repository.GalleryRepo
	galleryAssetRepo *repository.GalleryAssetRepo
	coverSvc         *GalleryCoverService
	assetRepo        *repository.AssetRepo
	albumSvc         *AlbumService
}

// NewGalleryService creates a new GalleryService.
func NewGalleryService(gr *repository.GalleryRepo, gar *repository.GalleryAssetRepo, cs *GalleryCoverService) *GalleryService {
	return &GalleryService{galleryRepo: gr, galleryAssetRepo: gar, coverSvc: cs}
}

// WithAssetRepo attaches the asset repo for timeline queries.
func (s *GalleryService) WithAssetRepo(ar *repository.AssetRepo) *GalleryService {
	s.assetRepo = ar
	return s
}

// WithAlbumService attaches album service for utility album seeding on gallery create.
func (s *GalleryService) WithAlbumService(as *AlbumService) *GalleryService {
	s.albumSvc = as
	return s
}

// CreateInput holds the input for creating a gallery.
type CreateGalleryInput struct {
	WorkspaceID uuid.UUID
	Title       string
	Description string
	GalleryType string
	CreatedBy   uuid.UUID
}

// SetFaceDetectionEnabled toggles the privacy opt-out flag for face
// detection on a gallery (M3 E8-S1 #6). When false, the face worker skips
// all jobs targeting this gallery. Returns an error if the gallery does
// not exist.
func (s *GalleryService) SetFaceDetectionEnabled(ctx context.Context, galleryID uuid.UUID, enabled bool) error {
	g, err := s.galleryRepo.GetByID(ctx, galleryID)
	if err != nil {
		return fmt.Errorf("get gallery: %w", err)
	}
	if g == nil {
		return fmt.Errorf("gallery not found")
	}
	return s.galleryRepo.UpdateField(ctx, galleryID, "face_detection_enabled", enabled)
}

// Create creates a new gallery.
func (s *GalleryService) Create(ctx context.Context, input CreateGalleryInput) (*repository.Gallery, error) {
	g := &repository.Gallery{
		WorkspaceID: input.WorkspaceID,
		Title:       input.Title,
		Description: input.Description,
		GalleryType: input.GalleryType,
		Status:      "draft",
		CreatedBy:   &input.CreatedBy,
		Settings:    map[string]interface{}{},
		WatermarkConfig: map[string]interface{}{},
	}
	if err := s.galleryRepo.Create(ctx, g); err != nil {
		return nil, err
	}

	// Seed utility smart albums (Favorites, Videos, RAW)
	if s.albumSvc != nil {
		_ = s.albumSvc.SeedUtilityAlbums(ctx, g.ID) // best-effort
	}

	return g, nil
}

// GetByID retrieves a gallery by ID.
func (s *GalleryService) GetByID(ctx context.Context, id uuid.UUID) (*repository.Gallery, error) {
	return s.galleryRepo.GetByID(ctx, id)
}

// GetBySlug retrieves a gallery by slug (for public access).
func (s *GalleryService) GetBySlug(ctx context.Context, slug string) (*repository.Gallery, error) {
	return s.galleryRepo.GetBySlug(ctx, slug)
}

// List lists galleries matching the filter.
func (s *GalleryService) List(ctx context.Context, f repository.GalleryFilter) ([]repository.Gallery, error) {
	return s.galleryRepo.List(ctx, f)
}

// Update updates a gallery.
func (s *GalleryService) Update(ctx context.Context, g *repository.Gallery) error {
	return s.galleryRepo.Update(ctx, g)
}

// SoftDelete deletes a gallery (soft).
func (s *GalleryService) SoftDelete(ctx context.Context, id uuid.UUID) error {
	return s.galleryRepo.SoftDelete(ctx, id)
}

// AddAsset adds an asset to a gallery and auto-sets cover if none.
func (s *GalleryService) AddAsset(ctx context.Context, galleryID, assetID uuid.UUID, sortOrder int) error {
	if err := s.galleryAssetRepo.Add(ctx, galleryID, assetID, sortOrder); err != nil {
		return err
	}
	// Auto-set cover if gallery has no cover
	gallery, err := s.galleryRepo.GetByID(ctx, galleryID)
	if err != nil {
		return fmt.Errorf("gallery service add asset: %w", err)
	}
	if gallery != nil && gallery.CoverAssetID == nil {
		s.coverSvc.AutoSetCover(ctx, galleryID)
	}
	return nil
}

// RemoveAsset removes an asset from a gallery and updates cover if needed.
func (s *GalleryService) RemoveAsset(ctx context.Context, galleryID, assetID uuid.UUID) error {
	if err := s.galleryAssetRepo.Remove(ctx, galleryID, assetID); err != nil {
		return err
	}
	// If removed asset was the cover, auto-select new cover
	gallery, err := s.galleryRepo.GetByID(ctx, galleryID)
	if err != nil {
		return fmt.Errorf("gallery service remove asset: %w", err)
	}
	if gallery != nil && gallery.CoverAssetID != nil && *gallery.CoverAssetID == assetID {
		s.coverSvc.AutoSetCover(ctx, galleryID)
	}
	return nil
}

// ListAssets returns all assets in a gallery.
func (s *GalleryService) ListAssets(ctx context.Context, galleryID uuid.UUID) ([]repository.GalleryAsset, error) {
	return s.galleryAssetRepo.ListByGallery(ctx, galleryID)
}

// GetTimeline returns assets grouped by capture/creation date for timeline view.
func (s *GalleryService) GetTimeline(ctx context.Context, galleryID uuid.UUID) ([]repository.TimelineGroup, error) {
	if s.assetRepo == nil {
		return nil, fmt.Errorf("timeline: asset repo not configured")
	}
	return s.assetRepo.ListGroupedByDate(ctx, galleryID, 200)
}

// ──────────────────────── Gallery State Machine (ISS-016) ────────────────────────

// GalleryState represents valid gallery lifecycle states.
type GalleryState string

const (
	GalleryDraft     GalleryState = "draft"
	GalleryShared    GalleryState = "shared"
	GalleryExpired   GalleryState = "expired"
	GalleryProtected GalleryState = "protected"
	GalleryArchived  GalleryState = "archived"
	GalleryDeleted   GalleryState = "deleted"
)

// ValidGalleryTransitions maps current state to allowed next states.
var ValidGalleryTransitions = map[GalleryState][]GalleryState{
	GalleryDraft:     {GalleryShared, GalleryProtected, GalleryArchived, GalleryDeleted},
	GalleryShared:    {GalleryDraft, GalleryExpired, GalleryArchived, GalleryDeleted},
	GalleryExpired:   {GalleryShared, GalleryArchived, GalleryDeleted},
	GalleryProtected: {GalleryShared, GalleryDraft, GalleryArchived, GalleryDeleted},
	GalleryArchived:  {GalleryDraft, GalleryDeleted},
	GalleryDeleted:   {GalleryDraft}, // Restore from deleted
}

// CanTransitionGallery checks if a gallery state transition is valid.
func CanTransitionGallery(from, to GalleryState) bool {
	allowed, ok := ValidGalleryTransitions[from]
	if !ok {
		return false
	}
	for _, s := range allowed {
		if s == to {
			return true
		}
	}
	return false
}

// TransitionGalleryState changes a gallery's lifecycle state with validation.
func (s *GalleryService) TransitionGalleryState(ctx context.Context, galleryID uuid.UUID, targetState GalleryState) error {
	gallery, err := s.galleryRepo.GetByID(ctx, galleryID)
	if err != nil || gallery == nil {
		return fmt.Errorf("gallery not found")
	}

	currentState := GalleryState(gallery.Status)
	if !CanTransitionGallery(currentState, targetState) {
		return fmt.Errorf("invalid gallery transition from %s to %s", currentState, targetState)
	}

	return s.galleryRepo.UpdateStatus(ctx, galleryID, string(targetState))
}

// Publish transitions a gallery from draft to shared.
func (s *GalleryService) Publish(ctx context.Context, galleryID uuid.UUID) error {
	return s.TransitionGalleryState(ctx, galleryID, GalleryShared)
}

// Archive transitions a gallery to archived.
func (s *GalleryService) Archive(ctx context.Context, galleryID uuid.UUID) error {
	return s.TransitionGalleryState(ctx, galleryID, GalleryArchived)
}

// Restore transitions a deleted/archived gallery back to draft.
func (s *GalleryService) Restore(ctx context.Context, galleryID uuid.UUID) error {
	return s.TransitionGalleryState(ctx, galleryID, GalleryDraft)
}
