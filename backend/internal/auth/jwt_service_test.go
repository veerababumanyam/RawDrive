package auth_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/auth"
)

func newTestJWTService(t *testing.T) auth.JWTService {
	t.Helper()
	return auth.NewJWTService(auth.JWTConfig{
		AccessTokenExpiry:  15 * time.Minute,
		RefreshTokenExpiry: 30 * 24 * time.Hour, // 30 days
		MaxSessions:        5,
	})
}

func testClaims() auth.TokenClaims {
	return auth.TokenClaims{
		Sub:         "user-uuid-123",
		WorkspaceID: "ws-uuid-456",
		Role:        "Owner",
		StateID:     "state-uuid-789",
	}
}

func TestGenerateAccessToken(t *testing.T) {
	svc := newTestJWTService(t)
	ctx := context.Background()

	token, err := svc.GenerateAccessToken(ctx, testClaims())
	require.NoError(t, err)
	assert.NotEmpty(t, token, "access token must not be empty")
	// RS256 JWTs have 3 dot-separated parts
	assert.Regexp(t, `^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$`, token)
}

func TestGenerateAccessToken_Claims(t *testing.T) {
	svc := newTestJWTService(t)
	ctx := context.Background()

	token, err := svc.GenerateAccessToken(ctx, testClaims())
	require.NoError(t, err)

	parsed, err := svc.ParseAccessToken(ctx, token)
	require.NoError(t, err)

	assert.Equal(t, "user-uuid-123", parsed.Sub)
	assert.Equal(t, "ws-uuid-456", parsed.WorkspaceID)
	assert.Equal(t, "Owner", parsed.Role)
	assert.Equal(t, "state-uuid-789", parsed.StateID)
	assert.False(t, parsed.ExpiresAt.IsZero(), "exp claim must be set")
}

func TestAccessTokenExpiry(t *testing.T) {
	svc := auth.NewJWTService(auth.JWTConfig{
		AccessTokenExpiry:  1 * time.Millisecond,
		RefreshTokenExpiry: 30 * 24 * time.Hour,
		MaxSessions:        5,
	})
	ctx := context.Background()

	token, err := svc.GenerateAccessToken(ctx, testClaims())
	require.NoError(t, err)

	time.Sleep(10 * time.Millisecond)

	_, err = svc.ParseAccessToken(ctx, token)
	assert.Error(t, err, "expired access token should be rejected")
}

func TestGenerateRefreshToken(t *testing.T) {
	svc := newTestJWTService(t)
	ctx := context.Background()

	token, err := svc.GenerateRefreshToken(ctx, "user-uuid-123", "family-uuid-001")
	require.NoError(t, err)
	assert.NotEmpty(t, token, "refresh token must not be empty")
}

func TestRefreshTokenRotation(t *testing.T) {
	svc := newTestJWTService(t)
	ctx := context.Background()

	claims := testClaims()
	_, err := svc.GenerateAccessToken(ctx, claims)
	require.NoError(t, err)

	oldRefresh, err := svc.GenerateRefreshToken(ctx, claims.Sub, "family-uuid-001")
	require.NoError(t, err)

	newAccess, newRefresh, err := svc.RotateRefreshToken(ctx, oldRefresh)
	require.NoError(t, err)
	assert.NotEmpty(t, newAccess)
	assert.NotEmpty(t, newRefresh)
	assert.NotEqual(t, oldRefresh, newRefresh, "rotated refresh token must differ")
}

func TestRefreshTokenReuse(t *testing.T) {
	svc := newTestJWTService(t)
	ctx := context.Background()

	claims := testClaims()
	oldRefresh, err := svc.GenerateRefreshToken(ctx, claims.Sub, "family-uuid-001")
	require.NoError(t, err)

	// Rotate once (old token is now revoked)
	_, _, err = svc.RotateRefreshToken(ctx, oldRefresh)
	require.NoError(t, err)

	// Reusing the old (revoked) token should terminate all sessions in the family
	_, _, err = svc.RotateRefreshToken(ctx, oldRefresh)
	assert.Error(t, err, "reuse of revoked refresh token should fail and revoke family")
}

func TestRefreshTokenSlidingWindow(t *testing.T) {
	svc := newTestJWTService(t)
	ctx := context.Background()

	claims := testClaims()
	refresh, err := svc.GenerateRefreshToken(ctx, claims.Sub, "family-uuid-001")
	require.NoError(t, err)

	// Rotation should extend the refresh expiry (sliding window)
	_, newRefresh, err := svc.RotateRefreshToken(ctx, refresh)
	require.NoError(t, err)

	info, err := svc.InspectRefreshToken(ctx, newRefresh)
	require.NoError(t, err)
	assert.True(t, info.ExpiresAt.After(time.Now().Add(29*24*time.Hour)),
		"sliding window should extend expiry close to 30 days from rotation")
}

func TestTokenFamilyTracking(t *testing.T) {
	svc := newTestJWTService(t)
	ctx := context.Background()

	familyID := "family-uuid-002"
	refresh1, err := svc.GenerateRefreshToken(ctx, "user-uuid-123", familyID)
	require.NoError(t, err)

	_, refresh2, err := svc.RotateRefreshToken(ctx, refresh1)
	require.NoError(t, err)

	info1, err := svc.InspectRefreshToken(ctx, refresh2)
	require.NoError(t, err)
	assert.Equal(t, familyID, info1.FamilyID, "rotated token should belong to same family")
}

func TestLogout_RevokesAllTokens(t *testing.T) {
	svc := newTestJWTService(t)
	ctx := context.Background()

	claims := testClaims()
	refresh, err := svc.GenerateRefreshToken(ctx, claims.Sub, "family-uuid-001")
	require.NoError(t, err)

	err = svc.RevokeSession(ctx, "family-uuid-001")
	require.NoError(t, err)

	_, _, err = svc.RotateRefreshToken(ctx, refresh)
	assert.Error(t, err, "tokens should be revoked after logout")
}

func TestConcurrentSessionLimit(t *testing.T) {
	svc := newTestJWTService(t)
	ctx := context.Background()

	userID := "user-uuid-123"
	for i := 0; i < 5; i++ {
		_, err := svc.GenerateRefreshToken(ctx, userID, "family-"+string(rune('A'+i)))
		require.NoError(t, err, "session %d should succeed", i+1)
	}

	_, err := svc.GenerateRefreshToken(ctx, userID, "family-F")
	assert.Error(t, err, "6th session should be rejected (max 5)")
}

func TestGenerateRefreshTokenReplacingOldest_ReclaimsSessionSlot(t *testing.T) {
	svc := auth.NewJWTService(auth.JWTConfig{
		AccessTokenExpiry:  15 * time.Minute,
		RefreshTokenExpiry: 30 * 24 * time.Hour,
		MaxSessions:        1,
	})
	ctx := context.Background()

	oldRefresh, err := svc.GenerateRefreshTokenWithClaims(ctx, "user-uuid-123", "family-old", "ws-uuid-456", "Owner", "photographer", "state-uuid-789")
	require.NoError(t, err)

	_, err = svc.GenerateRefreshTokenWithClaims(ctx, "user-uuid-123", "family-blocked", "ws-uuid-456", "Owner", "photographer", "state-uuid-789")
	require.Error(t, err, "plain refresh token creation must still enforce the session cap")

	newRefresh, err := svc.GenerateRefreshTokenWithClaimsReplacingOldest(ctx, "user-uuid-123", "family-new", "ws-uuid-456", "Owner", "photographer", "state-uuid-789")
	require.NoError(t, err)
	require.NotEmpty(t, newRefresh)

	_, _, err = svc.RotateRefreshToken(ctx, oldRefresh)
	require.Error(t, err, "oldest family should be revoked before issuing the replacement session")

	newAccess, rotatedRefresh, err := svc.RotateRefreshToken(ctx, newRefresh)
	require.NoError(t, err, "replacement session should remain usable")
	assert.NotEmpty(t, newAccess)
	assert.NotEmpty(t, rotatedRefresh)
}

func TestTokenTampering(t *testing.T) {
	svc := newTestJWTService(t)
	ctx := context.Background()

	token, err := svc.GenerateAccessToken(ctx, testClaims())
	require.NoError(t, err)

	parts := strings.Split(token, ".")
	require.Len(t, parts, 3)

	signature := parts[2]
	mid := len(signature) / 2
	replacement := "A"
	if signature[mid:mid+1] == replacement {
		replacement = "B"
	}
	parts[2] = signature[:mid] + replacement + signature[mid+1:]
	tampered := strings.Join(parts, ".")

	_, err = svc.ParseAccessToken(ctx, tampered)
	assert.Error(t, err, "tampered token should be rejected")
}

func TestTokenWithInvalidClaims(t *testing.T) {
	svc := newTestJWTService(t)
	ctx := context.Background()

	// Missing required claims
	incompleteClaims := auth.TokenClaims{
		Sub: "user-uuid-123",
		// WorkspaceID, Role, StateID are missing
	}

	_, err := svc.GenerateAccessToken(ctx, incompleteClaims)
	assert.Error(t, err, "token with missing required claims should be rejected")
}
