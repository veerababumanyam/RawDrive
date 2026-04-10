// Package crypto provides envelope encryption primitives used by the platform
// settings repository (and any future call site that needs at-rest encryption
// of small secrets).
//
// F-005 (audit 2026-04-10): before this package existed, platform_settings
// rows were stored in plaintext despite the documented "encrypted at rest"
// contract. The envelope pattern used here is standard:
//
//   - A per-row Data Encryption Key (DEK) is generated fresh at write time.
//   - The plaintext value is encrypted with the DEK using AES-256-GCM.
//   - The DEK itself is wrapped (encrypted) with a long-lived Key Encryption
//     Key (KEK) loaded from the PLATFORM_SETTINGS_KEK env var, also using
//     AES-256-GCM.
//
// The DB stores two BYTEA columns per encrypted row: the wrapped DEK and the
// ciphertext. Compromising the DB alone does not reveal plaintext — an
// attacker also needs the KEK, which lives outside the DB.
//
// Ciphertext format (both DEK-wrap and data encryption):
//
//	[version byte 0x01] [12-byte GCM nonce] [ciphertext+tag]
//
// The version byte lets us rotate formats without breaking existing rows.
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
)

// cipherVersion is the single-byte version marker prepended to every
// ciphertext blob produced by this package. Bump when the format changes
// and keep the old path for at least one release cycle.
const cipherVersion byte = 0x01

// Envelope performs AES-256-GCM envelope encryption under a long-lived KEK.
// The zero value is not usable — construct via NewEnvelopeFromHex.
type Envelope struct {
	kek []byte // 32 bytes for AES-256
}

// NewEnvelopeFromHex constructs an Envelope from a hex-encoded 32-byte KEK.
// Typical use: the caller reads `PLATFORM_SETTINGS_KEK` from the environment
// and passes it here during application bootstrap.
func NewEnvelopeFromHex(kekHex string) (*Envelope, error) {
	if kekHex == "" {
		return nil, errors.New("crypto: KEK is empty")
	}
	kek, err := hex.DecodeString(kekHex)
	if err != nil {
		return nil, fmt.Errorf("crypto: KEK must be hex-encoded: %w", err)
	}
	if len(kek) != 32 {
		return nil, fmt.Errorf("crypto: KEK must be exactly 32 bytes (64 hex chars), got %d", len(kek))
	}
	return &Envelope{kek: kek}, nil
}

// Encrypt returns the ciphertext and the wrapped DEK for a plaintext value.
// Both outputs are safe to store in BYTEA columns. Callers should treat them
// as opaque — the version byte + nonce are baked in.
func (e *Envelope) Encrypt(plaintext []byte) (ciphertext, dekWrapped []byte, err error) {
	// Fresh DEK per row — the whole point of envelope encryption.
	dek := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, dek); err != nil {
		return nil, nil, fmt.Errorf("crypto: generate DEK: %w", err)
	}

	ciphertext, err = aesGcmSeal(dek, plaintext)
	if err != nil {
		return nil, nil, fmt.Errorf("crypto: encrypt data: %w", err)
	}

	dekWrapped, err = aesGcmSeal(e.kek, dek)
	if err != nil {
		return nil, nil, fmt.Errorf("crypto: wrap DEK: %w", err)
	}
	return ciphertext, dekWrapped, nil
}

// Decrypt reverses Encrypt. Any tampering with either blob causes
// AES-GCM authentication to fail and returns an error.
func (e *Envelope) Decrypt(ciphertext, dekWrapped []byte) ([]byte, error) {
	dek, err := aesGcmOpen(e.kek, dekWrapped)
	if err != nil {
		return nil, fmt.Errorf("crypto: unwrap DEK: %w", err)
	}
	plaintext, err := aesGcmOpen(dek, ciphertext)
	if err != nil {
		return nil, fmt.Errorf("crypto: decrypt data: %w", err)
	}
	return plaintext, nil
}

// aesGcmSeal encrypts plaintext under key using AES-256-GCM and returns
// [version][nonce][ciphertext+tag]. key must be exactly 32 bytes.
func aesGcmSeal(key, plaintext []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("read nonce: %w", err)
	}
	// Pre-allocate: 1 version + nonce + plaintext + GCM tag.
	out := make([]byte, 0, 1+len(nonce)+len(plaintext)+gcm.Overhead())
	out = append(out, cipherVersion)
	out = append(out, nonce...)
	out = gcm.Seal(out, nonce, plaintext, nil)
	return out, nil
}

// aesGcmOpen reverses aesGcmSeal. Rejects unknown versions and too-short
// blobs before touching the crypto layer so errors stay readable.
func aesGcmOpen(key, blob []byte) ([]byte, error) {
	if len(blob) < 1 {
		return nil, errors.New("ciphertext is empty")
	}
	if blob[0] != cipherVersion {
		return nil, fmt.Errorf("unsupported ciphertext version 0x%02x", blob[0])
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonceSize := gcm.NonceSize()
	if len(blob) < 1+nonceSize {
		return nil, errors.New("ciphertext too short for nonce")
	}
	nonce := blob[1 : 1+nonceSize]
	ct := blob[1+nonceSize:]
	return gcm.Open(nil, nonce, ct, nil)
}
