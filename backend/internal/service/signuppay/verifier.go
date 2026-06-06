package signuppay

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
)

// RazorpayVerifier verifies a Razorpay signup payment by recomputing the
// HMAC-SHA256 over "<order_id>|<payment_id>" with the key secret — the same
// scheme the existing subscription upgrade path uses. Deterministic and
// unit-tested. PhonePe verification requires the PhonePe status-API client and
// is intentionally NOT handled here (returns an explicit error) rather than
// pretending success.
//
// proof format (razorpay): "<razorpay_payment_id>|<razorpay_signature>".
type RazorpayVerifier struct {
	keySecret string
}

// NewRazorpayVerifier constructs the verifier with the Razorpay key secret
// (resolved upstream from platform_settings -> env; never hardcoded).
func NewRazorpayVerifier(keySecret string) *RazorpayVerifier {
	return &RazorpayVerifier{keySecret: keySecret}
}

// VerifyPaid implements PaymentVerifier.
func (v *RazorpayVerifier) VerifyPaid(_ context.Context, provider, providerOrderID, proof string) (bool, error) {
	if provider != "razorpay" {
		// Honest failure: this verifier only knows Razorpay. PhonePe signup
		// settlement must go through the PhonePe status-API path (not wired in
		// this slice).
		return false, errors.New("signuppay: provider not supported by RazorpayVerifier")
	}
	if v.keySecret == "" {
		return false, errors.New("signuppay: razorpay key secret not configured")
	}
	paymentID, signature, ok := strings.Cut(proof, "|")
	if !ok || paymentID == "" || signature == "" {
		return false, errors.New("signuppay: malformed razorpay proof")
	}
	expected := hmacSHA256Hex(providerOrderID+"|"+paymentID, v.keySecret)
	// Constant-time comparison to avoid signature timing oracles.
	return hmac.Equal([]byte(expected), []byte(signature)), nil
}

func hmacSHA256Hex(message, key string) string {
	mac := hmac.New(sha256.New, []byte(key))
	mac.Write([]byte(message))
	return hex.EncodeToString(mac.Sum(nil))
}
