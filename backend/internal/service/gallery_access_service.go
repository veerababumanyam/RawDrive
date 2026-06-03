package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/passwordpolicy"
	"github.com/rawdrive/backend/internal/repository"
	"golang.org/x/crypto/bcrypt"
)

// GalleryAccessService handles gallery access control: passwords, PINs, access modes, and audit logging.
//
// S4-G4 / E (integration audit 2026-05-31): gallery access sessions used to be
// stored in a per-process in-memory map, so a client verified on app1 got 401
// on app2 (2-node prod) and every session dropped on deploy/restart. Sessions
// are now minted as stateless HMAC-signed tokens (mirroring the streaming
// viewer JWT and OAuth-state HMAC patterns) that any node can verify with the
// shared signing key — no shared store, no sticky sessions. The legacy
// in-memory map is retained ONLY as a fallback for constructions that never
// wire a signing key (e.g. older tests); production always wires the key so
// every node agrees on session validity.
type GalleryAccessService struct {
	galleryRepo   *repository.GalleryRepo
	accessLogRepo *repository.GalleryAccessLogRepo

	// signingKey, when non-nil, switches session minting/validation to the
	// stateless HMAC-signed path. Loaded from platform_settings at boot.
	signingKey []byte
	sessionTTL time.Duration

	// Legacy in-memory fallback. Only used when signingKey is nil.
	mu       sync.Mutex
	sessions map[string]galleryAccessSession
}

type galleryAccessSession struct {
	GalleryID uuid.UUID
	ExpiresAt time.Time
}

// gallerySessionScope distinguishes how a session was obtained. Both scopes
// satisfy "the gallery's protection is met", but recording the scope lets
// callers reason about share-link-specific gates (PIN/expiry/access-count are
// enforced at verify time, not on every read, so the scope is informational
// for now and future-proofs share-only surfaces).
type gallerySessionScope string

const (
	gallerySessionScopePassword gallerySessionScope = "password"
	gallerySessionScopeShare    gallerySessionScope = "share"
	// gallerySessionScopeAsset marks a short-lived, byte-read-only asset-access
	// token (?at=) that authorizes reading a gallery's derivatives without being
	// a durable session — it cannot unlock the gallery or be replayed as a
	// session because it carries a DISTINCT audience (galleryAssetAudience).
	gallerySessionScopeAsset gallerySessionScope = "asset"

	gallerySessionIssuer   = "rawdrive-gallery"
	gallerySessionAudience = "gallery-session"
	// galleryAssetAudience is a DISTINCT JWT audience from gallerySessionAudience
	// so a durable session token can never be accepted as an asset-access token
	// or vice-versa (security audit 2026-05-30, SEC-1).
	galleryAssetAudience = "gallery-asset"
)

// gallerySessionClaims is the decoded body of a signed gallery-session token.
// GalleryID binds the token to one gallery; ShareToken (optional) records the
// share link that minted it for share-scoped sessions.
type gallerySessionClaims struct {
	GalleryID  string              `json:"gallery_id"`
	Scope      gallerySessionScope `json:"scope"`
	ShareToken string              `json:"share_token,omitempty"`
	jwt.RegisteredClaims
}

// NewGalleryAccessService creates a new GalleryAccessService. Without a signing
// key it falls back to the legacy in-memory session map (single-node only).
func NewGalleryAccessService(gr *repository.GalleryRepo, alr *repository.GalleryAccessLogRepo) *GalleryAccessService {
	return &GalleryAccessService{
		galleryRepo:   gr,
		accessLogRepo: alr,
		sessionTTL:    24 * time.Hour,
		sessions:      make(map[string]galleryAccessSession),
	}
}

// WithSessionSigningKey enables stateless HMAC-signed gallery-session tokens so
// sessions survive restarts and are valid on every node (S4-G4/E). Returns the
// receiver for chained construction. A key shorter than 32 bytes is rejected
// (caller should load a 32-byte key from platform_settings).
func (s *GalleryAccessService) WithSessionSigningKey(key []byte) *GalleryAccessService {
	if len(key) >= 32 {
		s.signingKey = key
	}
	return s
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
// Returns a durable, node-portable session token on success (S4-G4/E).
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

	return s.issueSession(galleryID, gallerySessionScopePassword, "")
}

// IssueShareSession mints a gallery-session token for a client who reached the
// gallery via a verified share link (S4-G2). The caller MUST have already run
// ShareLinkService.ValidateAccess + TrackAccess for `shareToken` before calling
// this — this method only binds the verified share to a durable session that
// the slug/asset/byte paths require. The session is bound to galleryID so a
// share token for gallery A cannot unlock gallery B.
func (s *GalleryAccessService) IssueShareSession(galleryID uuid.UUID, shareToken string) (string, error) {
	return s.issueSession(galleryID, gallerySessionScopeShare, shareToken)
}

// issueSession mints a session token. Stateless HMAC path when a signing key is
// wired; legacy in-memory map otherwise.
func (s *GalleryAccessService) issueSession(galleryID uuid.UUID, scope gallerySessionScope, shareToken string) (string, error) {
	ttl := s.sessionTTL
	if ttl <= 0 {
		ttl = 24 * time.Hour
	}

	if len(s.signingKey) >= 32 {
		now := time.Now().UTC()
		claims := &gallerySessionClaims{
			GalleryID:  galleryID.String(),
			Scope:      scope,
			ShareToken: shareToken,
			RegisteredClaims: jwt.RegisteredClaims{
				Issuer:    gallerySessionIssuer,
				Subject:   galleryID.String(),
				Audience:  jwt.ClaimStrings{gallerySessionAudience},
				IssuedAt:  jwt.NewNumericDate(now),
				NotBefore: jwt.NewNumericDate(now),
				ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
				ID:        uuid.NewString(),
			},
		}
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		signed, err := token.SignedString(s.signingKey)
		if err != nil {
			return "", fmt.Errorf("gallery access: sign session: %w", err)
		}
		return signed, nil
	}

	// Legacy single-node fallback.
	token, err := generateSecureToken(32)
	if err != nil {
		return "", fmt.Errorf("gallery access: generate token: %w", err)
	}
	s.mu.Lock()
	s.sessions[token] = galleryAccessSession{
		GalleryID: galleryID,
		ExpiresAt: time.Now().Add(ttl),
	}
	s.mu.Unlock()
	return token, nil
}

// ValidateSession reports whether `token` is a currently-valid session for
// `galleryID`. Works on any node when the HMAC path is active.
func (s *GalleryAccessService) ValidateSession(ctx context.Context, galleryID uuid.UUID, token string) bool {
	_ = ctx
	if token == "" {
		return false
	}

	if len(s.signingKey) >= 32 {
		claims, err := s.parseSession(token)
		if err != nil {
			return false
		}
		return claims.GalleryID == galleryID.String()
	}

	// Legacy in-memory fallback.
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

// GalleryIDFromSession returns the gallery a valid session token is bound to,
// WITHOUT requiring the caller to already know which gallery. The storage byte
// path (S4-G1) needs this: it has a session token from cookie/header but must
// learn which gallery it unlocks to check asset membership. Returns uuid.Nil +
// false when the token is empty, malformed, expired, or (legacy fallback) not
// found. Works on any node when the HMAC path is active.
func (s *GalleryAccessService) GalleryIDFromSession(ctx context.Context, token string) (uuid.UUID, bool) {
	_ = ctx
	if token == "" {
		return uuid.Nil, false
	}

	if len(s.signingKey) >= 32 {
		claims, err := s.parseSession(token)
		if err != nil {
			return uuid.Nil, false
		}
		gid, err := uuid.Parse(claims.GalleryID)
		if err != nil {
			return uuid.Nil, false
		}
		return gid, true
	}

	// Legacy in-memory fallback.
	now := time.Now()
	s.mu.Lock()
	defer s.mu.Unlock()
	session, ok := s.sessions[token]
	if !ok {
		return uuid.Nil, false
	}
	if session.ExpiresAt.Before(now) {
		delete(s.sessions, token)
		return uuid.Nil, false
	}
	return session.GalleryID, true
}

func (s *GalleryAccessService) parseSession(tokenStr string) (*gallerySessionClaims, error) {
	if strings.TrimSpace(tokenStr) == "" {
		return nil, errors.New("gallery access: empty token")
	}
	claims := &gallerySessionClaims{}
	parser := jwt.NewParser(
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithExpirationRequired(),
		jwt.WithIssuer(gallerySessionIssuer),
		jwt.WithAudience(gallerySessionAudience),
	)
	token, err := parser.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
		if t.Method.Alg() != jwt.SigningMethodHS256.Alg() {
			return nil, fmt.Errorf("gallery access: unexpected signing alg %q", t.Method.Alg())
		}
		return s.signingKey, nil
	})
	if err != nil {
		return nil, err
	}
	if !token.Valid {
		return nil, errors.New("gallery access: token not valid")
	}
	if strings.TrimSpace(claims.GalleryID) == "" {
		return nil, errors.New("gallery access: gallery_id claim required")
	}
	return claims, nil
}

// IssueAssetAccessToken mints a short-lived, byte-read-only token bound to one
// gallery (security audit 2026-05-30, SEC-1). It is the safe value to embed in
// image src URLs (?at=): an <img>/<video> request cannot send the
// X-Gallery-Session header, so the durable session token must NOT be put in the
// query string (it would leak into browser history, Referer headers, proxy and
// access logs and could be replayed to unlock the gallery). This token carries a
// DISTINCT audience (galleryAssetAudience) so it can never be accepted as a
// session, and it grants nothing beyond reading this gallery's derivatives.
func (s *GalleryAccessService) IssueAssetAccessToken(galleryID uuid.UUID) (string, error) {
	if len(s.signingKey) < 32 {
		return "", errors.New("gallery access: asset token requires a signing key")
	}
	ttl := s.sessionTTL
	if ttl <= 0 {
		ttl = 24 * time.Hour
	}
	now := time.Now().UTC()
	claims := &gallerySessionClaims{
		GalleryID: galleryID.String(),
		Scope:     gallerySessionScopeAsset,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    gallerySessionIssuer,
			Subject:   galleryID.String(),
			Audience:  jwt.ClaimStrings{galleryAssetAudience},
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
			ID:        uuid.NewString(),
		},
	}
	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.signingKey)
	if err != nil {
		return "", fmt.Errorf("gallery access: sign asset token: %w", err)
	}
	return signed, nil
}

// GalleryIDFromAssetToken validates a ?at= asset-access token and returns the
// gallery it is bound to. Rejects empty/malformed/expired tokens and — via the
// DISTINCT galleryAssetAudience — any durable session token presented in its
// place, so a leaked ?at= value can only read this gallery's bytes, never act as
// a session (security audit 2026-05-30, SEC-1).
func (s *GalleryAccessService) GalleryIDFromAssetToken(ctx context.Context, token string) (uuid.UUID, bool) {
	_ = ctx
	if token == "" || len(s.signingKey) < 32 {
		return uuid.Nil, false
	}
	claims := &gallerySessionClaims{}
	parser := jwt.NewParser(
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithExpirationRequired(),
		jwt.WithIssuer(gallerySessionIssuer),
		jwt.WithAudience(galleryAssetAudience),
	)
	parsed, err := parser.ParseWithClaims(token, claims, func(t *jwt.Token) (interface{}, error) {
		if t.Method.Alg() != jwt.SigningMethodHS256.Alg() {
			return nil, fmt.Errorf("gallery access: unexpected signing alg %q", t.Method.Alg())
		}
		return s.signingKey, nil
	})
	if err != nil || !parsed.Valid {
		return uuid.Nil, false
	}
	if claims.Scope != gallerySessionScopeAsset {
		return uuid.Nil, false
	}
	gid, err := uuid.Parse(claims.GalleryID)
	if err != nil {
		return uuid.Nil, false
	}
	return gid, true
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
