package service

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

// Validation errors for attaching slideshow background music to a gallery.
// The handler maps these to HTTP 400; anything else is a 500.
var (
	ErrMusicAssetNotFound = errors.New("music asset not found in workspace")
	ErrMusicAssetNotAudio = errors.New("music asset must be an audio file")
	ErrMusicRepoUnwired   = errors.New("music validation unavailable: asset repo not wired")
)

type galleryAssetSource interface {
	GetByIDAndWorkspace(ctx context.Context, id, workspaceID uuid.UUID) (*repository.Asset, error)
	ListGroupedByDate(ctx context.Context, galleryID uuid.UUID, limit int) ([]repository.TimelineGroup, error)
}

type galleryAssetDeleteService interface {
	SoftDeleteManyForWorkspace(ctx context.Context, ids []uuid.UUID, workspaceID uuid.UUID) (int64, error)
}

// GalleryService handles gallery business logic.
type GalleryService struct {
	galleryRepo      *repository.GalleryRepo
	galleryAssetRepo *repository.GalleryAssetRepo
	coverSvc         *GalleryCoverService
	assetRepo        galleryAssetSource
	assetDeleteSvc   galleryAssetDeleteService
	albumSvc         *AlbumService
}

// NewGalleryService creates a new GalleryService.
func NewGalleryService(gr *repository.GalleryRepo, gar *repository.GalleryAssetRepo, cs *GalleryCoverService) *GalleryService {
	return &GalleryService{galleryRepo: gr, galleryAssetRepo: gar, coverSvc: cs}
}

// WithAssetRepo attaches the asset repo for timeline queries.
func (s *GalleryService) WithAssetRepo(ar *repository.AssetRepo) *GalleryService {
	if ar == nil {
		s.assetRepo = nil
		return s
	}
	s.assetRepo = ar
	return s
}

// WithAssetDeleteService attaches the asset delete workflow used when a whole
// gallery is removed. It lets gallery deletion clean up originals, derivatives,
// and storage accounting for assets not shared with another live gallery.
func (s *GalleryService) WithAssetDeleteService(assetDeleteSvc galleryAssetDeleteService) *GalleryService {
	s.assetDeleteSvc = assetDeleteSvc
	return s
}

// WithAlbumService attaches album service for utility album seeding on gallery create.
func (s *GalleryService) WithAlbumService(as *AlbumService) *GalleryService {
	s.albumSvc = as
	return s
}

// CreateInput holds the input for creating a gallery.
type CreateGalleryInput struct {
	WorkspaceID      uuid.UUID
	Title            string
	Description      string
	GalleryType      string
	CreatedBy        uuid.UUID
	ContactID        *uuid.UUID
	PrimaryContactID *uuid.UUID
	ProjectID        *uuid.UUID
	EventID          *uuid.UUID
	DealID           *uuid.UUID
	InvoiceID        *uuid.UUID
	// M23: camera tethering (migration 133).
	TetheringEnabled bool
	TetherDirectory  *string
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
	primaryContactID := input.PrimaryContactID
	if primaryContactID == nil {
		primaryContactID = input.ContactID
	}
	contactID := input.ContactID
	if contactID == nil {
		contactID = primaryContactID
	}

	g := &repository.Gallery{
		WorkspaceID:      input.WorkspaceID,
		Title:            input.Title,
		Description:      input.Description,
		GalleryType:      input.GalleryType,
		Status:           "draft",
		CreatedBy:        &input.CreatedBy,
		ContactID:        contactID,
		PrimaryContactID: primaryContactID,
		ProjectID:        input.ProjectID,
		EventID:          input.EventID,
		DealID:           input.DealID,
		InvoiceID:        input.InvoiceID,
		Settings:         map[string]interface{}{},
		WatermarkConfig:  map[string]interface{}{},
		TetheringEnabled: input.TetheringEnabled,
		TetherDirectory:  input.TetherDirectory,
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

// GalleryWorkspaceLifecycleState normalizes the gallery lifecycle language
// used by CRM, gallery workspace, and public sharing surfaces.
func GalleryWorkspaceLifecycleState(g *repository.Gallery) string {
	if g == nil {
		return "unknown"
	}
	if g.DeletedAt != nil || g.Status == "deleted" {
		return "deleted"
	}
	if g.ArchivedAt != nil || g.Status == "archived" {
		return "archived"
	}
	if g.IsPublished || g.PublishedAt != nil || g.Status == "shared" || g.Status == "protected" || g.Status == "published" {
		return "shared"
	}
	if g.Status != "" {
		return g.Status
	}
	return "draft"
}

// GetByID retrieves a gallery by ID.
func (s *GalleryService) GetByID(ctx context.Context, id uuid.UUID) (*repository.Gallery, error) {
	return s.galleryRepo.GetByID(ctx, id)
}

// GetBySlug retrieves a gallery by slug (for public access).
//
// Unscoped lookup against galleries.slug — used by the legacy
// `https://rawdrive.in/g/<slug>` URL pattern. Works because every gallery's
// slug includes an 8-char UUID suffix from generateSlug, so cross-workspace
// collisions are astronomically rare. The per-business subdomain path
// (migration 121) doesn't go through here — it calls
// GetByBusinessSubdomainAndSlug directly with explicit workspace scope.
func (s *GalleryService) GetBySlug(ctx context.Context, slug string) (*repository.Gallery, error) {
	return s.galleryRepo.GetBySlug(ctx, slug)
}

// GetByBusinessSubdomainAndSlug resolves a gallery via the new per-business
// subdomain shape: <biz-slug>-<biz-code>.rawdrive.in/<gallery-slug>. The
// `subdomain` arg is the full leading label (e.g. "photoworks-a1b2c3d4");
// the last 8 chars after the trailing hyphen are the business_unique_code
// used for the workspace lookup. Returns nil, nil when the subdomain
// doesn't match the expected shape or when no gallery is found in that
// workspace — the caller falls back to the unscoped GetBySlug path.
func (s *GalleryService) GetByBusinessSubdomainAndSlug(ctx context.Context, subdomain, slug string) (*repository.Gallery, error) {
	// Subdomain shape: <slug>-<code> where code is exactly 8 alphanumeric chars
	// and the delimiter is a single hyphen. Anything shorter than 9 chars
	// (1 char of slug + '-' + 8 char code) can't be a valid business subdomain.
	if len(subdomain) < 10 {
		return nil, nil
	}
	dash := len(subdomain) - 9
	if subdomain[dash] != '-' {
		return nil, nil
	}
	code := subdomain[dash+1:]
	// Defensive: 8 lowercase alphanumerics. Migration 121 CHECK enforces
	// this at write time but the URL could carry garbage from a typo.
	if !isLowerAlnumExact(code, 8) {
		return nil, nil
	}
	return s.galleryRepo.GetBySlugScopedByBusinessCode(ctx, code, slug)
}

func isLowerAlnumExact(s string, n int) bool {
	if len(s) != n {
		return false
	}
	for i := 0; i < n; i++ {
		c := s[i]
		if !((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) {
			return false
		}
	}
	return true
}

// List lists galleries matching the filter.
func (s *GalleryService) List(ctx context.Context, f repository.GalleryFilter) ([]repository.Gallery, error) {
	return s.galleryRepo.List(ctx, f)
}

// Update updates a gallery.
func (s *GalleryService) Update(ctx context.Context, g *repository.Gallery) error {
	return s.galleryRepo.Update(ctx, g)
}

// SetGalleryMusic attaches (or clears) the slideshow background music track for
// a gallery. The audio is an asset that was already ingested through the normal
// upload path — so its bytes are stored in the workspace's B2 gallery storage
// and counted against the storage quota; this only records the reference.
//
// A nil musicAssetID clears the track. Otherwise the asset MUST belong to the
// caller's workspace (cross-tenant IDOR guard, same as cover/logo) and MUST be
// an audio file. Persisted via the allowlisted UpdateField so it does not need
// to ride the positional Update column set.
func (s *GalleryService) SetGalleryMusic(ctx context.Context, galleryID, workspaceID uuid.UUID, musicAssetID *uuid.UUID) error {
	if musicAssetID == nil {
		return s.galleryRepo.UpdateField(ctx, galleryID, "music_asset_id", nil)
	}
	if err := s.ValidateGalleryMusic(ctx, workspaceID, musicAssetID); err != nil {
		return err
	}
	return s.galleryRepo.UpdateField(ctx, galleryID, "music_asset_id", *musicAssetID)
}

// ValidateGalleryMusic verifies that a requested music asset belongs to the
// workspace and is an audio file without mutating the gallery. Handlers call it
// before saving other settings so an invalid music_asset_id cannot partially
// persist unrelated gallery edits.
func (s *GalleryService) ValidateGalleryMusic(ctx context.Context, workspaceID uuid.UUID, musicAssetID *uuid.UUID) error {
	if musicAssetID == nil {
		return nil
	}
	if s.assetRepo == nil {
		return ErrMusicRepoUnwired
	}
	asset, err := s.assetRepo.GetByIDAndWorkspace(ctx, *musicAssetID, workspaceID)
	if err != nil {
		return fmt.Errorf("gallery service set music: %w", err)
	}
	if asset == nil {
		return ErrMusicAssetNotFound
	}
	if !strings.HasPrefix(strings.ToLower(asset.ContentType), "audio/") {
		return ErrMusicAssetNotAudio
	}
	return nil
}

// SoftDelete deletes a gallery (soft).
func (s *GalleryService) SoftDelete(ctx context.Context, id uuid.UUID) error {
	return s.galleryRepo.SoftDelete(ctx, id)
}

// SoftDeleteForWorkspace deletes a gallery and also deletes the active assets
// that are not linked to any other live gallery. This keeps storage usage in
// sync with the gallery surface: deleting the last gallery should not leave
// orphaned originals consuming quota.
func (s *GalleryService) SoftDeleteForWorkspace(ctx context.Context, id, workspaceID uuid.UUID) error {
	var deletableAssetIDs []uuid.UUID
	if s.galleryAssetRepo != nil && s.assetDeleteSvc != nil {
		ids, err := s.galleryAssetRepo.ListDeletableAssetIDsForGallery(ctx, id)
		if err != nil {
			return fmt.Errorf("gallery service delete: list deletable assets: %w", err)
		}
		deletableAssetIDs = ids
	}

	if err := s.galleryRepo.SoftDelete(ctx, id); err != nil {
		return err
	}

	if len(deletableAssetIDs) > 0 && s.assetDeleteSvc != nil {
		if _, err := s.assetDeleteSvc.SoftDeleteManyForWorkspace(ctx, deletableAssetIDs, workspaceID); err != nil {
			return fmt.Errorf("gallery service delete: delete gallery assets: %w", err)
		}
	}
	return nil
}

// AddAsset adds an asset to a gallery and auto-sets cover if none.
//
// workspaceID is the caller's workspace (resolved by the handler's gallery
// ownership guard). The repo enforces, at the DB level, that the asset belongs
// to the same workspace as the gallery, so a caller cannot link a foreign
// asset id into its own gallery and read it back (cross-tenant exfiltration).
func (s *GalleryService) AddAsset(ctx context.Context, galleryID, assetID, workspaceID uuid.UUID, sortOrder int) error {
	if err := s.galleryAssetRepo.Add(ctx, galleryID, assetID, workspaceID, sortOrder); err != nil {
		return err
	}
	// Auto-set cover if gallery has no cover
	gallery, err := s.galleryRepo.GetByID(ctx, galleryID)
	if err != nil {
		return fmt.Errorf("gallery service add asset: %w", err)
	}
	if gallery == nil {
		return fmt.Errorf("gallery not found")
	}
	if gallery.CoverAssetID == nil && s.coverSvc != nil {
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

// DuplicateGallery creates a copy of a gallery with new ID/slug but same config.
func (s *GalleryService) DuplicateGallery(ctx context.Context, sourceID uuid.UUID, newTitle string, createdBy uuid.UUID) (*repository.Gallery, error) {
	return s.galleryRepo.Duplicate(ctx, sourceID, newTitle, createdBy)
}

// ReorderAssets updates sort_order for multiple assets in a gallery.
func (s *GalleryService) ReorderAssets(ctx context.Context, galleryID uuid.UUID, items []repository.ReorderItem) error {
	return s.galleryAssetRepo.Reorder(ctx, galleryID, items)
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
