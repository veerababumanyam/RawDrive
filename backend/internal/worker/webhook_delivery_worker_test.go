package worker

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"testing"
)

// TestSignWebhookPayload_DeterministicAndCorrect verifies signWebhookPayload
// matches a hand-computed HMAC-SHA256.
func TestSignWebhookPayload_DeterministicAndCorrect(t *testing.T) {
	secret := "shhh-its-a-secret"
	payload := []byte(`{"event":"asset.ready","asset_id":"abc"}`)

	got := signWebhookPayload(secret, payload)

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	want := hex.EncodeToString(mac.Sum(nil))

	if got != want {
		t.Errorf("signature mismatch: want %s, got %s", want, got)
	}
}

// TestSignWebhookPayload_DifferentSecretChangesSignature verifies
// secret rotation produces a different signature.
func TestSignWebhookPayload_DifferentSecretChangesSignature(t *testing.T) {
	payload := []byte("hello")
	a := signWebhookPayload("secret-a", payload)
	b := signWebhookPayload("secret-b", payload)
	if a == b {
		t.Errorf("signatures equal across different secrets: %s", a)
	}
}

// TestSignWebhookPayload_EmptyPayloadProducesValidSignature ensures we
// don't panic on an empty body and the signature is still 64 hex chars.
func TestSignWebhookPayload_EmptyPayloadProducesValidSignature(t *testing.T) {
	sig := signWebhookPayload("k", []byte{})
	if len(sig) != 64 {
		t.Errorf("hex sig length: want 64, got %d", len(sig))
	}
}
