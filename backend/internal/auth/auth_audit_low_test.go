package auth

// Regression tests for low-severity audit findings F-102, F-103, F-107
// (audit 2026-05-30). All three live in auth.go.
//
//   - F-102: OTPService.Validate must compare the stored code against the
//     user-supplied code with crypto/subtle.ConstantTimeCompare, not the
//     timing-leaky `!=` operator.
//   - F-103: access tokens must carry, and ParseAccessToken must enforce, the
//     `iss` (issuer) and `aud` (audience) claims so a token minted for this
//     service is rejected by anything that merely trusts the same key.
//   - F-107: NewJWTService must not panic on RSA-key generation failure; it
//     uses log.Fatalf (fail-fast at startup) instead.

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// ──────────────────────────── F-102 ────────────────────────────

// TestF102_OTPValidateUsesConstantTimeCompare is a source-level guard: the
// behavioural result of the fix is identical (wrong code still rejected, right
// code still accepted), so the only durable regression signal is that the
// vulnerable `entry.code != code` comparison is gone and the constant-time
// comparison is present. A pure timing test would be inherently flaky.
func TestF102_OTPValidateUsesConstantTimeCompare(t *testing.T) {
	src := readAuthSource(t)

	if strings.Contains(src, "entry.code != code") {
		t.Fatalf("F-102 regression: otpService.Validate still uses the timing-leaky `entry.code != code` comparison")
	}
	if !strings.Contains(src, "subtle.ConstantTimeCompare([]byte(entry.code), []byte(code))") {
		t.Fatalf("F-102 regression: otpService.Validate no longer uses subtle.ConstantTimeCompare on the OTP code")
	}
}

// TestF102_OTPValidateBehaviourUnchanged confirms the constant-time swap did not
// alter the accept/reject contract.
func TestF102_OTPValidateBehaviourUnchanged(t *testing.T) {
	svc := NewOTPService(OTPConfig{
		CodeLength:      6,
		Expiry:          5 * time.Minute,
		MaxAttempts:     3,
		RateLimitMax:    5,
		RateLimitWindow: time.Minute,
	})
	ctx := context.Background()

	code, err := svc.Generate(ctx, "user@example.com")
	if err != nil {
		t.Fatalf("Generate failed: %v", err)
	}

	// Wrong code is rejected.
	wrong := "000000"
	if code == wrong {
		wrong = "111111"
	}
	ok, err := svc.Validate(ctx, "user@example.com", wrong)
	if err != nil {
		t.Fatalf("Validate(wrong) returned error: %v", err)
	}
	if ok {
		t.Fatalf("expected wrong code to be rejected")
	}

	// Correct code still passes.
	ok, err = svc.Validate(ctx, "user@example.com", code)
	if err != nil {
		t.Fatalf("Validate(correct) returned error: %v", err)
	}
	if !ok {
		t.Fatalf("expected correct code to be accepted")
	}
}

// ──────────────────────────── F-103 ────────────────────────────

func f103Config() JWTConfig {
	return JWTConfig{
		AccessTokenExpiry:  15 * time.Minute,
		RefreshTokenExpiry: 24 * time.Hour,
		MaxSessions:        5,
	}
}

func f103Claims() TokenClaims {
	return TokenClaims{
		Sub:          "user-123",
		WorkspaceID:  "ws-456",
		Role:         "Owner",
		PlatformRole: "photographer",
		StateID:      "state-789",
	}
}

// TestF103_AccessTokenCarriesIssuerAndAudience asserts generated access tokens
// embed the iss/aud claims.
func TestF103_AccessTokenCarriesIssuerAndAudience(t *testing.T) {
	svc := NewJWTService(f103Config())
	ctx := context.Background()

	tokenStr, err := svc.GenerateAccessToken(ctx, f103Claims())
	if err != nil {
		t.Fatalf("GenerateAccessToken failed: %v", err)
	}

	js, ok := svc.(*jwtService)
	if !ok {
		t.Fatalf("expected *jwtService, got %T", svc)
	}

	parsed, err := jwt.Parse(tokenStr, func(*jwt.Token) (interface{}, error) {
		return js.publicKey, nil
	})
	if err != nil {
		t.Fatalf("raw parse failed: %v", err)
	}
	mc, ok := parsed.Claims.(jwt.MapClaims)
	if !ok {
		t.Fatalf("expected MapClaims, got %T", parsed.Claims)
	}

	iss, err := mc.GetIssuer()
	if err != nil || iss != jwtIssuer {
		t.Fatalf("F-103 regression: expected iss=%q, got %q (err=%v)", jwtIssuer, iss, err)
	}
	aud, err := mc.GetAudience()
	if err != nil {
		t.Fatalf("GetAudience failed: %v", err)
	}
	if len(aud) != 1 || aud[0] != jwtAudience {
		t.Fatalf("F-103 regression: expected aud=[%q], got %v", jwtAudience, aud)
	}
}

// TestF103_ParseRejectsWrongAudience forges a token signed with this service's
// own key but bound to a different audience/issuer (a cross-service confusion
// scenario). ParseAccessToken must reject it.
func TestF103_ParseRejectsWrongAudience(t *testing.T) {
	svc := NewJWTService(f103Config())
	ctx := context.Background()

	js, ok := svc.(*jwtService)
	if !ok {
		t.Fatalf("expected *jwtService, got %T", svc)
	}

	now := time.Now()
	forged := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"sub":           "user-123",
		"workspace_id":  "ws-456",
		"role":          "Owner",
		"platform_role": "photographer",
		"state_id":      "state-789",
		"iss":           "some-other-service",
		"aud":           jwt.ClaimStrings{"some-other-service"},
		"exp":           now.Add(15 * time.Minute).Unix(),
		"iat":           now.Unix(),
	})
	forgedStr, err := forged.SignedString(js.privateKey)
	if err != nil {
		t.Fatalf("signing forged token failed: %v", err)
	}

	if _, err := svc.ParseAccessToken(ctx, forgedStr); err == nil {
		t.Fatalf("F-103 regression: ParseAccessToken accepted a token bound to a foreign audience/issuer")
	}

	// A legitimately-issued token must still parse.
	good, err := svc.GenerateAccessToken(ctx, f103Claims())
	if err != nil {
		t.Fatalf("GenerateAccessToken failed: %v", err)
	}
	if _, err := svc.ParseAccessToken(ctx, good); err != nil {
		t.Fatalf("ParseAccessToken rejected a legitimately-issued token: %v", err)
	}
}

// TestF103_ParseEnforcesOptionsInSource guards that ParseAccessToken passes the
// issuer + audience parser options (so the enforcement is not silently dropped
// by a future refactor of the parse call).
func TestF103_ParseEnforcesOptionsInSource(t *testing.T) {
	src := readAuthSource(t)
	if !strings.Contains(src, "jwt.WithIssuer(jwtIssuer)") {
		t.Fatalf("F-103 regression: ParseAccessToken no longer passes jwt.WithIssuer")
	}
	if !strings.Contains(src, "jwt.WithAudience(jwtAudience)") {
		t.Fatalf("F-103 regression: ParseAccessToken no longer passes jwt.WithAudience")
	}
}

// ──────────────────────────── F-107 ────────────────────────────

// TestF107_NewJWTServiceDoesNotPanic asserts the constructor no longer uses a
// bare panic for the RSA-generation failure path and that the happy path yields
// a working service. The os.Exit path (log.Fatalf) is not exercisable in-process
// without a subprocess harness; a source-level guard covers it.
func TestF107_NewJWTServiceDoesNotPanic(t *testing.T) {
	src := readAuthSource(t)
	if strings.Contains(src, `panic("failed to generate RSA key`) {
		t.Fatalf("F-107 regression: NewJWTService still panics on RSA-key generation failure")
	}
	if !strings.Contains(src, "log.Fatalf(\"auth: failed to generate RSA key for JWT service") {
		t.Fatalf("F-107 regression: NewJWTService no longer fails fast via log.Fatalf")
	}

	// Happy path still produces a usable service.
	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("F-107 regression: NewJWTService panicked on the happy path: %v", r)
		}
	}()
	svc := NewJWTService(f103Config())
	if svc == nil {
		t.Fatalf("expected non-nil service")
	}
}

// readAuthSource returns the contents of auth.go for source-level guards.
func readAuthSource(t *testing.T) string {
	t.Helper()
	b, err := os.ReadFile("auth.go")
	if err != nil {
		t.Fatalf("read auth.go: %v", err)
	}
	return string(b)
}
