package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
	"golang.org/x/crypto/bcrypt"
)

// ShareLinkService handles share link business logic.
type ShareLinkService struct {
	repo *repository.ShareLinkRepo
}

// NewShareLinkService creates a new ShareLinkService.
func NewShareLinkService(repo *repository.ShareLinkRepo) *ShareLinkService {
	return &ShareLinkService{repo: repo}
}

// CreateShareLinkInput holds parameters for creating a share link.
type CreateShareLinkInput struct {
	GalleryID       uuid.UUID
	PIN             string // plain text PIN (will be hashed)
	ExpiresIn       *time.Duration
	DownloadAllowed bool
	Permissions     map[string]interface{}
}

// Create creates a new share link.
func (s *ShareLinkService) Create(ctx context.Context, input CreateShareLinkInput) (*repository.ShareLink, error) {
	sl := &repository.ShareLink{
		GalleryID:       input.GalleryID,
		DownloadAllowed: input.DownloadAllowed,
		Permissions:     input.Permissions,
	}

	if input.PIN != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(input.PIN), bcrypt.DefaultCost)
		if err != nil {
			return nil, fmt.Errorf("share link: hash pin: %w", err)
		}
		h := string(hash)
		sl.PinHash = &h
	}

	if input.ExpiresIn != nil {
		exp := time.Now().Add(*input.ExpiresIn)
		sl.ExpiresAt = &exp
	}

	if sl.Permissions == nil {
		sl.Permissions = map[string]interface{}{}
	}

	if err := s.repo.Create(ctx, sl); err != nil {
		return nil, err
	}
	return sl, nil
}

// VerifyPIN checks a plain PIN against a share link's hash.
func (s *ShareLinkService) VerifyPIN(ctx context.Context, token, pin string) (bool, error) {
	sl, err := s.repo.GetByToken(ctx, token)
	if err != nil || sl == nil {
		return false, err
	}
	if sl.PinHash == nil {
		return true, nil // no PIN required
	}
	err = bcrypt.CompareHashAndPassword([]byte(*sl.PinHash), []byte(pin))
	return err == nil, nil
}

// GetByToken retrieves a share link and validates expiry.
func (s *ShareLinkService) GetByToken(ctx context.Context, token string) (*repository.ShareLink, error) {
	sl, err := s.repo.GetByToken(ctx, token)
	if err != nil || sl == nil {
		return nil, err
	}
	if sl.ExpiresAt != nil && sl.ExpiresAt.Before(time.Now()) {
		return nil, fmt.Errorf("share link expired")
	}
	return sl, nil
}

// ListByGallery returns active share links for a gallery.
func (s *ShareLinkService) ListByGallery(ctx context.Context, galleryID uuid.UUID) ([]repository.ShareLink, error) {
	return s.repo.ListByGallery(ctx, galleryID)
}

// Revoke revokes a share link.
func (s *ShareLinkService) Revoke(ctx context.Context, id uuid.UUID) error {
	return s.repo.Revoke(ctx, id)
}
