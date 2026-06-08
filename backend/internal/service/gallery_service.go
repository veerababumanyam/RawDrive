package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

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

// gallerySlugResolver is the narrow DB-backed slug-resolve seam the public
// metadata cache wraps. *repository.GalleryRepo satisfies it; tests substitute a
// counting fake so they can prove repeated views of one open public slug
// collapse to a single DB read (PUB-CACHE).
type gallerySlugResolver interface {
	GetBySlug(ctx context.Context, slug string) (*repository.Gallery, error)
	GetBySlugScopedByBusinessCode(ctx context.Context, businessCode, slug string) (*repository.Gallery, error)
}

// galleryWriter is the narrow DB write seam Update routes through.
// *repository.GalleryRepo satisfies it; tests substitute a no-op writer so the
// cache-invalidation-after-write contract can be exercised without a DB.
type galleryWriter interface {
	Update(ctx context.Context, g *repository.Gallery) error
}

// sharedGalleryCache is the optional cross-node (Valkey) backing for the public
// gallery-metadata cache. When wired (via WithSharedCache in main.go) it is the
// cache source of truth so all app nodes (.42/.44) agree and an invalidation on
// one node is seen by the others; nil = in-process map only (single node / no
// Valkey). All ops are best-effort: a cache error never fails the caller — it
// degrades to a DB read. Mirrors the CACHE-5 sharedPolicyCache / CACHE-4
// sharedAnalyticsCache seam (same Get/Set/Del-over-JSON-bytes shape, same
// best-effort contract).
type sharedGalleryCache interface {
	Get(ctx context.Context, key string) ([]byte, bool, error)
	Set(ctx context.Context, key string, val []byte, ttl time.Duration)
	Del(ctx context.Context, key string)
}

// publicGalleryCacheTTL is the short TTL for cached PUBLISHED + OPEN public
// gallery metadata. It is the staleness bound: even without an explicit
// invalidation, a cached entry self-heals within this window. Kept short (well
// inside the PUB-CACHE 10–30s spec) so a publish / settings edit is reflected
// promptly while still collapsing the high-volume anonymous read burst.
const publicGalleryCacheTTL = 15 * time.Second

// galleryCacheSharedOpTimeout bounds each shared-cache round trip so a slow or
// unreachable Valkey can never stall a public gallery read.
const galleryCacheSharedOpTimeout = 2 * time.Second

// GalleryService handles gallery business logic.
type GalleryService struct {
	galleryRepo      *repository.GalleryRepo
	galleryAssetRepo *repository.GalleryAssetRepo
	coverSvc         *GalleryCoverService
	assetRepo        galleryAssetSource
	assetDeleteSvc   galleryAssetDeleteService
	albumSvc         *AlbumService

	// slugResolver is the DB-backed slug-resolve seam the public metadata cache
	// reads through on a miss. Defaults to the concrete galleryRepo; a test can
	// inject a counting fake via newGalleryServiceForCacheTest.
	slugResolver gallerySlugResolver

	// writer is the DB write seam Update routes through. Defaults to the concrete
	// galleryRepo; a test injects a no-op writer to exercise invalidation.
	writer galleryWriter

	// Public gallery-metadata cache (PUB-CACHE). Only PUBLISHED + OPEN
	// (token-free, non-password, public/unlisted) galleries are ever cached —
	// session-bound (password / share / private / invite-only) and unpublished
	// galleries are NEVER cached, so a per-viewer or draft body can never be
	// served to the wrong anonymous client (PERF-HDR confidentiality contract).
	cacheMu     sync.RWMutex
	publicCache map[string]cachedGallery // in-process fallback when shared == nil
	sharedCache sharedGalleryCache       // optional cross-node (Valkey) backing
}

// cachedGallery is one in-process cached public gallery plus its absolute
// expiry. The gallery is held as a JSON snapshot (not a live *Gallery pointer)
// so every cacheGet returns a FRESH, independent copy. This is a confidentiality
// requirement, not just hygiene: the public handler mutates the returned
// gallery's Settings map in place (cover thumbnails, has_password, and — for a
// session-bound view — a per-viewer asset_access_token). Sharing one pointer
// across requests would let one viewer's mutations (including that per-viewer
// token) bleed into the entry served to the next anonymous viewer. Serializing
// here makes the in-process path match the shared-Valkey path, which already
// deserializes a fresh object per read.
type cachedGallery struct {
	snapshot  []byte
	expiresAt time.Time
}

// NewGalleryService creates a new GalleryService.
func NewGalleryService(gr *repository.GalleryRepo, gar *repository.GalleryAssetRepo, cs *GalleryCoverService) *GalleryService {
	s := &GalleryService{
		galleryRepo:      gr,
		galleryAssetRepo: gar,
		coverSvc:         cs,
		publicCache:      make(map[string]cachedGallery),
	}
	// Default the cache's read-through + write seams to the concrete repo. A nil
	// repo (unit-test construction) leaves it usable: the cache simply never warms.
	if gr != nil {
		s.slugResolver = gr
		s.writer = gr
	}
	return s
}

// WithSharedCache wires a cross-node (Valkey) backing for the public
// gallery-metadata cache. main.go calls this during bootstrap when Valkey is
// available so both app nodes share one cache and an invalidation on either node
// is seen by the other. Passing nil keeps the in-process cache. Returns the same
// pointer so the call chains. Mirrors WorkspacePolicyService.WithSharedCache
// (CACHE-5) and StorageAccounting.WithSharedCache (CACHE-4).
func (s *GalleryService) WithSharedCache(c sharedGalleryCache) *GalleryService {
	if c != nil {
		s.sharedCache = c
	}
	return s
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
	if err := s.galleryRepo.UpdateField(ctx, galleryID, "face_detection_enabled", enabled); err != nil {
		return err
	}
	// face_detection_enabled feeds the public viewer's Photo Search affordance —
	// invalidate so the toggle is reflected on the next public view.
	s.invalidatePublicGallery(ctx, g.Slug)
	return nil
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
// Unscoped lookup against galleries.slug — used by the canonical
// `https://rawdrive.in/g/<slug>` URL pattern. Works because every gallery's
// slug includes an 8-char UUID suffix from generateSlug, so cross-workspace
// collisions are astronomically rare. Legacy workspace-scoped requests call
// GetByBusinessSubdomainAndSlug directly with explicit workspace scope.
func (s *GalleryService) GetBySlug(ctx context.Context, slug string) (*repository.Gallery, error) {
	key := publicGalleryCacheKey(slug)
	if g, ok := s.cacheGet(ctx, key); ok {
		return g, nil
	}
	g, err := s.resolver().GetBySlug(ctx, slug)
	if err != nil {
		return nil, err
	}
	// Only PUBLISHED + OPEN (token-free, non-password, public/unlisted)
	// galleries are cacheable — never a session-bound or draft body.
	if isCacheablePublicGallery(g) {
		s.cacheSet(ctx, key, g)
	}
	return g, nil
}

// GetByBusinessSubdomainAndSlug resolves a gallery via the deprecated
// migration-121 workspace scope token (<biz-slug>-<biz-code>). The last 8
// chars after the trailing hyphen are the business_unique_code used for the
// workspace lookup. Returns nil, nil when the token doesn't match the expected
// shape or when no gallery is found in that workspace — the caller falls back
// to the unscoped GetBySlug path.
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
	// Cache key is scoped to BOTH the business code and the slug so a request
	// pairing a valid slug with the WRONG business code can never be served a
	// cached row from another scope — a wrong code misses the cache and falls to
	// the scoped DB query (which returns nil for a cross-scope mismatch).
	key := publicGalleryBusinessCacheKey(code, slug)
	if g, ok := s.cacheGet(ctx, key); ok {
		return g, nil
	}
	g, err := s.resolver().GetBySlugScopedByBusinessCode(ctx, code, slug)
	if err != nil {
		return nil, err
	}
	if isCacheablePublicGallery(g) {
		s.cacheSet(ctx, key, g)
	}
	return g, nil
}

// resolver returns the DB-backed slug-resolve seam. Defaults to the concrete
// galleryRepo; a test injects a counting fake. Returns nil only on a degraded
// (no-repo) construction, which callers below guard against.
func (s *GalleryService) resolver() gallerySlugResolver {
	if s.slugResolver != nil {
		return s.slugResolver
	}
	return s.galleryRepo
}

// publicGalleryCacheKey is the shared-backing key for the legacy apex
// `/g/<slug>` lookup. Namespaced so it can never collide with other shared
// caches on the same Valkey (CACHE-4/CACHE-5 convention).
func publicGalleryCacheKey(slug string) string {
	return "gallery:pubmeta:slug:" + slug
}

// publicGalleryBusinessCacheKey is the shared-backing key for the per-business
// subdomain lookup, scoped to the business code so cross-scope reuse is
// impossible.
func publicGalleryBusinessCacheKey(code, slug string) string {
	return "gallery:pubmeta:biz:" + code + ":" + slug
}

// isCacheablePublicGallery reports whether a gallery may enter the shared public
// metadata cache. ONLY published, non-expired, non-password, public/unlisted
// galleries qualify. Password-protected, private/invite-only, unpublished, and
// expired galleries are session-bound or draft and must NEVER be shared-cached
// (PERF-HDR confidentiality contract: their bodies carry per-viewer secrets or
// are not meant for anonymous delivery).
func isCacheablePublicGallery(g *repository.Gallery) bool {
	if g == nil || !g.IsPublished {
		return false
	}
	if g.PasswordHash != nil && *g.PasswordHash != "" {
		return false
	}
	if g.ExpiresAt != nil && g.ExpiresAt.Before(time.Now().UTC()) {
		return false
	}
	mode := strings.ToLower(strings.TrimSpace(g.AccessMode))
	// Empty mode is the legacy "public" default; only explicit public/unlisted
	// (or empty) are open. Anything else (private, invite-only) is gated.
	switch mode {
	case "", "public", "unlisted":
		return true
	default:
		return false
	}
}

// cacheGet returns a cached public gallery if present and live. When a shared
// (Valkey) backing is wired it consults that so every node reads the same value;
// otherwise it reads the in-process map. A shared-cache miss/error is a clean
// miss so the caller degrades to a DB read — a Valkey outage never fails a read.
func (s *GalleryService) cacheGet(ctx context.Context, key string) (*repository.Gallery, bool) {
	if s.sharedCache != nil {
		opCtx, cancel := context.WithTimeout(ctx, galleryCacheSharedOpTimeout)
		defer cancel()
		raw, ok, err := s.sharedCache.Get(opCtx, key)
		if err != nil || !ok {
			return nil, false
		}
		var g repository.Gallery
		if json.Unmarshal(raw, &g) != nil {
			return nil, false
		}
		return &g, true
	}

	s.cacheMu.RLock()
	entry, ok := s.publicCache[key]
	s.cacheMu.RUnlock()
	if !ok || !time.Now().Before(entry.expiresAt) {
		return nil, false
	}
	var g repository.Gallery
	if json.Unmarshal(entry.snapshot, &g) != nil {
		return nil, false
	}
	return &g, true
}

// cacheSet stores a cacheable public gallery under the short TTL. When a shared
// (Valkey) backing is wired the write goes there so the entry is visible to
// every app node; otherwise it lands in the in-process map.
func (s *GalleryService) cacheSet(ctx context.Context, key string, g *repository.Gallery) {
	if g == nil {
		return
	}
	raw, err := json.Marshal(g)
	if err != nil {
		return
	}
	if s.sharedCache != nil {
		opCtx, cancel := context.WithTimeout(ctx, galleryCacheSharedOpTimeout)
		defer cancel()
		s.sharedCache.Set(opCtx, key, raw, publicGalleryCacheTTL)
		return
	}
	s.cacheMu.Lock()
	defer s.cacheMu.Unlock()
	s.publicCache[key] = cachedGallery{snapshot: raw, expiresAt: time.Now().Add(publicGalleryCacheTTL)}
}

// invalidatePublicGallery drops the cached metadata for a gallery's apex-slug
// key so the next public view re-reads the DB and serves the new metadata. It is
// called by every mutate path (Update / publish / delete / settings change) so a
// photographer edit is reflected promptly instead of waiting out the TTL.
//
// Keying note: a gallery's slug is globally unique (8-char UUID suffix) and its
// workspace is immutable, so the apex-slug key uniquely identifies the gallery.
// The deprecated workspace-scoped cache key (publicGalleryBusinessCacheKey) is
// NOT invalidated here because that requires the business code, which the mutate
// paths key by gallery ID and would need an extra workspace query to derive;
// instead it self-heals within the short publicGalleryCacheTTL. The canonical
// apex `/g/<slug>` path is invalidated exactly.
func (s *GalleryService) invalidatePublicGallery(ctx context.Context, slug string) {
	if slug == "" {
		return
	}
	key := publicGalleryCacheKey(slug)
	if s.sharedCache != nil {
		opCtx, cancel := context.WithTimeout(ctx, galleryCacheSharedOpTimeout)
		defer cancel()
		s.sharedCache.Del(opCtx, key)
		return
	}
	s.cacheMu.Lock()
	defer s.cacheMu.Unlock()
	delete(s.publicCache, key)
}

// invalidatePublicGalleryByID resolves the gallery's slug (best-effort) and
// drops its cached apex-slug metadata. Used by the ID-keyed mutate paths
// (publish/transition/delete/field updates) that don't already hold the full
// gallery row. A lookup failure is swallowed: the worst case is the entry
// self-healing on its short TTL rather than instantly.
func (s *GalleryService) invalidatePublicGalleryByID(ctx context.Context, galleryID uuid.UUID) {
	if s.galleryRepo == nil {
		return
	}
	g, err := s.galleryRepo.GetByID(ctx, galleryID)
	if err != nil || g == nil {
		return
	}
	s.invalidatePublicGallery(ctx, g.Slug)
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

// Update updates a gallery. It invalidates the cached public metadata for the
// gallery's slug so a settings / title / publish-state / access-mode change is
// reflected on the next public view instead of waiting out the TTL (PUB-CACHE).
func (s *GalleryService) Update(ctx context.Context, g *repository.Gallery) error {
	w := galleryWriter(s.galleryRepo)
	if s.writer != nil {
		w = s.writer
	}
	if err := w.Update(ctx, g); err != nil {
		return err
	}
	if g != nil {
		s.invalidatePublicGallery(ctx, g.Slug)
	}
	return nil
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
		if err := s.galleryRepo.UpdateField(ctx, galleryID, "music_asset_id", nil); err != nil {
			return err
		}
		s.invalidatePublicGalleryByID(ctx, galleryID)
		return nil
	}
	if err := s.ValidateGalleryMusic(ctx, workspaceID, musicAssetID); err != nil {
		return err
	}
	if err := s.galleryRepo.UpdateField(ctx, galleryID, "music_asset_id", *musicAssetID); err != nil {
		return err
	}
	// The public viewer reads music_asset_id to enable the slideshow soundtrack —
	// invalidate so the change is reflected on the next public view.
	s.invalidatePublicGalleryByID(ctx, galleryID)
	return nil
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
	// Resolve the slug for cache invalidation BEFORE the soft-delete, since the
	// delete makes GetByID return nil afterwards (deleted_at IS NULL filter).
	s.invalidatePublicGalleryByID(ctx, id)
	return s.galleryRepo.SoftDelete(ctx, id)
}

// SoftDeleteForWorkspace deletes a gallery and also deletes the active assets
// that are not linked to any other live gallery. This keeps storage usage in
// sync with the gallery surface: deleting the last gallery should not leave
// orphaned originals consuming quota.
func (s *GalleryService) SoftDeleteForWorkspace(ctx context.Context, id, workspaceID uuid.UUID) error {
	// Invalidate cached public metadata BEFORE the soft-delete (GetByID returns
	// nil for a deleted gallery), so the public surface stops serving it promptly.
	s.invalidatePublicGalleryByID(ctx, id)

	if err := s.galleryRepo.SoftDelete(ctx, id); err != nil {
		return err
	}

	if s.galleryAssetRepo != nil && s.assetDeleteSvc != nil {
		orphanedAssetIDs, err := s.galleryAssetRepo.ListOrphanedAssetIDsForWorkspace(ctx, workspaceID)
		if err != nil {
			return fmt.Errorf("gallery service delete: list orphaned assets: %w", err)
		}
		if len(orphanedAssetIDs) == 0 {
			return nil
		}
		if _, err := s.assetDeleteSvc.SoftDeleteManyForWorkspace(ctx, orphanedAssetIDs, workspaceID); err != nil {
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
		if err := s.coverSvc.AutoSetCover(ctx, galleryID); err != nil {
			return fmt.Errorf("gallery service add asset cover: %w", err)
		}
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
	if gallery != nil && gallery.CoverAssetID != nil && *gallery.CoverAssetID == assetID && s.coverSvc != nil {
		if err := s.coverSvc.AutoSetCover(ctx, galleryID); err != nil {
			return fmt.Errorf("gallery service remove asset cover: %w", err)
		}
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

	if err := s.galleryRepo.UpdateStatus(ctx, galleryID, string(targetState)); err != nil {
		return err
	}
	// A lifecycle change (publish/archive/restore) flips the gallery's public
	// visibility — drop its cached metadata so the change is seen immediately.
	s.invalidatePublicGallery(ctx, gallery.Slug)
	return nil
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
