package auth_test

import (
	"context"
	"testing"
	"time"

	"github.com/rawdrive/backend/internal/auth"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// F-007 (M17 hardening wave 1): mfa_verified JWT claim round-trip tests.
// Decision packet §3.1: access tokens issued AFTER a successful TOTP check
// carry mfa_verified=true; tokens issued from a password-only login path
// carry mfa_verified=false (zero value). Middleware gates platform-staff
// routes on mfa_verified==true OR an active grace window.

func newMFATestJWTService(t *testing.T) auth.JWTService {
	t.Helper()
	return auth.NewJWTService(auth.JWTConfig{
		AccessTokenExpiry:  15 * time.Minute,
		RefreshTokenExpiry: 30 * 24 * time.Hour,
		MaxSessions:        5,
	})
}

func TestTokenClaims_MFAVerifiedRoundTripTrue(t *testing.T) {
	svc := newMFATestJWTService(t)
	ctx := context.Background()

	token, err := svc.GenerateAccessToken(ctx, auth.TokenClaims{
		Sub:          "user-uuid-123",
		WorkspaceID:  "ws-uuid-456",
		Role:         "Owner",
		PlatformRole: "platform_admin",
		StateID:      "state-uuid-789",
		MFAVerified:  true,
	})
	require.NoError(t, err)

	parsed, err := svc.ParseAccessToken(ctx, token)
	require.NoError(t, err)
	assert.True(t, parsed.MFAVerified, "mfa_verified=true must round-trip")
}

func TestTokenClaims_MFAVerifiedRoundTripFalse(t *testing.T) {
	svc := newMFATestJWTService(t)
	ctx := context.Background()

	// Zero value — no MFA check happened. The claim defaults to false.
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
	assert.False(t, parsed.MFAVerified, "unset mfa_verified must parse as false")
}
