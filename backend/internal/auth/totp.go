package auth

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"sync"
	"time"

	"github.com/pquerna/otp/totp"
)

// F-007 (M17 hardening wave 1): TOTP MFA service.
//
// Wraps github.com/pquerna/otp/totp (RFC 6238) behind a minimal interface
// the auth handler can depend on. The service is stateless with respect to
// secret lifecycle (callers own persistence via user_mfa_enrollments repo;
// verification is stateless given the shared secret) but keeps a small
// in-process used-code cache for replay protection — see F-058 below.
//
// Decision packet: docs/superpowers/plans/2026-04-11-m17-decision-packet.md §3.1
//
// AGENTS.md auth model note: TOTP here is the authenticator-app second
// factor added AFTER password verification in the login flow. It is
// distinct from the email-OTP used only at registration. Do not conflate.

const defaultTOTPIssuer = "RawDrive"

// totpReplayWindow bounds how long a successfully-consumed (secret, code)
// pair stays in the used-code cache. github.com/pquerna/otp/totp.Validate
// uses Period=30s with Skew=1, so a single code is accepted across three
// counters (current, ±1) — a ~90s validity envelope. We keep entries for
// that full envelope plus a small buffer so a code can never be replayed
// while it is still cryptographically valid.
const totpReplayWindow = 90*time.Second + 30*time.Second

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

	// usedCodes provides F-058 replay protection. It maps a
	// sha256(secret + ":" + code) digest to the time the entry should be
	// evicted. A code is recorded only AFTER it validates, so failed
	// attempts never poison the cache, and a valid code can be verified at
	// most once per TOTP validity window. Keying on the secret digest
	// scopes deduplication per enrollment (every user has a distinct
	// secret) without widening the Verify signature.
	//
	// In-process sync.Map mirrors the consumedChallenges pattern in
	// mfa_handler.go: the validity window (~90s) is far shorter than any
	// realistic restart, and brute force is already bounded by the global
	// 60/min rate limiter. A horizontal scale-out would back this with
	// Valkey; tracked alongside the consumedChallenges scale-out note.
	usedCodes sync.Map

	// now is overridable in tests; defaults to time.Now.
	now func() time.Time
}

// NewTOTPService constructs a TOTP service. An empty Issuer defaults to
// "RawDrive" so enrollments never produce malformed otpauth URLs.
func NewTOTPService(config TOTPConfig) TOTPService {
	if config.Issuer == "" {
		config.Issuer = defaultTOTPIssuer
	}
	return &totpService{config: config, now: time.Now}
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
//
// F-058 (replay protection): once a code validates for a given secret it is
// recorded and any subsequent presentation of the same (secret, code) pair
// within the TOTP validity window is rejected as a replay. This is
// defense-in-depth on top of the single-use mfa_token consumed by
// MFAHandler.VerifyTOTP — it closes the same-window replay gap for any
// caller (login step-up, enrollment verification) without relying on the
// challenge-token layer.
func (s *totpService) Verify(ctx context.Context, secret, code string) (bool, error) {
	if secret == "" {
		return false, errors.New("totp: secret required")
	}
	if code == "" {
		return false, errors.New("totp: code required")
	}
	if !totp.Validate(code, secret) {
		return false, nil
	}
	if !s.markCodeUsed(secret, code) {
		// Cryptographically valid but already consumed within its window —
		// treat as an invalid code so a replay yields no session.
		return false, nil
	}
	return true, nil
}

// markCodeUsed atomically records a successfully-validated (secret, code)
// pair. It returns true if this call performed the recording (the pair was
// not previously seen) and false if the pair was already consumed within
// its validity window.
//
// The key is sha256(secret + ":" + code) so neither the plaintext secret
// nor the bare code is held verbatim in the map. Opportunistic eviction
// sweeps up to 16 expired entries per call to keep the map bounded without
// a background goroutine — same discipline as consumeChallengeToken.
func (s *totpService) markCodeUsed(secret, code string) bool {
	nowFn := s.now
	if nowFn == nil {
		nowFn = time.Now
	}
	now := nowFn()

	sum := sha256.Sum256([]byte(secret + ":" + code))
	key := hex.EncodeToString(sum[:])
	evictAt := now.Add(totpReplayWindow)

	if _, loaded := s.usedCodes.LoadOrStore(key, evictAt); loaded {
		return false
	}

	swept := 0
	s.usedCodes.Range(func(k, v any) bool {
		if ts, ok := v.(time.Time); ok && now.After(ts) {
			s.usedCodes.Delete(k)
			swept++
		}
		return swept < 16
	})

	return true
}
