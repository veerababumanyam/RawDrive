package recharge_test

// M32 / E104 — provider unit tests (signature math + parser correctness).
// No HTTP roundtrips here; provider HTTP behavior is exercised in handler tests
// with httptest fakes.

import (
	"encoding/base64"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/streaming/recharge"
)

// ─── PhonePe ──────────────────────────────────────────────────────────

func TestSignPhonePePay_Deterministic(t *testing.T) {
	body := "eyJtZXJjaGFudElkIjoiTUlEIn0=" // any base64 string
	a := recharge.SignPhonePePay(body, "salt-key", "1")
	b := recharge.SignPhonePePay(body, "salt-key", "1")
	assert.Equal(t, a, b)
	assert.Contains(t, a, "###1")
}

func TestSignPhonePeCallback_DiffersFromPaySignature(t *testing.T) {
	body := "eyJyZXNwIjoidGVzdCJ9"
	pay := recharge.SignPhonePePay(body, "k", "1")
	cb := recharge.SignPhonePeCallback(body, "k", "1")
	// Same body+salt but different schemas (pay includes path) → different hash.
	assert.NotEqual(t, pay, cb)
}

func TestPhonePe_VerifyWebhook_AcceptsCorrectSig(t *testing.T) {
	p, err := recharge.NewPhonePeProvider(recharge.PhonePeConfig{
		MerchantID: "MID", SaltKey: "the-salt", SaltIndex: "1",
		BaseURL: "https://example.test",
	})
	require.NoError(t, err)

	raw := []byte(`{"response":"abc"}`)
	b64 := base64.StdEncoding.EncodeToString(raw)
	expected := recharge.SignPhonePeCallback(b64, "the-salt", "1")

	err = p.VerifyWebhookSignature(raw, map[string]string{"X-VERIFY": expected})
	assert.NoError(t, err)
}

func TestPhonePe_VerifyWebhook_RejectsTamper(t *testing.T) {
	p, err := recharge.NewPhonePeProvider(recharge.PhonePeConfig{
		MerchantID: "MID", SaltKey: "the-salt", SaltIndex: "1",
		BaseURL: "https://example.test",
	})
	require.NoError(t, err)

	err = p.VerifyWebhookSignature([]byte(`{"response":"abc"}`), map[string]string{
		"X-VERIFY": "0000###1",
	})
	assert.ErrorIs(t, err, recharge.ErrInvalidSignature)
}

func TestPhonePe_ParseCallback_Success(t *testing.T) {
	p, _ := recharge.NewPhonePeProvider(recharge.PhonePeConfig{
		MerchantID: "MID", SaltKey: "k", SaltIndex: "1",
		BaseURL: "https://example.test",
	})
	inner := map[string]any{
		"success": true,
		"code":    "PAYMENT_SUCCESS",
		"data": map[string]any{
			"merchantId":            "MID",
			"merchantTransactionId": "ord-1",
			"transactionId":         "T-1",
			"amount":                49900,
			"state":                 "COMPLETED",
		},
	}
	innerJSON, _ := json.Marshal(inner)
	wrap, _ := json.Marshal(map[string]string{"response": base64.StdEncoding.EncodeToString(innerJSON)})

	cb, err := p.ParseCallback(wrap)
	require.NoError(t, err)
	assert.Equal(t, "ord-1", cb.ProviderOrderID)
	assert.Equal(t, "T-1", cb.ProviderPaymentID)
	assert.Equal(t, int64(49900), cb.AmountPaise)
	assert.Equal(t, recharge.CallbackSuccess, cb.Status)
}

func TestPhonePe_ParseCallback_FailureAndUnparseable(t *testing.T) {
	p, _ := recharge.NewPhonePeProvider(recharge.PhonePeConfig{
		MerchantID: "MID", SaltKey: "k", SaltIndex: "1",
		BaseURL: "https://example.test",
	})

	// Failure state.
	inner := map[string]any{"data": map[string]any{
		"merchantTransactionId": "ord-2", "transactionId": "T-2",
		"amount": 10000, "state": "FAILED",
	}}
	innerJSON, _ := json.Marshal(inner)
	wrap, _ := json.Marshal(map[string]string{"response": base64.StdEncoding.EncodeToString(innerJSON)})
	cb, err := p.ParseCallback(wrap)
	require.NoError(t, err)
	assert.Equal(t, recharge.CallbackFailed, cb.Status)

	// Unparseable.
	_, err = p.ParseCallback([]byte("not-json"))
	assert.ErrorIs(t, err, recharge.ErrUnparseableCallback)
}

// ─── Razorpay ─────────────────────────────────────────────────────────

func TestSignRazorpayWebhook_Deterministic(t *testing.T) {
	a := recharge.SignRazorpayWebhook([]byte(`{"event":"x"}`), "s")
	b := recharge.SignRazorpayWebhook([]byte(`{"event":"x"}`), "s")
	assert.Equal(t, a, b)
}

func TestRazorpay_VerifyWebhook_AcceptsCorrectSig(t *testing.T) {
	p, err := recharge.NewRazorpayProvider(recharge.RazorpayConfig{
		KeyID: "id", KeySecret: "secret", WebhookSecret: "w",
	})
	require.NoError(t, err)

	raw := []byte(`{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_1","order_id":"order_1","amount":1000,"status":"captured"}}}}`)
	sig := recharge.SignRazorpayWebhook(raw, "w")

	err = p.VerifyWebhookSignature(raw, map[string]string{"X-Razorpay-Signature": sig})
	assert.NoError(t, err)
}

func TestRazorpay_VerifyWebhook_RejectsTamper(t *testing.T) {
	p, _ := recharge.NewRazorpayProvider(recharge.RazorpayConfig{
		KeyID: "id", KeySecret: "secret", WebhookSecret: "w",
	})
	err := p.VerifyWebhookSignature([]byte(`{"event":"x"}`), map[string]string{
		"X-Razorpay-Signature": "deadbeef",
	})
	assert.ErrorIs(t, err, recharge.ErrInvalidSignature)
}

func TestRazorpay_ParseCallback_CapturedAndFailed(t *testing.T) {
	p, _ := recharge.NewRazorpayProvider(recharge.RazorpayConfig{
		KeyID: "id", KeySecret: "secret", WebhookSecret: "w",
	})

	captured := []byte(`{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_1","order_id":"order_1","amount":1000,"status":"captured"}}}}`)
	cb, err := p.ParseCallback(captured)
	require.NoError(t, err)
	assert.Equal(t, "order_1", cb.ProviderOrderID)
	assert.Equal(t, recharge.CallbackSuccess, cb.Status)

	failed := []byte(`{"event":"payment.failed","payload":{"payment":{"entity":{"id":"pay_2","order_id":"order_2","amount":1000,"status":"failed"}}}}`)
	cb, err = p.ParseCallback(failed)
	require.NoError(t, err)
	assert.Equal(t, recharge.CallbackFailed, cb.Status)
}

func TestNewProvider_RejectsMissingConfig(t *testing.T) {
	_, err := recharge.NewPhonePeProvider(recharge.PhonePeConfig{})
	assert.ErrorIs(t, err, recharge.ErrProviderUnavailable)
	_, err = recharge.NewRazorpayProvider(recharge.RazorpayConfig{KeyID: "x"})
	assert.ErrorIs(t, err, recharge.ErrProviderUnavailable)
}

func TestProviderName_IsValid(t *testing.T) {
	assert.True(t, recharge.NamePhonePe.IsValid())
	assert.True(t, recharge.NameRazorpay.IsValid())
	assert.False(t, recharge.Name("paypal").IsValid())
}
