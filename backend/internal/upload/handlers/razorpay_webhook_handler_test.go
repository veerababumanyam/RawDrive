package handlers_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/streaming/recharge"
	"github.com/rawdrive/backend/internal/upload/credit"
	"github.com/rawdrive/backend/internal/upload/handlers"
)

// The Razorpay tests deliberately reuse the stubVerifier / stubPurchaseSvc
// shapes from phonepe_webhook_handler_test.go. Because both test files
// live in the same _test package, naming is the only collision risk — we
// avoid it by prefixing these doubles with `rzp`.

type rzpStubVerifier struct {
	verifyErr error
	callback  *recharge.CallbackPayload
	parseErr  error
}

func (s *rzpStubVerifier) VerifyWebhookSignature(_ []byte, _ map[string]string) error {
	return s.verifyErr
}

func (s *rzpStubVerifier) ParseCallback(_ []byte) (*recharge.CallbackPayload, error) {
	if s.parseErr != nil {
		return nil, s.parseErr
	}
	return s.callback, nil
}

// AC: invalid HMAC returns 401 and DOES NOT reach the service. Mirrors
// the PhonePe AC-E15-S1-1 test — Razorpay's AC-E15-S2-1 has identical
// semantics because the signature guard sits at the same flow position.
func TestRazorpayUploadWebhook_InvalidSignature_401_NoDBCall(t *testing.T) {
	verifier := &rzpStubVerifier{verifyErr: recharge.ErrInvalidSignature}
	svc := &stubPurchaseSvc{}
	h := &handlers.RazorpayUploadWebhookHandler{Verifier: verifier, Svc: svc}
	r := chi.NewRouter()
	h.RegisterRoutes(r)

	req := httptest.NewRequest(http.MethodPost,
		"/api/v1/webhooks/razorpay/uploads",
		bytes.NewReader([]byte(`{"event":"payment.captured","payload":{"tampered":true}}`)))
	req.Header.Set("X-Razorpay-Signature", "deadbeef")
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
	assert.Empty(t, svc.calls, "Purchase service MUST NOT be called on invalid HMAC")
}

func TestRazorpayUploadWebhook_ValidSuccess_CallsPurchase(t *testing.T) {
	wsID := uuid.New()
	merchantID := "ws:" + wsID.String() + ":pro:order-rzp-01"
	verifier := &rzpStubVerifier{
		callback: &recharge.CallbackPayload{
			ProviderOrderID:   merchantID,
			ProviderPaymentID: "pay_RZP42",
			AmountPaise:       149900,
			Status:            recharge.CallbackSuccess,
		},
	}
	svc := &stubPurchaseSvc{
		result: &credit.PurchaseResult{
			LedgerEntry: &credit.LedgerEntry{ID: uuid.New(), AmountCredits: 2000},
			Credits:     2000,
			PackageCode: "pro",
		},
	}
	h := &handlers.RazorpayUploadWebhookHandler{Verifier: verifier, Svc: svc}
	r := chi.NewRouter()
	h.RegisterRoutes(r)

	req := httptest.NewRequest(http.MethodPost,
		"/api/v1/webhooks/razorpay/uploads",
		bytes.NewReader([]byte(`{"event":"payment.captured"}`)))
	req.Header.Set("X-Razorpay-Signature", "valid-hmac")
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	require.Equal(t, http.StatusOK, rr.Code, "body=%s", rr.Body.String())
	require.Len(t, svc.calls, 1)
	call := svc.calls[0]
	assert.Equal(t, wsID, call.WorkspaceID)
	assert.Equal(t, "pro", call.PackageCode)
	assert.Equal(t, "razorpay", call.Gateway, "Gateway label must be 'razorpay' so reconciliation can filter by provider")
	assert.Equal(t, "pay_RZP42", call.GatewayTxnID)
	assert.Equal(t, merchantID, call.IdempotencyKey)
}

func TestRazorpayUploadWebhook_DuplicateDelivery_IdempotentKey(t *testing.T) {
	wsID := uuid.New()
	merchantID := "ws:" + wsID.String() + ":starter:order-rzp-dup"
	verifier := &rzpStubVerifier{
		callback: &recharge.CallbackPayload{
			ProviderOrderID:   merchantID,
			ProviderPaymentID: "pay_RZPdup",
			Status:            recharge.CallbackSuccess,
		},
	}
	svc := &stubPurchaseSvc{
		result: &credit.PurchaseResult{
			LedgerEntry: &credit.LedgerEntry{ID: uuid.New(), AmountCredits: 500},
			Credits:     500,
			WasReplay:   true,
		},
	}
	h := &handlers.RazorpayUploadWebhookHandler{Verifier: verifier, Svc: svc}
	r := chi.NewRouter()
	h.RegisterRoutes(r)

	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodPost,
			"/api/v1/webhooks/razorpay/uploads",
			bytes.NewReader([]byte(`{"event":"payment.captured"}`)))
		req.Header.Set("X-Razorpay-Signature", "valid-hmac")
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)
		assert.Equal(t, http.StatusOK, rr.Code, "delivery %d should succeed", i+1)
	}
	require.Len(t, svc.calls, 2)
	assert.Equal(t, svc.calls[0].IdempotencyKey, svc.calls[1].IdempotencyKey,
		"duplicate deliveries must pass the same IdempotencyKey so the DB unique index keeps the ledger coherent")
}

func TestRazorpayUploadWebhook_NonSuccessCallback_200_NoPurchase(t *testing.T) {
	verifier := &rzpStubVerifier{
		callback: &recharge.CallbackPayload{
			ProviderOrderID: "ws:" + uuid.New().String() + ":starter:x",
			Status:          recharge.CallbackFailed,
		},
	}
	svc := &stubPurchaseSvc{}
	h := &handlers.RazorpayUploadWebhookHandler{Verifier: verifier, Svc: svc}
	r := chi.NewRouter()
	h.RegisterRoutes(r)

	req := httptest.NewRequest(http.MethodPost,
		"/api/v1/webhooks/razorpay/uploads",
		bytes.NewReader([]byte(`{"event":"payment.failed"}`)))
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Empty(t, svc.calls)
}

func TestRazorpayUploadWebhook_UnroutableMerchantID_400(t *testing.T) {
	verifier := &rzpStubVerifier{
		callback: &recharge.CallbackPayload{
			ProviderOrderID: "streaming-order-not-ours",
			Status:          recharge.CallbackSuccess,
		},
	}
	svc := &stubPurchaseSvc{}
	h := &handlers.RazorpayUploadWebhookHandler{Verifier: verifier, Svc: svc}
	r := chi.NewRouter()
	h.RegisterRoutes(r)

	req := httptest.NewRequest(http.MethodPost,
		"/api/v1/webhooks/razorpay/uploads",
		bytes.NewReader([]byte(`{}`)))
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
	assert.Contains(t, rr.Body.String(), "UNROUTABLE_MERCHANT_ID")
	assert.Empty(t, svc.calls)
}

func TestRazorpayUploadWebhook_NilDeps_503(t *testing.T) {
	h := &handlers.RazorpayUploadWebhookHandler{}
	r := chi.NewRouter()
	h.RegisterRoutes(r)

	req := httptest.NewRequest(http.MethodPost,
		"/api/v1/webhooks/razorpay/uploads",
		bytes.NewReader([]byte(`{}`)))
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusServiceUnavailable, rr.Code)
}
