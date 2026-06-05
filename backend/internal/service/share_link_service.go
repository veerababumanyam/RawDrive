package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"github.com/rawdrive/backend/internal/passwordpolicy"
	"github.com/rawdrive/backend/internal/repository"
)

// ErrShareLinkUnavailable is a sentinel for a TRANSIENT/infrastructure failure
// while validating a share link (e.g. a DB error from the repository), as
// opposed to a genuine denial (unknown token, revoked, expired, PIN mismatch,
// access-limit reached, email not authorized). It MUST be treated fail-closed:
// a transient failure denies access — it never grants it — but callers should
// surface it as a RETRYABLE condition (HTTP 503) rather than a permanent
// denial (403/404), so a momentary blip self-heals instead of looking like a
// hard "access denied". See issue #179: a transient DB error during share-link
// validation was being conflated into "not found" → 403 → SSR 500.
var ErrShareLinkUnavailable = errors.New("share link temporarily unavailable")

// shareLinkStore is the narrow persistence seam the ShareLinkService depends on.
// *repository.ShareLinkRepo satisfies it in production; a test can substitute a
// fake to exercise the transient-vs-genuine error distinction (issue #179)
// without a live database. Defining it here (consumer side) keeps the repo free
// of a service-owned interface.
type shareLinkStore interface {
	Create(ctx context.Context, sl *repository.ShareLink) error
	GetByToken(ctx context.Context, token string) (*repository.ShareLink, error)
	ListByGallery(ctx context.Context, galleryID uuid.UUID) ([]repository.ShareLink, error)
	Revoke(ctx context.Context, id uuid.UUID) error
	RevokeInWorkspace(ctx context.Context, linkID, workspaceID uuid.UUID) (int64, error)
	IncrementViewCount(ctx context.Context, token string) error
	IncrementAccessCount(ctx context.Context, token string) (int, error)
	IncrementDownloadCount(ctx context.Context, token string) error
}

// ShareLinkService handles share link business logic.
type ShareLinkService struct {
	repo shareLinkStore
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

// GalleryIDForToken returns the gallery a share token points at, WITHOUT any
// expiry/PIN/access-count validation. It exists so the public gallery handler
// can confirm a share token is bound to the gallery it is unlocking (S4-G2)
// before running the authoritative ValidateAccess. Returns uuid.Nil + error
// when the token is unknown. Validation of expiry/PIN/cap stays the job of
// ValidateAccess + TrackAccess — this is purely the gallery-binding lookup.
func (s *ShareLinkService) GalleryIDForToken(ctx context.Context, token string) (uuid.UUID, error) {
	sl, err := s.repo.GetByToken(ctx, token)
	if err != nil {
		// A real DB/infra error from the repository — NOT a genuine
		// not-found. Surface it as transient so the handler can deny with a
		// retryable 503 instead of a permanent 403/404 (issue #179). Still
		// fail-closed: the caller treats this as "no gallery bound".
		return uuid.Nil, fmt.Errorf("%w: %v", ErrShareLinkUnavailable, err)
	}
	if sl == nil {
		// pgx.ErrNoRows collapsed to (nil, nil) by the repo — a genuine
		// unknown/revoked token. This stays a permanent denial.
		return uuid.Nil, fmt.Errorf("share link not found")
	}
	return sl.GalleryID, nil
}

// Revoke revokes a share link.
func (s *ShareLinkService) Revoke(ctx context.Context, id uuid.UUID) error {
	return s.repo.Revoke(ctx, id)
}

// RevokeInWorkspace revokes a share link only when it belongs to a gallery
// owned by the given workspace. It returns the number of rows affected; 0 means
// the link is absent, already revoked, or owned by another tenant (handlers
// must treat 0 as 404). The ownership scoping is enforced atomically in the
// repository UPDATE (integration audit 2026-05-31).
func (s *ShareLinkService) RevokeInWorkspace(ctx context.Context, linkID, workspaceID uuid.UUID) (int64, error) {
	return s.repo.RevokeInWorkspace(ctx, linkID, workspaceID)
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
	if err != nil {
		// Real DB/infra error — transient, not a genuine denial. Fail closed
		// (deny) but mark it retryable so the handler can answer 503 instead
		// of a permanent 403 (issue #179).
		return false, fmt.Errorf("%w: %v", ErrShareLinkUnavailable, err)
	}
	if sl == nil {
		// Genuine unknown/revoked token — permanent denial.
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
