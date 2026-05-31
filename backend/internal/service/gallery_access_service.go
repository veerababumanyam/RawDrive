package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/passwordpolicy"
	"github.com/rawdrive/backend/internal/repository"
	"golang.org/x/crypto/bcrypt"
)

// GalleryAccessService handles gallery access control: passwords, PINs, access modes, and audit logging.
type GalleryAccessService struct {
	galleryRepo   *repository.GalleryRepo
	accessLogRepo *repository.GalleryAccessLogRepo
	mu            sync.Mutex
	sessions      map[string]galleryAccessSession
}

type galleryAccessSession struct {
	GalleryID uuid.UUID
	ExpiresAt time.Time
}

// NewGalleryAccessService creates a new GalleryAccessService.
func NewGalleryAccessService(gr *repository.GalleryRepo, alr *repository.GalleryAccessLogRepo) *GalleryAccessService {
	return &GalleryAccessService{
		galleryRepo:   gr,
		accessLogRepo: alr,
		sessions:      make(map[string]galleryAccessSession),
	}
}

// SetPassword hashes and stores a password for gallery access protection.
func (s *GalleryAccessService) SetPassword(ctx context.Context, galleryID uuid.UUID, password string) error {
	if err := passwordpolicy.ValidateBcryptInput("gallery access: password", password); err != nil {
		return err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("gallery access: hash password: %w", err)
	}
	return s.galleryRepo.UpdateField(ctx, galleryID, "password_hash", string(hash))
}

// VerifyPassword checks a plain password against the gallery's stored hash.
// Returns a session token on success.
func (s *GalleryAccessService) VerifyPassword(ctx context.Context, galleryID uuid.UUID, password string) (string, error) {
	gallery, err := s.galleryRepo.GetByID(ctx, galleryID)
	if err != nil {
		return "", fmt.Errorf("gallery access: get gallery: %w", err)
	}
	if gallery == nil {
		return "", fmt.Errorf("gallery not found")
	}

	if gallery.PasswordHash == nil || *gallery.PasswordHash == "" {
		// No password set — gallery is not password-protected
		return "", fmt.Errorf("gallery is not password-protected")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(*gallery.PasswordHash), []byte(password)); err != nil {
		return "", fmt.Errorf("invalid password")
	}

	// Generate session token
	token, err := generateSecureToken(32)
	if err != nil {
		return "", fmt.Errorf("gallery access: generate token: %w", err)
	}
	s.mu.Lock()
	s.sessions[token] = galleryAccessSession{
		GalleryID: galleryID,
		ExpiresAt: time.Now().Add(24 * time.Hour),
	}
	s.mu.Unlock()

	return token, nil
}

func (s *GalleryAccessService) ValidateSession(ctx context.Context, galleryID uuid.UUID, token string) bool {
	_ = ctx
	if token == "" {
		return false
	}
	now := time.Now()
	s.mu.Lock()
	defer s.mu.Unlock()
	session, ok := s.sessions[token]
	if !ok {
		return false
	}
	if session.ExpiresAt.Before(now) {
		delete(s.sessions, token)
		return false
	}
	return session.GalleryID == galleryID
}

// SetAccessMode updates the gallery's access mode.
func (s *GalleryAccessService) SetAccessMode(ctx context.Context, galleryID uuid.UUID, mode string) error {
	validModes := map[string]bool{
		"invite-only": true,
		"private":     true,
		"unlisted":    true,
		"public":      true,
	}
	if !validModes[mode] {
		return fmt.Errorf("invalid access mode: %s (must be one of: invite-only, private, unlisted, public)", mode)
	}
	return s.galleryRepo.UpdateField(ctx, galleryID, "access_mode", mode)
}

// LogAccess creates an immutable access log entry.
func (s *GalleryAccessService) LogAccess(ctx context.Context, galleryID uuid.UUID, r *http.Request, accessType, linkType string) error {
	log := &repository.GalleryAccessLog{
		GalleryID:        galleryID,
		VisitorIP:        r.RemoteAddr,
		VisitorUserAgent: r.UserAgent(),
		AccessType:       accessType,
		LinkType:         linkType,
	}
	return s.accessLogRepo.Create(ctx, log)
}

// LogAccessDirect creates an access log entry with explicit parameters.
func (s *GalleryAccessService) LogAccessDirect(ctx context.Context, galleryID uuid.UUID, ip, userAgent, accessType, linkType string) error {
	log := &repository.GalleryAccessLog{
		GalleryID:        galleryID,
		VisitorIP:        ip,
		VisitorUserAgent: userAgent,
		AccessType:       accessType,
		LinkType:         linkType,
	}
	return s.accessLogRepo.Create(ctx, log)
}

// CreateViewAsClientToken generates a temporary session token for "View as Client" mode.
func (s *GalleryAccessService) CreateViewAsClientToken(ctx context.Context, galleryID uuid.UUID) (string, error) {
	gallery, err := s.galleryRepo.GetByID(ctx, galleryID)
	if err != nil || gallery == nil {
		return "", fmt.Errorf("gallery not found")
	}

	token, err := generateSecureToken(32)
	if err != nil {
		return "", fmt.Errorf("gallery access: generate view-as-client token: %w", err)
	}
	return token, nil
}

// GetAccessLogs returns paginated access logs for a gallery.
func (s *GalleryAccessService) GetAccessLogs(ctx context.Context, galleryID uuid.UUID, limit, offset int) ([]repository.GalleryAccessLog, int64, error) {
	logs, err := s.accessLogRepo.ListByGallery(ctx, galleryID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	count, err := s.accessLogRepo.CountByGallery(ctx, galleryID)
	if err != nil {
		return nil, 0, err
	}
	return logs, count, nil
}

// SetProofingDeadline updates the gallery's proofing deadline.
func (s *GalleryAccessService) SetProofingDeadline(ctx context.Context, galleryID uuid.UUID, deadline time.Time) error {
	if deadline.Before(time.Now()) {
		return fmt.Errorf("proofing deadline must be in the future")
	}
	return s.galleryRepo.UpdateField(ctx, galleryID, "proofing_deadline", deadline)
}

func generateSecureToken(length int) (string, error) {
	b := make([]byte, length)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
