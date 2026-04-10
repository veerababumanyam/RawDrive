package auth

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"sync"
	"time"
)

// RefreshSessionStore is the persistence seam for refresh-token state.
// Before F-006 Part B (audit 2026-04-10) the JWT service kept all
// refresh session state in process-local maps, so every service restart
// instantly invalidated every active refresh session and forced every
// user to re-login. This interface abstracts over the storage layer so
// production can wire a DB-backed implementation (see repository.
// RefreshSessionRepo) and tests can keep using the in-memory default.
//
// The interface is deliberately narrow: 6 methods that cover exactly
// the state transitions the existing jwtService needed from its three
// in-memory maps (refreshTokens, userSessions, families).
//
// Tokens are identified by their SHA-256 hash throughout. The raw token
// is only ever seen by the JWT service during issue / rotate / inspect
// and is never stored. HashToken exposes the hashing for callers that
// need it (primarily the JWT service itself).
type RefreshSessionStore interface {
	// Create persists a new refresh session. The jwtService calls this
	// after generating a raw token; the store hashes the token via
	// HashToken before persisting.
	Create(ctx context.Context, entry RefreshSessionEntry) error

	// Get looks up a session by the raw token string. Returns an error
	// wrapping ErrRefreshNotFound if the token is unknown (so callers
	// can errors.Is-check without string matching).
	Get(ctx context.Context, rawToken string) (*RefreshSessionEntry, error)

	// MarkUsed flags a refresh token as consumed so a subsequent rotate
	// attempt will detect reuse and revoke the entire family.
	MarkUsed(ctx context.Context, rawToken string) error

	// RevokeFamily marks every session under the given family as
	// revoked. Callers use this when token reuse is detected or when
	// an admin explicitly revokes a user session.
	RevokeFamily(ctx context.Context, familyID string) error

	// IsFamilyRevoked reports whether a family has been revoked. A
	// revoked family must never produce valid rotated tokens even if
	// a row still exists with a non-null token.
	IsFamilyRevoked(ctx context.Context, familyID string) (bool, error)

	// CountActiveFamiliesForUser returns the number of distinct,
	// non-revoked, non-expired families owned by the user. Used by
	// the MaxSessions concurrent-session limit.
	CountActiveFamiliesForUser(ctx context.Context, userID string) (int, error)

	// UserHasFamily reports whether the user already has a session in
	// the given family. The session-limit check uses this so a rotate
	// within an existing family does not count as a new session.
	UserHasFamily(ctx context.Context, userID, familyID string) (bool, error)
}

// ErrRefreshNotFound is returned by RefreshSessionStore.Get when the
// requested token is unknown. Wrapped in the store's real error so
// callers can use errors.Is.
var ErrRefreshNotFound = errors.New("refresh session not found")

// RefreshSessionEntry is the exported row shape for RefreshSessionStore.
// Mirrors the previous unexported refreshEntry but uses exported field
// names so implementations in other packages can populate it directly.
type RefreshSessionEntry struct {
	// RawToken is the 32-byte hex token string. Only set on Create; the
	// store hashes it via HashToken before persisting. Get and the rest
	// of the API never return RawToken — it lives only in the caller.
	RawToken string

	Sub          string
	FamilyID     string
	WorkspaceID  string
	Role         string
	PlatformRole string
	StateID      string
	ExpiresAt    time.Time
	Revoked      bool
	Used         bool
}

// HashToken returns the hex SHA-256 of a raw refresh-token string. The
// JWT service and every RefreshSessionStore implementation must use
// this exact function so lookups round-trip.
func HashToken(rawToken string) string {
	sum := sha256.Sum256([]byte(rawToken))
	return hex.EncodeToString(sum[:])
}

// ─────────────────────────────────────────────────────────────────────
// In-memory implementation — the default used by NewJWTService when no
// persistent store is wired. Mirrors the behavior of the three in-memory
// maps that used to live on *jwtService. Safe for concurrent use.
// ─────────────────────────────────────────────────────────────────────

type inMemoryRefreshStore struct {
	mu            sync.Mutex
	byHash        map[string]*RefreshSessionEntry // token hash -> entry
	userFamilies  map[string]map[string]bool      // user -> set of family IDs
	revokedFamily map[string]bool                 // family -> revoked
}

// NewInMemoryRefreshStore returns an empty in-memory store. Exposed so
// tests (and NewJWTService's default) can construct one without reaching
// into unexported state.
func NewInMemoryRefreshStore() RefreshSessionStore {
	return &inMemoryRefreshStore{
		byHash:        make(map[string]*RefreshSessionEntry),
		userFamilies:  make(map[string]map[string]bool),
		revokedFamily: make(map[string]bool),
	}
}

func (s *inMemoryRefreshStore) Create(_ context.Context, entry RefreshSessionEntry) error {
	if entry.RawToken == "" {
		return errors.New("refresh store: raw token is empty")
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	hash := HashToken(entry.RawToken)
	// Clear RawToken before storing so it never leaks out via Get.
	stored := entry
	stored.RawToken = ""
	s.byHash[hash] = &stored

	if s.userFamilies[entry.Sub] == nil {
		s.userFamilies[entry.Sub] = make(map[string]bool)
	}
	s.userFamilies[entry.Sub][entry.FamilyID] = true
	return nil
}

func (s *inMemoryRefreshStore) Get(_ context.Context, rawToken string) (*RefreshSessionEntry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	hash := HashToken(rawToken)
	entry, ok := s.byHash[hash]
	if !ok {
		return nil, ErrRefreshNotFound
	}
	// Return a copy so callers can't mutate the store's state.
	copy := *entry
	return &copy, nil
}

func (s *inMemoryRefreshStore) MarkUsed(_ context.Context, rawToken string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	hash := HashToken(rawToken)
	entry, ok := s.byHash[hash]
	if !ok {
		return ErrRefreshNotFound
	}
	entry.Used = true
	return nil
}

func (s *inMemoryRefreshStore) RevokeFamily(_ context.Context, familyID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.revokedFamily[familyID] = true
	// Also flip the per-entry flag so direct Get/Rotate paths see the
	// revocation without needing to re-check the family map.
	for _, entry := range s.byHash {
		if entry.FamilyID == familyID {
			entry.Revoked = true
		}
	}
	return nil
}

func (s *inMemoryRefreshStore) IsFamilyRevoked(_ context.Context, familyID string) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.revokedFamily[familyID], nil
}

func (s *inMemoryRefreshStore) CountActiveFamiliesForUser(_ context.Context, userID string) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	families, ok := s.userFamilies[userID]
	if !ok {
		return 0, nil
	}
	count := 0
	for fid, active := range families {
		if active && !s.revokedFamily[fid] {
			count++
		}
	}
	return count, nil
}

func (s *inMemoryRefreshStore) UserHasFamily(_ context.Context, userID, familyID string) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	families, ok := s.userFamilies[userID]
	if !ok {
		return false, nil
	}
	return families[familyID], nil
}
