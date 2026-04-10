package service

// api_key_service.go — M9 E25-S1 API key management.
//
// Closes the M9 gap from gap-audit-M3-to-M10.md: api_keys table existed
// since migration 042 but had no Go-side service, middleware, or handler.
// This file plus api_key_repo.go and the api_key_handler / api_key_auth
// middleware close the foundational developer-platform path.
//
// Key format: rd_<32-hex-chars>
//   - "rd_" prefix is the workspace-readable brand prefix (rawdrive)
//   - 32 hex chars are 128 bits of entropy from crypto/rand
//   - The first 8 chars after "rd_" become the lookup prefix in the DB
//
// Storage:
//   - cleartext key is shown ONCE at creation, never persisted
//   - DB stores: key_hash = SHA-256(cleartext), key_prefix = first 8 hex chars
//   - Auth lookup: extract prefix → repo.FindByPrefix → constant-time
//     hash compare → return APIKey
//
// This matches the industry standard (Stripe sk_*, GitHub ghp_*, etc.)
// and means a database leak alone cannot expose live keys.

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

const (
	apiKeyPrefix     = "rd_"
	apiKeyEntropyLen = 16 // 16 bytes → 32 hex chars
	apiKeyLookupLen  = 8  // first 8 hex chars used as the prefix index
)

// ValidScopes is the set of permissions an API key may carry. Adding new
// scopes here is the only place — handlers do `Scopes contains "x"` checks.
var ValidScopes = map[string]bool{
	"galleries:read":  true,
	"galleries:write": true,
	"assets:read":     true,
	"assets:write":    true,
	"webhooks:read":   true,
	"webhooks:write":  true,
	"analytics:read":  true,
}

// Errors surfaced to handlers for HTTP status mapping.
var (
	ErrAPIKeyInvalidName    = errors.New("api_key: name required")
	ErrAPIKeyInvalidScope   = errors.New("api_key: invalid scope")
	ErrAPIKeyMalformed      = errors.New("api_key: malformed")
	ErrAPIKeyNotFound       = errors.New("api_key: not found")
	ErrAPIKeyExpired        = errors.New("api_key: expired")
	ErrAPIKeyRevoked        = errors.New("api_key: revoked")
	ErrAPIKeyInsufficient   = errors.New("api_key: insufficient scope")
)

// APIKeyService handles API key creation, verification, and management.
type APIKeyService struct {
	repo *repository.APIKeyRepo
	now  func() time.Time
}

// NewAPIKeyService constructs the service.
func NewAPIKeyService(repo *repository.APIKeyRepo) *APIKeyService {
	return &APIKeyService{repo: repo, now: time.Now}
}

// WithClock overrides the clock for deterministic tests.
func (s *APIKeyService) WithClock(now func() time.Time) *APIKeyService {
	s.now = now
	return s
}

// CreateInput is the parameter set for CreateKey.
type CreateAPIKeyInput struct {
	WorkspaceID uuid.UUID
	Name        string
	Scopes      []string
	RateLimit   int        // requests per hour; 0 → default 1000
	ExpiresAt   *time.Time // optional expiry
	CreatedBy   *uuid.UUID
}

// CreatedAPIKey is the response from CreateKey. ClearText is shown ONCE at
// creation and never returned again.
type CreatedAPIKey struct {
	ID        uuid.UUID
	Name      string
	ClearText string // "rd_<32 hex chars>"
	Prefix    string // first 8 hex chars (saved in DB for lookup)
	Scopes    []string
	RateLimit int
	ExpiresAt *time.Time
	CreatedAt time.Time
}

// CreateKey generates a new API key, stores its hash, and returns the
// cleartext one time only. Caller MUST display the cleartext to the user
// and warn that it cannot be retrieved again.
func (s *APIKeyService) CreateKey(ctx context.Context, in CreateAPIKeyInput) (*CreatedAPIKey, error) {
	if strings.TrimSpace(in.Name) == "" {
		return nil, ErrAPIKeyInvalidName
	}
	for _, scope := range in.Scopes {
		if !ValidScopes[scope] {
			return nil, fmt.Errorf("%w: %s", ErrAPIKeyInvalidScope, scope)
		}
	}

	cleartext, prefix, err := generateAPIKey()
	if err != nil {
		return nil, fmt.Errorf("api key generate: %w", err)
	}
	hash := hashAPIKey(cleartext)

	rec := &repository.APIKey{
		WorkspaceID: in.WorkspaceID,
		Name:        in.Name,
		KeyHash:     hash,
		KeyPrefix:   prefix,
		Scopes:      in.Scopes,
		RateLimit:   in.RateLimit,
		ExpiresAt:   in.ExpiresAt,
		IsActive:    true,
		CreatedBy:   in.CreatedBy,
	}
	if err := s.repo.Create(ctx, rec); err != nil {
		return nil, fmt.Errorf("api key create: %w", err)
	}
	return &CreatedAPIKey{
		ID:        rec.ID,
		Name:      rec.Name,
		ClearText: cleartext,
		Prefix:    rec.KeyPrefix,
		Scopes:    rec.Scopes,
		RateLimit: rec.RateLimit,
		ExpiresAt: rec.ExpiresAt,
		CreatedAt: rec.CreatedAt,
	}, nil
}

// VerifyKey looks up and validates a cleartext API key. Returns the
// matching record if valid, or one of ErrAPIKey* on failure. Designed to
// be called from auth middleware on every API request.
func (s *APIKeyService) VerifyKey(ctx context.Context, cleartext string) (*repository.APIKey, error) {
	if !strings.HasPrefix(cleartext, apiKeyPrefix) {
		return nil, ErrAPIKeyMalformed
	}
	body := strings.TrimPrefix(cleartext, apiKeyPrefix)
	if len(body) < apiKeyLookupLen {
		return nil, ErrAPIKeyMalformed
	}

	prefix := body[:apiKeyLookupLen]
	rec, err := s.repo.FindByPrefix(ctx, prefix)
	if err != nil {
		return nil, fmt.Errorf("api key lookup: %w", err)
	}
	if rec == nil {
		return nil, ErrAPIKeyNotFound
	}
	if !rec.IsActive {
		return nil, ErrAPIKeyRevoked
	}
	if rec.ExpiresAt != nil && s.now().After(*rec.ExpiresAt) {
		return nil, ErrAPIKeyExpired
	}

	expectedHash := hashAPIKey(cleartext)
	if subtle.ConstantTimeCompare([]byte(expectedHash), []byte(rec.KeyHash)) != 1 {
		return nil, ErrAPIKeyNotFound
	}
	return rec, nil
}

// ListKeys returns all API keys for a workspace. Hashes are zeroed before
// return so a misuse of the response can never leak credentials.
func (s *APIKeyService) ListKeys(ctx context.Context, workspaceID uuid.UUID) ([]*repository.APIKey, error) {
	keys, err := s.repo.ListByWorkspace(ctx, workspaceID)
	if err != nil {
		return nil, err
	}
	for _, k := range keys {
		k.KeyHash = ""
	}
	return keys, nil
}

// RevokeKey deactivates an API key. Subsequent VerifyKey calls return
// ErrAPIKeyRevoked.
func (s *APIKeyService) RevokeKey(ctx context.Context, keyID, workspaceID uuid.UUID) error {
	if err := s.repo.Revoke(ctx, keyID, workspaceID); err != nil {
		return fmt.Errorf("api key revoke: %w", err)
	}
	return nil
}

// HasScope returns true if the API key carries the named permission.
// Used by handler-level scope checks after middleware authentication.
func HasScope(key *repository.APIKey, scope string) bool {
	if key == nil {
		return false
	}
	for _, s := range key.Scopes {
		if s == scope {
			return true
		}
	}
	return false
}

// generateAPIKey produces a fresh cleartext key plus its lookup prefix.
// Format: "rd_" + 32 hex chars (16 random bytes). Prefix = first 8 chars.
func generateAPIKey() (cleartext, prefix string, err error) {
	buf := make([]byte, apiKeyEntropyLen)
	if _, err := rand.Read(buf); err != nil {
		return "", "", err
	}
	body := hex.EncodeToString(buf)
	cleartext = apiKeyPrefix + body
	prefix = body[:apiKeyLookupLen]
	return cleartext, prefix, nil
}

// hashAPIKey returns the hex-encoded SHA-256 of a cleartext key. SHA-256
// is sufficient for storage hashing here because the cleartext has 128
// bits of entropy — it's a high-entropy secret, not a low-entropy
// password where bcrypt's slowdown would matter.
func hashAPIKey(cleartext string) string {
	sum := sha256.Sum256([]byte(cleartext))
	return hex.EncodeToString(sum[:])
}
