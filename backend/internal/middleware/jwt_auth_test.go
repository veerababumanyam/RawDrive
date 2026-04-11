package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/rawdrive/backend/internal/auth"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
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
