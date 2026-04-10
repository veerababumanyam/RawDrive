package auth_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/auth"
)

// Tests for F-006 Part B (audit 2026-04-10): refresh session state is
// now persisted behind the RefreshSessionStore interface. These tests
// exercise the in-memory default implementation directly + the
// jwtService-level behavior when a store is injected, so tests stay
// DB-free while still covering the round-trip + the critical "refresh
// sessions survive service restart" invariant.

func TestInMemoryRefreshStore_RoundTrip(t *testing.T) {
	store := auth.NewInMemoryRefreshStore()
	ctx := context.Background()

	entry := auth.RefreshSessionEntry{
		RawToken:     "abc123",
		Sub:          "user-1",
		FamilyID:     "family-1",
		WorkspaceID:  "ws-1",
		Role:         "Owner",
		PlatformRole: "photographer",
		StateID:      "state-1",
		ExpiresAt:    time.Now().Add(24 * time.Hour),
	}

	require.NoError(t, store.Create(ctx, entry))
	got, err := store.Get(ctx, "abc123")
	require.NoError(t, err)
	assert.Equal(t, "user-1", got.Sub)
	assert.Equal(t, "family-1", got.FamilyID)
	assert.Equal(t, "ws-1", got.WorkspaceID)

	// Get must NOT leak the raw token back out — the store only stores
	// the hash, so the returned entry should have an empty RawToken.
	assert.Empty(t, got.RawToken,
		"Get must not return the raw token — only hash is stored")
}

func TestInMemoryRefreshStore_GetUnknown(t *testing.T) {
	store := auth.NewInMemoryRefreshStore()
	_, err := store.Get(context.Background(), "never-created")
	require.Error(t, err)
	assert.True(t, errors.Is(err, auth.ErrRefreshNotFound),
		"Get on unknown token must return ErrRefreshNotFound")
}

func TestInMemoryRefreshStore_MarkUsed(t *testing.T) {
	store := auth.NewInMemoryRefreshStore()
	ctx := context.Background()

	require.NoError(t, store.Create(ctx, auth.RefreshSessionEntry{
		RawToken: "t1", Sub: "u", FamilyID: "f", ExpiresAt: time.Now().Add(time.Hour),
	}))
	require.NoError(t, store.MarkUsed(ctx, "t1"))

	got, _ := store.Get(ctx, "t1")
	assert.True(t, got.Used, "MarkUsed must flip Used=true")
}

func TestInMemoryRefreshStore_RevokeFamilyCascades(t *testing.T) {
	store := auth.NewInMemoryRefreshStore()
	ctx := context.Background()

	// Two tokens in the same family + one in a different family.
	require.NoError(t, store.Create(ctx, auth.RefreshSessionEntry{
		RawToken: "a", Sub: "u", FamilyID: "fam1", ExpiresAt: time.Now().Add(time.Hour),
	}))
	require.NoError(t, store.Create(ctx, auth.RefreshSessionEntry{
		RawToken: "b", Sub: "u", FamilyID: "fam1", ExpiresAt: time.Now().Add(time.Hour),
	}))
	require.NoError(t, store.Create(ctx, auth.RefreshSessionEntry{
		RawToken: "c", Sub: "u", FamilyID: "fam2", ExpiresAt: time.Now().Add(time.Hour),
	}))

	require.NoError(t, store.RevokeFamily(ctx, "fam1"))

	// Both fam1 entries must report revoked.
	a, _ := store.Get(ctx, "a")
	b, _ := store.Get(ctx, "b")
	c, _ := store.Get(ctx, "c")
	assert.True(t, a.Revoked, "a (fam1) must be revoked")
	assert.True(t, b.Revoked, "b (fam1) must be revoked")
	assert.False(t, c.Revoked, "c (fam2) must NOT be revoked")

	// IsFamilyRevoked matches.
	revoked, _ := store.IsFamilyRevoked(ctx, "fam1")
	assert.True(t, revoked)
	revoked, _ = store.IsFamilyRevoked(ctx, "fam2")
	assert.False(t, revoked)
}

func TestInMemoryRefreshStore_SessionCounting(t *testing.T) {
	store := auth.NewInMemoryRefreshStore()
	ctx := context.Background()

	// User has 3 distinct families.
	for i, fam := range []string{"f1", "f2", "f3"} {
		require.NoError(t, store.Create(ctx, auth.RefreshSessionEntry{
			RawToken: string(rune('a' + i)), Sub: "u", FamilyID: fam,
			ExpiresAt: time.Now().Add(time.Hour),
		}))
	}

	count, err := store.CountActiveFamiliesForUser(ctx, "u")
	require.NoError(t, err)
	assert.Equal(t, 3, count, "three active families expected")

	// Revoke one — the count should drop.
	require.NoError(t, store.RevokeFamily(ctx, "f2"))
	count, _ = store.CountActiveFamiliesForUser(ctx, "u")
	assert.Equal(t, 2, count, "revoked family must not count")

	// Different user has no families.
	count, _ = store.CountActiveFamiliesForUser(ctx, "other-user")
	assert.Equal(t, 0, count)
}

func TestInMemoryRefreshStore_UserHasFamily(t *testing.T) {
	store := auth.NewInMemoryRefreshStore()
	ctx := context.Background()

	require.NoError(t, store.Create(ctx, auth.RefreshSessionEntry{
		RawToken: "x", Sub: "u", FamilyID: "f1", ExpiresAt: time.Now().Add(time.Hour),
	}))

	has, _ := store.UserHasFamily(ctx, "u", "f1")
	assert.True(t, has)

	has, _ = store.UserHasFamily(ctx, "u", "f2")
	assert.False(t, has, "unknown family returns false")

	has, _ = store.UserHasFamily(ctx, "other", "f1")
	assert.False(t, has, "different user returns false")
}

// F-006 Part B invariant: refresh sessions survive a service "restart".
// The test simulates a restart by constructing two separate JWTService
// instances against the SAME store — the second one must be able to
// rotate a refresh token issued by the first one, which is only
// possible if the refresh session state is persisted to the shared store.
func TestJWTService_RefreshSessionsSurviveRestart(t *testing.T) {
	store := auth.NewInMemoryRefreshStore()
	cfg := auth.JWTConfig{
		AccessTokenExpiry:  15 * time.Minute,
		RefreshTokenExpiry: 7 * 24 * time.Hour,
		MaxSessions:        5,
	}

	// "Original" service instance.
	svc1 := auth.NewJWTService(cfg).(interface {
		WithRefreshStore(auth.RefreshSessionStore) auth.JWTService
	}).WithRefreshStore(store)

	ctx := context.Background()
	refreshToken, err := svc1.GenerateRefreshTokenWithClaims(ctx,
		"user-1", "family-1", "ws-1", "Owner", "photographer", "state-1")
	require.NoError(t, err)

	// "Restart" — new service instance against the same store.
	svc2 := auth.NewJWTService(cfg).(interface {
		WithRefreshStore(auth.RefreshSessionStore) auth.JWTService
	}).WithRefreshStore(store)

	// svc2 must be able to rotate the token issued by svc1 — this is
	// only possible if the refresh session state lives in the shared
	// store, not in the process-local maps.
	newAccess, newRefresh, err := svc2.RotateRefreshToken(ctx, refreshToken)
	require.NoError(t, err, "refresh token issued before restart must still rotate")
	assert.NotEmpty(t, newAccess)
	assert.NotEmpty(t, newRefresh)
	assert.NotEqual(t, refreshToken, newRefresh, "rotated token must differ")
}

// The session-limit check must reject a 6th concurrent session when
// MaxSessions is 5. Regression guard for the limit enforcement path
// which moved from in-process maps to the store in F-006 Part B.
func TestJWTService_SessionLimit_Enforced(t *testing.T) {
	store := auth.NewInMemoryRefreshStore()
	cfg := auth.JWTConfig{
		AccessTokenExpiry:  15 * time.Minute,
		RefreshTokenExpiry: 7 * 24 * time.Hour,
		MaxSessions:        3,
	}
	svc := auth.NewJWTService(cfg).(interface {
		WithRefreshStore(auth.RefreshSessionStore) auth.JWTService
	}).WithRefreshStore(store)

	ctx := context.Background()
	// Issue 3 concurrent sessions for the same user — should all succeed.
	for i, fam := range []string{"fam-a", "fam-b", "fam-c"} {
		_, err := svc.GenerateRefreshToken(ctx, "u", fam)
		require.NoError(t, err, "session %d (%s) should succeed", i, fam)
	}

	// The 4th must fail.
	_, err := svc.GenerateRefreshToken(ctx, "u", "fam-d")
	require.Error(t, err, "4th concurrent family must exceed MaxSessions=3")
	assert.Contains(t, err.Error(), "max concurrent sessions")
}
