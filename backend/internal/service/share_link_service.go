package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/passwordpolicy"
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
	MaxAccessCount  *int // GAL-FR-112: optional access cap
	Permissions     map[string]interface{}
}

// Create creates a new share link.
func (s *ShareLinkService) Create(ctx context.Context, input CreateShareLinkInput) (*repository.ShareLink, error) {
	sl := &repository.ShareLink{
		GalleryID:       input.GalleryID,
		DownloadAllowed: input.DownloadAllowed,
		MaxAccessCount:  input.MaxAccessCount,
		Permissions:     input.Permissions,
	}

	if input.PIN != "" {
		if err := passwordpolicy.ValidateBcryptInput("share link: pin", input.PIN); err != nil {
			return nil, err
		}
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

// NormalizeShareAccessMode resolves a raw access_mode string (from JSON permissions or
// request body) to a validated AccessMode. Empty input defaults to pin when hasPin is
// true, otherwise public. Unknown modes return an error so handlers can 400.
func NormalizeShareAccessMode(raw string, hasPin bool) (AccessMode, error) {
	trimmed := strings.ToLower(strings.TrimSpace(raw))
	if trimmed == "" {
		if hasPin {
			return AccessPIN, nil
		}
		return AccessPublic, nil
	}
	switch AccessMode(trimmed) {
	case AccessPublic, AccessPIN, AccessPassword, AccessEmail:
		return AccessMode(trimmed), nil
	default:
		return "", fmt.Errorf("unsupported share link access_mode: %q", trimmed)
	}
}

// shareEmailCredentialAllowed reports whether the supplied credential (email)
// matches any entry in the permissions' allowed_emails list. Both []interface{}
// (from JSON decode) and []string (native) are supported; matching is case-insensitive
// and trims whitespace on both sides.
func shareEmailCredentialAllowed(permissions map[string]interface{}, credential string) bool {
	target := strings.ToLower(strings.TrimSpace(credential))
	if target == "" {
		return false
	}
	raw, ok := permissions["allowed_emails"]
	if !ok {
		return false
	}
	switch list := raw.(type) {
	case []interface{}:
		for _, e := range list {
			if email, ok := e.(string); ok {
				if strings.ToLower(strings.TrimSpace(email)) == target {
					return true
				}
			}
		}
	case []string:
		for _, email := range list {
			if strings.ToLower(strings.TrimSpace(email)) == target {
				return true
			}
		}
	}
	return false
}

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

	// GAL-FR-112: enforce max_access_count (pre-flight check; commit happens on successful access).
	if sl.MaxAccessCount != nil && sl.AccessCount >= *sl.MaxAccessCount {
		return false, fmt.Errorf("share link access limit reached")
	}

	// Determine access mode from permissions. Unsupported modes fail closed.
	mode := AccessPublic
	if modeStr, ok := sl.Permissions["access_mode"].(string); ok {
		mode, err = NormalizeShareAccessMode(modeStr, sl.PinHash != nil)
		if err != nil {
			return false, err
		}
	} else {
		mode, err = NormalizeShareAccessMode("", sl.PinHash != nil)
		if err != nil {
			return false, err
		}
	}

	switch mode {
	case AccessPublic:
		return true, nil
	case AccessPIN:
		if sl.PinHash == nil {
			return false, fmt.Errorf("share link credential missing")
		}
		err := bcrypt.CompareHashAndPassword([]byte(*sl.PinHash), []byte(credential))
		return err == nil, nil
	case AccessPassword:
		if sl.PinHash == nil {
			return false, fmt.Errorf("share link credential missing")
		}
		err := bcrypt.CompareHashAndPassword([]byte(*sl.PinHash), []byte(credential))
		return err == nil, nil
	case AccessEmail:
		if shareEmailCredentialAllowed(sl.Permissions, credential) {
			return true, nil
		}
		return false, fmt.Errorf("email not authorized")
	default:
		return false, fmt.Errorf("unsupported share link access_mode: %q", mode)
	}
}

// TrackView increments the JSONB view_count analytics counter (kept for legacy reporting).
func (s *ShareLinkService) TrackView(ctx context.Context, token string, visitorIP string) error {
	return s.repo.IncrementViewCount(ctx, token)
}

// TrackAccess atomically increments the authoritative access_count column and
// returns the new count. Returns ErrAccessLimitExceeded when a capped link has
// reached its ceiling (GAL-FR-112). Callers should invoke this immediately
// after ValidateAccess succeeds so the count is committed under a single
// UPDATE with the cap predicate — the DB is the concurrency arbiter.
func (s *ShareLinkService) TrackAccess(ctx context.Context, token string) (int, error) {
	return s.repo.IncrementAccessCount(ctx, token)
}

// ErrAccessLimitExceeded is re-exported from the repo layer so handlers can match on it.
var ErrAccessLimitExceeded = repository.ErrAccessLimitExceeded

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
