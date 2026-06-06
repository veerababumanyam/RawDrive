package auth

import (
	"crypto/rand"
	"encoding/hex"

	"golang.org/x/crypto/bcrypt"
)

// F-007 (M17 hardening wave 1): one-time recovery codes.
//
// Generated at TOTP enrollment, stored bcrypt-hashed, consumed on first use.
// The plaintext is shown to the user exactly once and then discarded — only
// the hash is persisted. This matches the decision packet §3.1: 10 codes
// per user, 10 hex characters per code, bcrypt at default cost.

const (
	defaultRecoveryCodeCount = 10
	recoveryCodeByteLen      = 5 // 5 random bytes → 10 hex chars
	// recoveryBcryptCost is intentionally set above bcrypt.DefaultCost (10).
	// Recovery codes are single-use MFA bypass credentials — higher value
	// than passwords — so a slightly more expensive hash hurts offline
	// cracking if the hashes table is ever exfiltrated. Cost 12 is ~4x
	// slower than 10 and still < 500ms on commodity hardware.
	recoveryBcryptCost = 12
)

// RecoveryCodeConfig customizes recovery-code generation. Zero values use
// defaults: 10 codes per user, 10 hex characters per code.
type RecoveryCodeConfig struct {
	Count      int
	BcryptCost int
}

// RecoveryCodes is the result of Generate. Plaintext[i] pairs with Hashes[i]
// for the same logical code. Callers show Plaintext to the user once,
// persist Hashes to user_mfa_recovery_codes, then drop Plaintext.
type RecoveryCodes struct {
	Plaintext []string
	Hashes    []string
}

// RecoveryCodeService generates and verifies one-time recovery codes.
type RecoveryCodeService interface {
	Generate() (*RecoveryCodes, error)
	Verify(plaintext, hash string) bool
}

type recoveryCodeService struct {
	config RecoveryCodeConfig
}

// NewRecoveryCodeService constructs a recovery code service. Count<=0
// defaults to 10 per the decision packet.
func NewRecoveryCodeService(config RecoveryCodeConfig) RecoveryCodeService {
	if config.Count <= 0 {
		config.Count = defaultRecoveryCodeCount
	}
	if config.BcryptCost <= 0 {
		config.BcryptCost = recoveryBcryptCost
	}
	return &recoveryCodeService{config: config}
}

// Generate produces config.Count fresh recovery codes with matching bcrypt
// hashes. Returns an error on any crypto/rand or bcrypt failure.
func (s *recoveryCodeService) Generate() (*RecoveryCodes, error) {
	plaintext := make([]string, s.config.Count)
	hashes := make([]string, s.config.Count)
	for i := 0; i < s.config.Count; i++ {
		code, err := generateRecoveryCode()
		if err != nil {
			return nil, err
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(code), s.config.BcryptCost)
		if err != nil {
			return nil, err
		}
		plaintext[i] = code
		hashes[i] = string(hash)
	}
	return &RecoveryCodes{Plaintext: plaintext, Hashes: hashes}, nil
}

// Verify returns true iff plaintext matches the bcrypt hash. Empty inputs
// return false without touching bcrypt.
func (s *recoveryCodeService) Verify(plaintext, hash string) bool {
	if plaintext == "" || hash == "" {
		return false
	}
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plaintext)) == nil
}

func generateRecoveryCode() (string, error) {
	buf := make([]byte, recoveryCodeByteLen)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}
