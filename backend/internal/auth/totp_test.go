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

func TestTOTPConfig_DefaultIssuerFallback(t *testing.T) {
	// Empty issuer must default to a safe value rather than producing an
	// invalid otpauth URL. Guards against misconfiguration at service init.
	svc := NewTOTPService(TOTPConfig{Issuer: ""})

	enrollment, err := svc.Enroll(context.Background(), "user@example.com")
	require.NoError(t, err)
	assert.NotEmpty(t, enrollment.OtpauthURL)
}
