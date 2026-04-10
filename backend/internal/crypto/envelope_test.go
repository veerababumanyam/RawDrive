package crypto_test

import (
	"bytes"
	"testing"

	"github.com/rawdrive/backend/internal/crypto"
)

// Deterministic 32-byte KEKs (64 hex chars) used across tests. Real deployments
// MUST load a random KEK from a secret store via PLATFORM_SETTINGS_KEK — these
// values are only for unit tests.
const (
	testKEK1 = "0000000000000000000000000000000000000000000000000000000000000001"
	testKEK2 = "00000000000000000000000000000000000000000000000000000000000000ff"
)

func mustEnvelope(t *testing.T, kekHex string) *crypto.Envelope {
	t.Helper()
	e, err := crypto.NewEnvelopeFromHex(kekHex)
	if err != nil {
		t.Fatalf("NewEnvelopeFromHex: %v", err)
	}
	return e
}

func TestEnvelope_RoundTrip(t *testing.T) {
	e := mustEnvelope(t, testKEK1)
	plaintext := []byte("figd_super_secret_figma_token")

	ct, dekW, err := e.Encrypt(plaintext)
	if err != nil {
		t.Fatalf("Encrypt: %v", err)
	}
	if bytes.Equal(ct, plaintext) {
		t.Fatal("ciphertext must differ from plaintext")
	}
	if len(dekW) == 0 {
		t.Fatal("wrapped DEK is empty")
	}

	got, err := e.Decrypt(ct, dekW)
	if err != nil {
		t.Fatalf("Decrypt: %v", err)
	}
	if !bytes.Equal(got, plaintext) {
		t.Fatalf("round-trip mismatch: got %q want %q", got, plaintext)
	}
}

func TestEnvelope_NonDeterministic(t *testing.T) {
	// Two encryptions of the same plaintext under the same KEK must produce
	// different ciphertext + different wrapped DEKs. If they match, the DEK
	// or the nonce is reused — catastrophic for GCM security.
	e := mustEnvelope(t, testKEK1)
	ct1, dek1, _ := e.Encrypt([]byte("same"))
	ct2, dek2, _ := e.Encrypt([]byte("same"))

	if bytes.Equal(ct1, ct2) {
		t.Fatal("identical ciphertext for same plaintext — nonce or DEK reuse")
	}
	if bytes.Equal(dek1, dek2) {
		t.Fatal("identical wrapped DEK for same plaintext — DEK generation is deterministic")
	}
}

func TestEnvelope_TamperDetection_Ciphertext(t *testing.T) {
	e := mustEnvelope(t, testKEK1)
	ct, dekW, _ := e.Encrypt([]byte("sensitive value"))

	// Flip the last byte of the ciphertext — should break GCM auth.
	tampered := make([]byte, len(ct))
	copy(tampered, ct)
	tampered[len(tampered)-1] ^= 0xFF

	if _, err := e.Decrypt(tampered, dekW); err == nil {
		t.Fatal("tampered ciphertext must fail GCM authentication")
	}
}

func TestEnvelope_TamperDetection_WrappedDEK(t *testing.T) {
	e := mustEnvelope(t, testKEK1)
	ct, dekW, _ := e.Encrypt([]byte("sensitive value"))

	// Flip a byte in the wrapped DEK — should break DEK unwrap.
	tampered := make([]byte, len(dekW))
	copy(tampered, dekW)
	tampered[len(tampered)-1] ^= 0xFF

	if _, err := e.Decrypt(ct, tampered); err == nil {
		t.Fatal("tampered wrapped DEK must fail GCM authentication")
	}
}

func TestEnvelope_WrongKEK(t *testing.T) {
	e1 := mustEnvelope(t, testKEK1)
	e2 := mustEnvelope(t, testKEK2)

	ct, dekW, _ := e1.Encrypt([]byte("encrypted under kek1"))
	if _, err := e2.Decrypt(ct, dekW); err == nil {
		t.Fatal("decrypt under a different KEK must fail")
	}
}

func TestEnvelope_InvalidKEK_Errors(t *testing.T) {
	cases := []struct {
		name string
		kek  string
	}{
		{"empty", ""},
		{"non-hex", "zzzz"},
		{"too short", "00"},
		{"too long", "00000000000000000000000000000000000000000000000000000000000000" +
			"0000"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := crypto.NewEnvelopeFromHex(tc.kek); err == nil {
				t.Fatalf("expected error for %s KEK", tc.name)
			}
		})
	}
}

func TestEnvelope_UnsupportedVersion(t *testing.T) {
	e := mustEnvelope(t, testKEK1)
	ct, dekW, _ := e.Encrypt([]byte("hello"))

	// Flip the version byte (position 0) to a value this package does not
	// recognize. The decrypt path should reject it with a clear error
	// rather than attempt to parse as a known format.
	bad := make([]byte, len(ct))
	copy(bad, ct)
	bad[0] = 0x99

	_, err := e.Decrypt(bad, dekW)
	if err == nil {
		t.Fatal("expected error for unsupported version byte")
	}
}

func TestEnvelope_EmptyPlaintext_RoundTrip(t *testing.T) {
	// Empty plaintext is a valid edge case — it should round-trip cleanly.
	e := mustEnvelope(t, testKEK1)
	ct, dekW, err := e.Encrypt(nil)
	if err != nil {
		t.Fatalf("Encrypt empty: %v", err)
	}
	got, err := e.Decrypt(ct, dekW)
	if err != nil {
		t.Fatalf("Decrypt empty: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("empty round-trip returned %q", got)
	}
}
