package auth

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"fmt"
)

// JWTKeyStore is the minimal storage interface the JWT service needs to
// persist its RSA signing key across restarts. The auth package defines
// this interface locally (rather than depending on repository) so the
// coupling stays shallow and the repository package can provide any
// adapter that satisfies it.
//
// F-006 Part A (audit 2026-04-10): the default NewJWTService generates a
// fresh RSA key at boot, so every restart invalidates every previously-
// issued access token. Loading a persisted key via this store plugs the
// gap. The store is expected to encrypt the value at rest — in the
// production wiring, the adapter wraps PlatformSettingsRepo which already
// goes through the F-005 envelope when is_secret=true.
type JWTKeyStore interface {
	// GetSigningKeyPEM returns the PEM-encoded RSA private key, or an
	// empty string + nil error if the key has not been persisted yet.
	// A non-nil error indicates a real failure (DB down, decrypt error,
	// etc.) — the caller will NOT fall back to generation in that case.
	GetSigningKeyPEM(ctx context.Context) (string, error)

	// PutSigningKeyPEM persists the PEM-encoded RSA private key. The
	// store is expected to mark the row as a secret so the F-005
	// envelope encrypts it at rest.
	PutSigningKeyPEM(ctx context.Context, pemStr string) error
}

// LoadPersistedSigningKey is the package-level bootstrap entry point for
// F-006 Part A. It replaces the JWT service's ephemeral in-memory RSA key
// with one loaded from (or created in) the provided store.
//
// The expected main.go bootstrap ordering is:
//
//  1. construct platform_settings repo + F-005 envelope
//  2. construct the JWT service via NewJWTService (which generates an
//     ephemeral key so the service is immediately usable)
//  3. call LoadPersistedSigningKey to replace the ephemeral key with the
//     persisted one
//
// On first boot the store is empty, so this function generates a fresh key,
// persists it, and adopts it. On subsequent boots it reads the previously-
// stored key. Either way, tokens signed under the stable key survive
// service restarts — which is the whole point of F-006 Part A.
//
// This is a package-level function (rather than a method on the JWTService
// interface) so adding it does NOT break any mock implementations of
// JWTService that live in test code. It type-asserts down to the concrete
// *jwtService; callers that pass a mock will get a descriptive error.
//
// Returns an error if the service is not a *jwtService, if the store
// fails, if a stored PEM cannot be decoded, or if persistence of a
// newly-generated key fails.
func LoadPersistedSigningKey(ctx context.Context, svc JWTService, store JWTKeyStore) error {
	concrete, ok := svc.(*jwtService)
	if !ok {
		return errors.New("jwt: service is not the concrete *jwtService — cannot persist key")
	}
	return concrete.loadPersistedSigningKey(ctx, store)
}

// loadPersistedSigningKey is the concrete implementation, unexported so
// only LoadPersistedSigningKey and tests in the same package can reach it.
func (s *jwtService) loadPersistedSigningKey(ctx context.Context, store JWTKeyStore) error {
	if store == nil {
		return errors.New("jwt: key store is nil")
	}

	pemStr, err := store.GetSigningKeyPEM(ctx)
	if err != nil {
		return fmt.Errorf("jwt: load persisted key: %w", err)
	}

	if pemStr == "" {
		// First boot for this deployment: generate a new key, persist it,
		// and adopt it. Using 2048-bit RSA to match the existing default.
		key, err := rsa.GenerateKey(rand.Reader, 2048)
		if err != nil {
			return fmt.Errorf("jwt: generate signing key: %w", err)
		}
		newPem, err := encodeRSAPrivateKeyPEM(key)
		if err != nil {
			return fmt.Errorf("jwt: encode signing key: %w", err)
		}
		if err := store.PutSigningKeyPEM(ctx, newPem); err != nil {
			return fmt.Errorf("jwt: persist signing key: %w", err)
		}
		s.swapKey(key)
		return nil
	}

	key, err := decodeRSAPrivateKeyPEM(pemStr)
	if err != nil {
		return fmt.Errorf("jwt: decode persisted key: %w", err)
	}
	s.swapKey(key)
	return nil
}

// swapKey replaces the in-memory private/public key pair atomically.
// Holds the service mutex so a concurrent token sign/verify sees a
// consistent pair.
func (s *jwtService) swapKey(key *rsa.PrivateKey) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.privateKey = key
	s.publicKey = &key.PublicKey
}

// encodeRSAPrivateKeyPEM returns the PEM-encoded PKCS8 form of key.
// PKCS8 is the modern container format and is what the golang-jwt
// library expects when you call jwt.ParseRSAPrivateKeyFromPEM.
func encodeRSAPrivateKeyPEM(key *rsa.PrivateKey) (string, error) {
	der, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		return "", err
	}
	block := &pem.Block{
		Type:  "PRIVATE KEY",
		Bytes: der,
	}
	return string(pem.EncodeToMemory(block)), nil
}

// decodeRSAPrivateKeyPEM parses a PEM-encoded RSA private key. Accepts
// both PKCS8 ("PRIVATE KEY") and PKCS1 ("RSA PRIVATE KEY") block types
// so keys generated under either scheme round-trip cleanly.
func decodeRSAPrivateKeyPEM(pemStr string) (*rsa.PrivateKey, error) {
	block, _ := pem.Decode([]byte(pemStr))
	if block == nil {
		return nil, errors.New("no PEM block found")
	}

	switch block.Type {
	case "PRIVATE KEY":
		raw, err := x509.ParsePKCS8PrivateKey(block.Bytes)
		if err != nil {
			return nil, err
		}
		rsaKey, ok := raw.(*rsa.PrivateKey)
		if !ok {
			return nil, errors.New("PKCS8 key is not an RSA private key")
		}
		return rsaKey, nil
	case "RSA PRIVATE KEY":
		return x509.ParsePKCS1PrivateKey(block.Bytes)
	default:
		return nil, fmt.Errorf("unsupported PEM block type %q", block.Type)
	}
}
