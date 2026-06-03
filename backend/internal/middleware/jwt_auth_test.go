package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/auth"
)

func TestJWTAuthInjectsMFAVerifiedClaim(t *testing.T) {
	jwtSvc := auth.NewJWTService(auth.JWTConfig{
		AccessTokenExpiry:  15 * time.Minute,
		RefreshTokenExpiry: 7 * 24 * time.Hour,
		MaxSessions:        5,
	})

	token, err := jwtSvc.GenerateAccessToken(t.Context(), auth.TokenClaims{
		Sub:          "user-123",
		WorkspaceID:  "workspace-123",
		Role:         "Owner",
		PlatformRole: "admin",
		StateID:      "state-123",
		MFAVerified:  true,
	})
	require.NoError(t, err)

	handler := JWTAuth(jwtSvc)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims := JWTClaimsFromContext(r.Context())
		require.NotNil(t, claims)
		assert.Equal(t, true, claims["mfa_verified"])
		w.WriteHeader(http.StatusNoContent)
	}))

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusNoContent, rec.Code)
}

// TestF034_JWTAuthExposesUserIDClaim is a regression test for F-034.
// Several handlers (gallery duplication created_by, design-collab
// presence/lock sessions, design templates) read claims["user_id"] directly.
// Before the fix, JWTAuth never put a "user_id" key in claimsMap, so those
// reads returned "" and uuid.Parse("") silently produced uuid.Nil — losing
// user identity. This asserts the key is present and equals the subject UUID.
func TestF034_JWTAuthExposesUserIDClaim(t *testing.T) {
	jwtSvc := auth.NewJWTService(auth.JWTConfig{
		AccessTokenExpiry:  15 * time.Minute,
		RefreshTokenExpiry: 7 * 24 * time.Hour,
		MaxSessions:        5,
	})

	const userID = "11111111-1111-1111-1111-111111111111"
	token, err := jwtSvc.GenerateAccessToken(t.Context(), auth.TokenClaims{
		Sub:          userID,
		WorkspaceID:  "workspace-123",
		Role:         "Owner",
		PlatformRole: "admin",
		StateID:      "state-123",
	})
	require.NoError(t, err)

	handler := JWTAuth(jwtSvc)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims := JWTClaimsFromContext(r.Context())
		require.NotNil(t, claims)
		gotUserID, ok := claims["user_id"].(string)
		require.True(t, ok, "claims must expose a string user_id key")
		assert.Equal(t, userID, gotUserID, "user_id must mirror the subject UUID, not be empty")
		// user_id and sub must agree so existing sub-based handlers stay consistent.
		assert.Equal(t, claims["sub"], claims["user_id"])
		w.WriteHeader(http.StatusNoContent)
	}))

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusNoContent, rec.Code)
}
