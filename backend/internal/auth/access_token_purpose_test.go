package auth

import (
	"context"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestParseAccessTokenRejectsMFAChallengePurpose(t *testing.T) {
	svc := NewJWTService(JWTConfig{
		AccessTokenExpiry:  15 * time.Minute,
		RefreshTokenExpiry: 24 * time.Hour,
		MaxSessions:        5,
	}).(*jwtService)

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"sub":           "user-1",
		"workspace_id":  "workspace-1",
		"role":          "Owner",
		"platform_role": "photographer",
		"state_id":      "state-1",
		"purpose":       "mfa_challenge",
		"exp":           time.Now().Add(5 * time.Minute).Unix(),
		"iat":           time.Now().Unix(),
	})
	tokenStr, err := token.SignedString(svc.privateKey)
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}

	if _, err := svc.ParseAccessToken(context.Background(), tokenStr); err == nil {
		t.Fatal("expected mfa_challenge token to be rejected as access token")
	}
}
