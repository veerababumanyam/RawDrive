package auth

import (
	"context"
	"testing"
	"time"

	"github.com/pquerna/otp/totp"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// F-007 (M17 hardening wave 1): TOTP MFA service tests.
// Decision packet: docs/superpowers/plans/2026-04-11-m17-decision-packet.md §3.1

func TestTOTPEnrollment_GeneratesValidSecret(t *testing.T) {
	svc := NewTOTPService(TOTPConfig{Issuer: "RawDrive"})

	enrollment, err := svc.Enroll(context.Background(), "user@example.com")
	require.NoError(t, err)

	assert.NotEmpty(t, enrollment.Secret, "secret must be non-empty")
	assert.NotEmpty(t, enrollment.OtpauthURL, "otpauth URL must be present for QR code")
	assert.Contains(t, enrollment.OtpauthURL, "RawDrive", "issuer must be in URL")
	assert.Contains(t, enrollment.OtpauthURL, "user@example.com", "account label must be in URL")
}

func TestTOTPEnrollment_RejectsEmptyAccountName(t *testing.T) {
	svc := NewTOTPService(TOTPConfig{Issuer: "RawDrive"})
	_, err := svc.Enroll(context.Background(), "")
	assert.Error(t, err)
}

func TestTOTPVerify_AcceptsValidCode(t *testing.T) {
	svc := NewTOTPService(TOTPConfig{Issuer: "RawDrive"})

	enrollment, err := svc.Enroll(context.Background(), "user@example.com")
	require.NoError(t, err)

	// Generate a valid code using the same secret at current time.
	code, err := totp.GenerateCode(enrollment.Secret, time.Now())
	require.NoError(t, err)

	ok, err := svc.Verify(context.Background(), enrollment.Secret, code)
	require.NoError(t, err)
	assert.True(t, ok, "valid TOTP code must verify")
}

func TestTOTPVerify_RejectsInvalidCode(t *testing.T) {
	svc := NewTOTPService(TOTPConfig{Issuer: "RawDrive"})

	enrollment, err := svc.Enroll(context.Background(), "user@example.com")
	require.NoError(t, err)

	ok, err := svc.Verify(context.Background(), enrollment.Secret, "000000")
	require.NoError(t, err)
	assert.False(t, ok, "invalid TOTP code must reject")
}

func TestTOTPVerify_RejectsEmptySecret(t *testing.T) {
	svc := NewTOTPService(TOTPConfig{Issuer: "RawDrive"})

	ok, err := svc.Verify(context.Background(), "", "123456")
	assert.Error(t, err, "empty secret must return error")
	assert.False(t, ok)
}

func TestTOTPVerify_RejectsEmptyCode(t *testing.T) {
	svc := NewTOTPService(TOTPConfig{Issuer: "RawDrive"})

	enrollment, err := svc.Enroll(context.Background(), "user@example.com")
	require.NoError(t, err)

	ok, err := svc.Verify(context.Background(), enrollment.Secret, "")
	assert.Error(t, err, "empty code must return error")
	assert.False(t, ok)
}

// F-058: a valid TOTP code must not be replayable within its validity
// window. The first Verify of a (secret, code) pair succeeds; an immediate
// second Verify of the SAME pair must be rejected as a replay, even though
// the underlying RFC 6238 check would still accept it for ~90 seconds.
func TestTOTPVerify_RejectsReplayedCode(t *testing.T) {
	svc := NewTOTPService(TOTPConfig{Issuer: "RawDrive"})

	enrollment, err := svc.Enroll(context.Background(), "user@example.com")
	require.NoError(t, err)

	code, err := totp.GenerateCode(enrollment.Secret, time.Now())
	require.NoError(t, err)

	ok, err := svc.Verify(context.Background(), enrollment.Secret, code)
	require.NoError(t, err)
	require.True(t, ok, "first presentation of a valid code must verify")

	// Replay the exact same code against the same secret within the window.
	ok, err = svc.Verify(context.Background(), enrollment.Secret, code)
	require.NoError(t, err)
	assert.False(t, ok, "replayed TOTP code must be rejected within its validity window")
}

// F-058: replay protection is scoped per secret. The same numeric code
// consumed for one enrollment must not block a different enrollment whose
// (distinct) secret happens to emit the same digits — so keying is on
// (secret, code), not the bare code.
func TestTOTPVerify_ReplayProtectionScopedPerSecret(t *testing.T) {
	svc := NewTOTPService(TOTPConfig{Issuer: "RawDrive"})

	enrollA, err := svc.Enroll(context.Background(), "a@example.com")
	require.NoError(t, err)
	enrollB, err := svc.Enroll(context.Background(), "b@example.com")
	require.NoError(t, err)

	now := time.Now()
	codeA, err := totp.GenerateCode(enrollA.Secret, now)
	require.NoError(t, err)
	codeB, err := totp.GenerateCode(enrollB.Secret, now)
	require.NoError(t, err)

	ok, err := svc.Verify(context.Background(), enrollA.Secret, codeA)
	require.NoError(t, err)
	require.True(t, ok)

	// B's code is independent of A's consumption — must still verify.
	ok, err = svc.Verify(context.Background(), enrollB.Secret, codeB)
	require.NoError(t, err)
	assert.True(t, ok, "consuming a code for secret A must not block secret B")
}

// F-058: a failed verification must NOT poison the cache. An attacker (or a
// fat-fingered user) submitting a wrong code must not lock out the genuine
// later submission of the correct code for the same window.
func TestTOTPVerify_FailedAttemptDoesNotConsumeWindow(t *testing.T) {
	svc := NewTOTPService(TOTPConfig{Issuer: "RawDrive"})

	enrollment, err := svc.Enroll(context.Background(), "user@example.com")
	require.NoError(t, err)

	// Wrong code first — must reject and must not record anything.
	ok, err := svc.Verify(context.Background(), enrollment.Secret, "000000")
	require.NoError(t, err)
	require.False(t, ok)

	// Correct code afterwards still succeeds.
	code, err := totp.GenerateCode(enrollment.Secret, time.Now())
	require.NoError(t, err)
	ok, err = svc.Verify(context.Background(), enrollment.Secret, code)
	require.NoError(t, err)
	assert.True(t, ok, "a prior failed attempt must not consume the code's one-time window")
}

// F-058: once an entry's eviction time has passed, the opportunistic sweep
// reclaims it so the same code could verify again in a later, distinct
// window. We drive time forward via the injectable clock to assert the
// cache does not grow unbounded and a genuinely new window is not blocked.
func TestTOTPVerify_ReplayWindowExpires(t *testing.T) {
	svc := NewTOTPService(TOTPConfig{Issuer: "RawDrive"}).(*totpService)

	enrollment, err := svc.Enroll(context.Background(), "user@example.com")
	require.NoError(t, err)

	base := time.Now()
	svc.now = func() time.Time { return base }

	code, err := totp.GenerateCode(enrollment.Secret, base)
	require.NoError(t, err)

	ok, err := svc.Verify(context.Background(), enrollment.Secret, code)
	require.NoError(t, err)
	require.True(t, ok)

	// Still within the window — replay rejected.
	ok, err = svc.Verify(context.Background(), enrollment.Secret, code)
	require.NoError(t, err)
	require.False(t, ok, "replay within window must be rejected")

	// Advance the clock past the replay window so the prior entry is
	// eligible for eviction. The same digits presented for a fresh window
	// must no longer be blocked by the stale cache entry.
	svc.now = func() time.Time { return base.Add(totpReplayWindow + time.Second) }

	// A new code for the advanced window — independent of the evicted entry.
	freshCode, err := totp.GenerateCode(enrollment.Secret, base.Add(totpReplayWindow+time.Second))
	require.NoError(t, err)
	// Note: totp.Validate uses real wall-clock time, so this only asserts
	// the cache state, not the RFC check. The genuine assertion here is that
	// the stale entry no longer occupies the map after a sweep.
	svc.markCodeUsed(enrollment.Secret, freshCode) // trigger sweep at advanced time

	count := 0
	svc.usedCodes.Range(func(_, _ any) bool { count++; return true })
	assert.LessOrEqual(t, count, 1, "expired replay-cache entries must be swept; only the fresh entry should remain")
}

func TestTOTPConfig_DefaultIssuerFallback(t *testing.T) {
	// Empty issuer must default to a safe value rather than producing an
	// invalid otpauth URL. Guards against misconfiguration at service init.
	svc := NewTOTPService(TOTPConfig{Issuer: ""})

	enrollment, err := svc.Enroll(context.Background(), "user@example.com")
	require.NoError(t, err)
	assert.NotEmpty(t, enrollment.OtpauthURL)
}
