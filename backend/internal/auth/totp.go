package auth

import (
	"context"
	"errors"

	"github.com/pquerna/otp/totp"
)

// F-007 (M17 hardening wave 1): TOTP MFA service.
//
// Wraps github.com/pquerna/otp/totp (RFC 6238) behind a minimal interface
// the auth handler can depend on. The service is stateless — callers own
// secret lifecycle (persistence via user_mfa_enrollments repo; verification
// is stateless given the shared secret).
//
// Decision packet: docs/superpowers/plans/2026-04-11-m17-decision-packet.md §3.1
//
// AGENTS.md auth model note: TOTP here is the authenticator-app second
// factor added AFTER password verification in the login flow. It is
// distinct from the email-OTP used only at registration. Do not conflate.

const defaultTOTPIssuer = "RawDrive"

// TOTPConfig carries the shared-secret issuer name. Users see this in their
// authenticator app (for example "RawDrive: alice@studio.com").
type TOTPConfig struct {
	Issuer string
}

// TOTPEnrollment is the result of Enroll: the plaintext secret (caller must
// encrypt before storing) and the otpauth:// URL the client renders as a QR.
type TOTPEnrollment struct {
	Secret     string // base32-encoded TOTP secret (plaintext — caller encrypts)
	OtpauthURL string // otpauth://totp/Issuer:account?secret=...&issuer=...
}

// TOTPService enrolls users and verifies TOTP codes.
type TOTPService interface {
	Enroll(ctx context.Context, accountName string) (*TOTPEnrollment, error)
	Verify(ctx context.Context, secret, code string) (bool, error)
}

type totpService struct {
	config TOTPConfig
}

// NewTOTPService constructs a stateless TOTP service. An empty Issuer
// defaults to "RawDrive" so enrollments never produce malformed otpauth URLs.
func NewTOTPService(config TOTPConfig) TOTPService {
	if config.Issuer == "" {
		config.Issuer = defaultTOTPIssuer
	}
	return &totpService{config: config}
}

// Enroll generates a fresh TOTP secret for the given account name and
// returns both the plaintext secret and the otpauth URL for QR rendering.
// The caller is responsible for envelope-encrypting the secret (F-005)
// before persisting to user_mfa_enrollments.
func (s *totpService) Enroll(ctx context.Context, accountName string) (*TOTPEnrollment, error) {
	if accountName == "" {
		return nil, errors.New("totp: account name required")
	}
	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      s.config.Issuer,
		AccountName: accountName,
	})
	if err != nil {
		return nil, err
	}
	return &TOTPEnrollment{
		Secret:     key.Secret(),
		OtpauthURL: key.URL(),
	}, nil
}

// Verify checks whether the given 6-digit code matches the shared secret
// at the current time. Returns (false, error) for empty inputs and
// (ok, nil) for normal verification results.
func (s *totpService) Verify(ctx context.Context, secret, code string) (bool, error) {
	if secret == "" {
		return false, errors.New("totp: secret required")
	}
	if code == "" {
		return false, errors.New("totp: code required")
	}
	return totp.Validate(code, secret), nil
}
