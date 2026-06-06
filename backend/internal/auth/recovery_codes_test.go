package auth

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"
)

// F-007 (M17 hardening wave 1): recovery code service tests.
// Decision packet §3.1: 10 codes per user, bcrypt-hashed, one-time use.

func TestRecoveryCodes_GenerateProducesTenDistinct(t *testing.T) {
	svc := newTestRecoveryCodeService()

	codes, err := svc.Generate()
	require.NoError(t, err)
	require.Len(t, codes.Plaintext, 10, "must generate exactly 10 codes by default")
	require.Len(t, codes.Hashes, 10, "must generate exactly 10 hashes by default")

	seen := make(map[string]bool)
	for _, code := range codes.Plaintext {
		assert.Len(t, code, 10, "each code is 10 hex chars (5 random bytes)")
		assert.False(t, seen[code], "no duplicate codes")
		seen[code] = true
	}
}

func TestRecoveryCodes_VerifyAcceptsValidCode(t *testing.T) {
	svc := newTestRecoveryCodeService()

	codes, err := svc.Generate()
	require.NoError(t, err)

	for i, plaintext := range codes.Plaintext {
		ok := svc.Verify(plaintext, codes.Hashes[i])
		assert.True(t, ok, "plaintext[%d] must verify against hashes[%d]", i, i)
	}
}

func TestRecoveryCodes_VerifyRejectsWrongCode(t *testing.T) {
	svc := newTestRecoveryCodeService()

	codes, err := svc.Generate()
	require.NoError(t, err)

	// Cross-verify: plaintext[0] should not match hashes[1..9].
	for i := 1; i < 10; i++ {
		ok := svc.Verify(codes.Plaintext[0], codes.Hashes[i])
		assert.False(t, ok, "plaintext[0] must not match hashes[%d]", i)
	}
}

func TestRecoveryCodes_VerifyRejectsEmptyInputs(t *testing.T) {
	svc := newTestRecoveryCodeService()
	assert.False(t, svc.Verify("", "some-hash"))
	assert.False(t, svc.Verify("plaintext", ""))
	assert.False(t, svc.Verify("", ""))
}

func TestRecoveryCodes_HashesAreBcryptFormat(t *testing.T) {
	svc := newTestRecoveryCodeService()

	codes, err := svc.Generate()
	require.NoError(t, err)

	for i, hash := range codes.Hashes {
		assert.Regexp(t, `^\$2[aby]\$`, hash, "hashes[%d] must be bcrypt", i)
	}
}

func TestRecoveryCodes_CustomCountHonored(t *testing.T) {
	svc := newTestRecoveryCodeService(RecoveryCodeConfig{Count: 5})

	codes, err := svc.Generate()
	require.NoError(t, err)
	assert.Len(t, codes.Plaintext, 5)
	assert.Len(t, codes.Hashes, 5)
}

func TestRecoveryCodes_ZeroCountDefaults(t *testing.T) {
	svc := newTestRecoveryCodeService(RecoveryCodeConfig{Count: 0})

	codes, err := svc.Generate()
	require.NoError(t, err)
	assert.Len(t, codes.Plaintext, 10, "zero count must default to 10")
}

func TestRecoveryCodes_DefaultCostIsProductionCost(t *testing.T) {
	svc := NewRecoveryCodeService(RecoveryCodeConfig{}).(*recoveryCodeService)
	assert.Equal(t, recoveryBcryptCost, svc.config.BcryptCost)
}

func newTestRecoveryCodeService(configs ...RecoveryCodeConfig) RecoveryCodeService {
	config := RecoveryCodeConfig{BcryptCost: bcrypt.MinCost}
	if len(configs) > 0 {
		config = configs[0]
		if config.BcryptCost <= 0 {
			config.BcryptCost = bcrypt.MinCost
		}
	}
	return NewRecoveryCodeService(config)
}
