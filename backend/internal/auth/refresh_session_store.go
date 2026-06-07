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

	// Rotate atomically verifies that an old refresh token is active, marks it
	// used, and persists the next token in the same family. Implementations
	// must serialize competing consumers for the same token so only one
	// rotation can ever succeed.
	Rotate(ctx context.Context, oldRawToken, newRawToken string, newExpiresAt time.Time) (*RefreshSessionEntry, error)

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

	// RevokeOldestFamilyForUser revokes the oldest active family for a user.
	// Login flows use this only after the user has already proven identity, so
	// a returning user can recover from a full session cap without weakening the
	// cap itself.
	RevokeOldestFamilyForUser(ctx context.Context, userID string) (familyID string, ok bool, err error)
}

// ErrRefreshNotFound is returned by RefreshSessionStore.Get when the
// requested token is unknown. Wrapped in the store's real error so
// callers can use errors.Is.
var ErrRefreshNotFound = errors.New("refresh session not found")

// ErrRefreshReuseDetected means a consumed or revoked refresh token was seen
// again. Callers must treat the whole token family as compromised.
var ErrRefreshReuseDetected = errors.New("refresh token reuse detected")

// ErrRefreshExpired means the token existed but its expiry has passed.
var ErrRefreshExpired = errors.New("refresh session expired")

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
	// F-007 (M17 wave 2): MFAVerified persists the second-factor state of
	// the login that minted this session. RotateRefreshToken carries it
	// forward so refreshing an access token does not silently demote the
	// session to mfa_verified=false. Default false for legacy rows.
	MFAVerified bool
	ExpiresAt   time.Time
	CreatedAt   time.Time
	Revoked     bool
	Used        bool
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
	if entry.CreatedAt.IsZero() {
		entry.CreatedAt = time.Now()
	}
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

func (s *inMemoryRefreshStore) Rotate(_ context.Context, oldRawToken, newRawToken string, newExpiresAt time.Time) (*RefreshSessionEntry, error) {
	if newRawToken == "" {
		return nil, errors.New("refresh store: new raw token is empty")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	hash := HashToken(oldRawToken)
	entry, ok := s.byHash[hash]
	if !ok {
		return nil, ErrRefreshNotFound
	}

	old := *entry
	if entry.Revoked || s.revokedFamily[entry.FamilyID] {
		old.Revoked = true
		s.revokeFamilyLocked(entry.FamilyID)
		return &old, ErrRefreshReuseDetected
	}
	if entry.Used {
		s.revokeFamilyLocked(entry.FamilyID)
		return &old, ErrRefreshReuseDetected
	}
	if time.Now().After(entry.ExpiresAt) {
		return &old, ErrRefreshExpired
	}

	entry.Used = true
	old.Used = true

	next := old
	next.RawToken = ""
	next.ExpiresAt = newExpiresAt
	next.Revoked = false
	next.Used = false
	s.byHash[HashToken(newRawToken)] = &next
	if s.userFamilies[next.Sub] == nil {
		s.userFamilies[next.Sub] = make(map[string]bool)
	}
	s.userFamilies[next.Sub][next.FamilyID] = true

	return &old, nil
}

func (s *inMemoryRefreshStore) RevokeFamily(_ context.Context, familyID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.revokeFamilyLocked(familyID)
	return nil
}

func (s *inMemoryRefreshStore) revokeFamilyLocked(familyID string) {
	s.revokedFamily[familyID] = true
	// Also flip the per-entry flag so direct Get/Rotate paths see the
	// revocation without needing to re-check the family map.
	for _, entry := range s.byHash {
		if entry.FamilyID == familyID {
			entry.Revoked = true
		}
	}
}

func (s *inMemoryRefreshStore) IsFamilyRevoked(_ context.Context, familyID string) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.revokedFamily[familyID], nil
}

func (s *inMemoryRefreshStore) CountActiveFamiliesForUser(_ context.Context, userID string) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	return len(s.activeFamiliesForUserLocked(userID)), nil
}

func (s *inMemoryRefreshStore) UserHasFamily(_ context.Context, userID, familyID string) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, ok := s.activeFamiliesForUserLocked(userID)[familyID]
	return ok, nil
}

func (s *inMemoryRefreshStore) RevokeOldestFamilyForUser(_ context.Context, userID string) (string, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	families := s.activeFamiliesForUserLocked(userID)
	if len(families) == 0 {
		return "", false, nil
	}

	var oldestFamily string
	var oldestCreatedAt time.Time
	for familyID, createdAt := range families {
		if oldestFamily == "" || createdAt.Before(oldestCreatedAt) || (createdAt.Equal(oldestCreatedAt) && familyID < oldestFamily) {
			oldestFamily = familyID
			oldestCreatedAt = createdAt
		}
	}
	s.revokeFamilyLocked(oldestFamily)
	return oldestFamily, true, nil
}

func (s *inMemoryRefreshStore) activeFamiliesForUserLocked(userID string) map[string]time.Time {
	now := time.Now()
	families := make(map[string]time.Time)
	for _, entry := range s.byHash {
		if entry.Sub != userID || entry.Revoked || s.revokedFamily[entry.FamilyID] || !entry.ExpiresAt.After(now) {
			continue
		}
		createdAt := entry.CreatedAt
		if createdAt.IsZero() {
			createdAt = entry.ExpiresAt
		}
		if existing, ok := families[entry.FamilyID]; !ok || createdAt.Before(existing) {
			families[entry.FamilyID] = createdAt
		}
	}
	return families
}
