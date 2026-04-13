package auth_test

// M30 / E100-S1 — Argon2id PIN hashing.
//
// These tests intentionally reference auth.HashPIN / auth.VerifyPIN which
// do NOT exist yet. TDD RED: this file must compile AS PART OF THE AUTH
// PACKAGE TESTS but the test run must FAIL because the symbols are missing.
//
// Once Green phase implements backend/internal/auth/argon2.go with the
// signatures below, these tests should pass.

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/auth"
)

func TestHashPIN_ProducesArgon2idEncodedString(t *testing.T) {
	hash, err := auth.HashPIN("123456")
	require.NoError(t, err)
	require.NotEmpty(t, hash)
	// PHC string format: $argon2id$v=19$m=...,t=...,p=...$<salt>$<hash>
	assert.True(t, strings.HasPrefix(hash, "$argon2id$"), "expected $argon2id$ prefix, got %q", hash)
	assert.Contains(t, hash, "v=19")
	assert.Contains(t, hash, "m=65536") // 64 MB per ADR-014-02
	assert.Contains(t, hash, "t=3")
	assert.Contains(t, hash, "p=4")
}

func TestHashPIN_ProducesUniqueHashesForSamePIN(t *testing.T) {
	// Salt must be random — identical PIN must NOT produce identical hash.
	h1, err := auth.HashPIN("123456")
	require.NoError(t, err)
	h2, err := auth.HashPIN("123456")
	require.NoError(t, err)
	assert.NotEqual(t, h1, h2, "HashPIN must use a random salt so identical PINs produce different hashes")
}

func TestVerifyPIN_AcceptsCorrectPIN(t *testing.T) {
	hash, err := auth.HashPIN("654321")
	require.NoError(t, err)

	ok, err := auth.VerifyPIN("654321", hash)
	require.NoError(t, err)
	assert.True(t, ok, "VerifyPIN must return true for the correct PIN")
}

func TestVerifyPIN_RejectsIncorrectPIN(t *testing.T) {
	hash, err := auth.HashPIN("111111")
	require.NoError(t, err)

	ok, err := auth.VerifyPIN("222222", hash)
	require.NoError(t, err)
	assert.False(t, ok, "VerifyPIN must return false for the wrong PIN")
}

func TestVerifyPIN_RejectsEmptyHash(t *testing.T) {
	ok, err := auth.VerifyPIN("123456", "")
	require.Error(t, err, "VerifyPIN must return an error for empty stored hash")
	assert.False(t, ok)
}

func TestVerifyPIN_RejectsMalformedHash(t *testing.T) {
	ok, err := auth.VerifyPIN("123456", "not-a-real-phc-string")
	require.Error(t, err)
	assert.False(t, ok)
}

func TestHashPIN_RejectsEmptyPIN(t *testing.T) {
	_, err := auth.HashPIN("")
	require.Error(t, err, "HashPIN must reject an empty PIN")
}
