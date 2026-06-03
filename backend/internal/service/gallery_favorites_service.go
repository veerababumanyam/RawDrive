package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
)

// GalleryFavoritesService is the thin coordination layer between the
// public/owner handlers and the favorites repository. The repo handles
// SQL; this service enforces business rules:
//
//   - public endpoints resolve {slug} → gallery and reject unpublished /
//     expired galleries (matches PublicAssetDownload semantics)
//   - owner endpoint resolves by gallery ID (no publish gate — owners can
//     see favorites on unpublished galleries because they may be doing a
//     pre-publish review)
//   - guest_session_id is required and non-empty (anonymous, but not
//     unattributed — every favorite must trace to a session so DELETE
//     can scope correctly)
//
// Errors are sentinel values so handlers can map them to HTTP statuses
// without string-matching.
var (
	ErrGalleryFavoritesNotFound       = errors.New("gallery not found")
	ErrGalleryFavoritesNotPublished   = errors.New("gallery is not published")
	ErrGalleryFavoritesExpired        = errors.New("gallery has expired")
	ErrGalleryFavoritesMissingSession = errors.New("guest_session_id is required")
	ErrGalleryFavoritesInvalidAssetID = errors.New("invalid asset id")
)

type GalleryFavoritesService struct {
	favRepo     *repository.GalleryFavoritesRepo
	galleryRepo *repository.GalleryRepo
}

func NewGalleryFavoritesService(fr *repository.GalleryFavoritesRepo, gr *repository.GalleryRepo) *GalleryFavoritesService {
	return &GalleryFavoritesService{favRepo: fr, galleryRepo: gr}
}

// AddFavoriteBySlug is called by the public POST endpoint. Resolves slug,
// enforces publish + expiry gates, then idempotently writes the favorite.
func (s *GalleryFavoritesService) AddFavoriteBySlug(
	ctx context.Context,
	slug string,
	assetID uuid.UUID,
	guestSessionID string,
) error {
	gallery, err := s.galleryRepo.GetBySlug(ctx, slug)
	if err != nil {
		return fmt.Errorf("favorites: lookup gallery by slug: %w", err)
	}
	return s.AddFavorite(ctx, gallery, assetID, guestSessionID)
}

// AddFavorite is called by public handlers that already resolved the gallery,
// including workspace-scoped public URLs. It enforces publish/expiry/session
// rules before idempotently writing the favorite.
func (s *GalleryFavoritesService) AddFavorite(
	ctx context.Context,
	gallery *repository.Gallery,
	assetID uuid.UUID,
	guestSessionID string,
) error {
	if err := s.validatePublicFavoriteRequest(gallery, guestSessionID); err != nil {
		return err
	}
	return s.favRepo.Upsert(ctx, &repository.GalleryFavorite{
		GalleryID:      gallery.ID,
		AssetID:        assetID,
		GuestSessionID: strings.TrimSpace(guestSessionID),
	})
}

// RemoveFavoriteBySlug is the public DELETE counterpart. Same publish +
// expiry gates so a guest can't unfavorite against an unpublished gallery.
func (s *GalleryFavoritesService) RemoveFavoriteBySlug(
	ctx context.Context,
	slug string,
	assetID uuid.UUID,
	guestSessionID string,
) error {
	gallery, err := s.galleryRepo.GetBySlug(ctx, slug)
	if err != nil {
		return fmt.Errorf("favorites: lookup gallery by slug: %w", err)
	}
	return s.RemoveFavorite(ctx, gallery, assetID, guestSessionID)
}

// RemoveFavorite is the public DELETE counterpart for a pre-resolved gallery.
func (s *GalleryFavoritesService) RemoveFavorite(
	ctx context.Context,
	gallery *repository.Gallery,
	assetID uuid.UUID,
	guestSessionID string,
) error {
	if err := s.validatePublicFavoriteRequest(gallery, guestSessionID); err != nil {
		return err
	}
	return s.favRepo.Delete(ctx, gallery.ID, assetID, strings.TrimSpace(guestSessionID))
}

// ListSessionBySlug is the public GET — returns the asset IDs this guest
// session has favorited so the frontend can repaint Star button state.
func (s *GalleryFavoritesService) ListSessionBySlug(
	ctx context.Context,
	slug string,
	guestSessionID string,
) ([]uuid.UUID, error) {
	gallery, err := s.galleryRepo.GetBySlug(ctx, slug)
	if err != nil {
		return nil, fmt.Errorf("favorites: lookup gallery by slug: %w", err)
	}
	return s.ListSession(ctx, gallery, guestSessionID)
}

// ListSession returns a guest session's favorite asset IDs for a pre-resolved
// public gallery.
func (s *GalleryFavoritesService) ListSession(
	ctx context.Context,
	gallery *repository.Gallery,
	guestSessionID string,
) ([]uuid.UUID, error) {
	if err := s.validatePublicFavoriteRequest(gallery, guestSessionID); err != nil {
		return nil, err
	}
	return s.favRepo.ListSessionAssetIDs(ctx, gallery.ID, strings.TrimSpace(guestSessionID))
}

func (s *GalleryFavoritesService) validatePublicFavoriteRequest(gallery *repository.Gallery, guestSessionID string) error {
	if strings.TrimSpace(guestSessionID) == "" {
		return ErrGalleryFavoritesMissingSession
	}
	if gallery == nil {
		return ErrGalleryFavoritesNotFound
	}
	if !gallery.IsPublished {
		return ErrGalleryFavoritesNotPublished
	}
	if gallery.ExpiresAt != nil && gallery.ExpiresAt.Before(time.Now().UTC()) {
		return ErrGalleryFavoritesExpired
	}
	return nil
}

// SummarizeByID is the owner endpoint. Takes a gallery ID directly (the
// owner JWT middleware has already validated ownership; we don't re-check
// publish status because owners see favorites pre- and post-publish).
func (s *GalleryFavoritesService) SummarizeByID(
	ctx context.Context,
	galleryID uuid.UUID,
) (*repository.GalleryFavoritesSummary, error) {
	return s.favRepo.SummarizeGallery(ctx, galleryID)
}
