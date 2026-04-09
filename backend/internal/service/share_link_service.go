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

// ──────────────────────── Access Mode Enforcement (ISS-002) ────────────────────────

// AccessMode represents the share link access control type.
type AccessMode string

const (
	AccessPublic   AccessMode = "public"
	AccessPIN      AccessMode = "pin"
	AccessPassword AccessMode = "password"
	AccessEmail    AccessMode = "email"
)

// ValidateAccess checks if the given credentials satisfy the share link's access mode.
func (s *ShareLinkService) ValidateAccess(ctx context.Context, token string, credential string) (bool, error) {
	sl, err := s.repo.GetByToken(ctx, token)
	if err != nil || sl == nil {
		return false, fmt.Errorf("share link not found")
	}

	// Check revocation
	if sl.RevokedAt != nil {
		return false, fmt.Errorf("share link revoked")
	}

	// Check expiry
	if sl.ExpiresAt != nil && sl.ExpiresAt.Before(time.Now()) {
		return false, fmt.Errorf("share link expired")
	}

	// Determine access mode from permissions
	mode := AccessMode("public")
	if modeStr, ok := sl.Permissions["access_mode"].(string); ok {
		mode = AccessMode(modeStr)
	} else if sl.PinHash != nil {
		mode = AccessPIN
	}

	switch mode {
	case AccessPublic:
		return true, nil
	case AccessPIN:
		if sl.PinHash == nil {
			return true, nil
		}
		err := bcrypt.CompareHashAndPassword([]byte(*sl.PinHash), []byte(credential))
		return err == nil, nil
	case AccessPassword:
		if sl.PinHash == nil {
			return true, nil
		}
		err := bcrypt.CompareHashAndPassword([]byte(*sl.PinHash), []byte(credential))
		return err == nil, nil
	case AccessEmail:
		allowedEmails, ok := sl.Permissions["allowed_emails"].([]interface{})
		if !ok {
			return true, nil
		}
		for _, e := range allowedEmails {
			if email, ok := e.(string); ok && email == credential {
				return true, nil
			}
		}
		return false, fmt.Errorf("email not authorized")
	default:
		return true, nil
	}
}

// TrackView increments view analytics for a share link.
func (s *ShareLinkService) TrackView(ctx context.Context, token string, visitorIP string) error {
	return s.repo.IncrementViewCount(ctx, token)
}

// TrackDownload increments download count for a share link.
func (s *ShareLinkService) TrackDownload(ctx context.Context, token string) error {
	return s.repo.IncrementDownloadCount(ctx, token)
}

// IsDownloadAllowed checks if the share link permits downloads.
func (s *ShareLinkService) IsDownloadAllowed(ctx context.Context, token string) (bool, error) {
	sl, err := s.repo.GetByToken(ctx, token)
	if err != nil || sl == nil {
		return false, err
	}
	return sl.DownloadAllowed, nil
}
