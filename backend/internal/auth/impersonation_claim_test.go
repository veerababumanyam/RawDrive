package auth_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/auth"
)

// S5-G1 (audit HIGH): impersonation JWT claim round-trip tests.
//
// Admin "impersonation" was documented as read-only but the minted token was
// byte-for-byte identical to a real session, so an impersonating admin had full
// read/WRITE. The fix adds an "impersonation" boolean claim that
// RejectImpersonationWrites (middleware) gates mutating methods on. These tests
// prove the claim is signed and parsed correctly for both states.

func newImpersonationTestJWTService(t *testing.T) auth.JWTService {
	t.Helper()
	return auth.NewJWTService(auth.JWTConfig{
		AccessTokenExpiry:  15 * time.Minute,
		RefreshTokenExpiry: 30 * 24 * time.Hour,
		MaxSessions:        5,
	})
}

func TestTokenClaims_ImpersonationRoundTripTrue(t *testing.T) {
	svc := newImpersonationTestJWTService(t)
	ctx := context.Background()

	token, err := svc.GenerateAccessToken(ctx, auth.TokenClaims{
		Sub:           "user-uuid-123",
		WorkspaceID:   "ws-uuid-456",
		Role:          "Owner",
		PlatformRole:  "photographer",
		StateID:       "state-uuid-789",
		Impersonation: true,
	})
	require.NoError(t, err)

	parsed, err := svc.ParseAccessToken(ctx, token)
	require.NoError(t, err)
	assert.True(t, parsed.Impersonation, "impersonation=true must round-trip")
}

func TestTokenClaims_ImpersonationRoundTripFalse(t *testing.T) {
	svc := newImpersonationTestJWTService(t)
	ctx := context.Background()

	// Zero value — a normal login/refresh token. The claim defaults to false.
	token, err := svc.GenerateAccessToken(ctx, auth.TokenClaims{
		Sub:          "user-uuid-123",
		WorkspaceID:  "ws-uuid-456",
		Role:         "Owner",
		PlatformRole: "photographer",
		StateID:      "state-uuid-789",
	})
	require.NoError(t, err)

	parsed, err := svc.ParseAccessToken(ctx, token)
	require.NoError(t, err)
	assert.False(t, parsed.Impersonation, "unset impersonation must parse as false (read-write)")
}
