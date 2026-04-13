package auth

// M30 / E100-S1 — Argon2id PIN hashing.
//
// PINs protecting live-stream access are stored as argon2id hashes in
// streams.pin_hash. Parameters per ADR-014-02:
//
//	memory      = 64 MB  (65536 KiB)
//	iterations  = 3
//	parallelism = 4
//	keyLen      = 32 bytes
//	saltLen     = 16 bytes
//
// The encoded PHC string matches the OWASP-recommended format:
//   $argon2id$v=19$m=65536,t=3,p=4$<base64-salt>$<base64-hash>

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

const (
	argonMemory     uint32 = 64 * 1024 // 64 MB
	argonIterations uint32 = 3
	argonParallel   uint8  = 4
	argonKeyLen     uint32 = 32
	argonSaltLen    uint32 = 16
	argonVersion           = argon2.Version
)

// ErrEmptyPIN is returned when HashPIN is called with an empty string.
var ErrEmptyPIN = errors.New("auth: PIN must not be empty")

// ErrInvalidHash is returned when VerifyPIN receives a malformed PHC string.
var ErrInvalidHash = errors.New("auth: stored hash is not a valid argon2id PHC string")

// HashPIN returns the argon2id PHC-encoded hash of the given PIN.
// Salt is 16 random bytes from crypto/rand.
func HashPIN(plainPIN string) (string, error) {
	if plainPIN == "" {
		return "", ErrEmptyPIN
	}
	salt := make([]byte, argonSaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("auth: read salt: %w", err)
	}
	key := argon2.IDKey([]byte(plainPIN), salt, argonIterations, argonMemory, argonParallel, argonKeyLen)
	return encodeArgon2idHash(salt, key), nil
}

// VerifyPIN returns true iff plainPIN matches the PHC-encoded stored hash.
// Comparison is constant-time. An error is returned only when the stored
// hash cannot be parsed — a simple mismatch returns (false, nil).
func VerifyPIN(plainPIN, storedHash string) (bool, error) {
	if storedHash == "" {
		return false, ErrInvalidHash
	}
	params, salt, expectedKey, err := decodeArgon2idHash(storedHash)
	if err != nil {
		return false, err
	}
	candidate := argon2.IDKey(
		[]byte(plainPIN),
		salt,
		params.iterations,
		params.memory,
		params.parallel,
		uint32(len(expectedKey)),
	)
	if subtle.ConstantTimeCompare(expectedKey, candidate) == 1 {
		return true, nil
	}
	return false, nil
}

type argon2Params struct {
	memory     uint32
	iterations uint32
	parallel   uint8
}

func encodeArgon2idHash(salt, key []byte) string {
	b64salt := base64.RawStdEncoding.EncodeToString(salt)
	b64key := base64.RawStdEncoding.EncodeToString(key)
	return fmt.Sprintf(
		"$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argonVersion, argonMemory, argonIterations, argonParallel, b64salt, b64key,
	)
}

func decodeArgon2idHash(encoded string) (argon2Params, []byte, []byte, error) {
	var empty argon2Params
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[0] != "" || parts[1] != "argon2id" {
		return empty, nil, nil, ErrInvalidHash
	}
	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil || version != argonVersion {
		return empty, nil, nil, ErrInvalidHash
	}
	var p argon2Params
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &p.memory, &p.iterations, &p.parallel); err != nil {
		return empty, nil, nil, ErrInvalidHash
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return empty, nil, nil, ErrInvalidHash
	}
	key, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return empty, nil, nil, ErrInvalidHash
	}
	return p, salt, key, nil
}
