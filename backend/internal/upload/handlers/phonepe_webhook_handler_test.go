package handlers_test

import (
	"bytes"
	"context"
	"errors"
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

// stubVerifier is a test double for PhonePeSignatureVerifier. It does NOT
// call any real crypto — each test case seeds the return values directly.
type stubVerifier struct {
	verifyErr error
	callback  *recharge.CallbackPayload
	parseErr  error
}

func (s *stubVerifier) VerifyWebhookSignature(_ []byte, _ map[string]string) error {
	return s.verifyErr
}

func (s *stubVerifier) ParseCallback(_ []byte) (*recharge.CallbackPayload, error) {
	if s.parseErr != nil {
		return nil, s.parseErr
	}
	return s.callback, nil
}

// stubPurchaseSvc captures Purchase calls so tests can assert the webhook
// DID or DID NOT reach the service (AC-E15-S1-1 requires 401 before any
// DB write → purchase must NOT be called when signature is invalid).
type stubPurchaseSvc struct {
	calls   []credit.PurchaseInput
	result  *credit.PurchaseResult
	callErr error
}

func (s *stubPurchaseSvc) Purchase(_ context.Context, in credit.PurchaseInput) (*credit.PurchaseResult, error) {
	s.calls = append(s.calls, in)
	return s.result, s.callErr
}

// AC-E15-S1-1: Invalid X-VERIFY returns 401 BEFORE any DB write.
func TestPhonePeUploadWebhook_InvalidSignature_401_NoDBCall(t *testing.T) {
	verifier := &stubVerifier{verifyErr: recharge.ErrInvalidSignature}
	svc := &stubPurchaseSvc{}
	h := &handlers.PhonePeUploadWebhookHandler{Verifier: verifier, Svc: svc}
	r := chi.NewRouter()
	h.RegisterRoutes(r)

	req := httptest.NewRequest(http.MethodPost,
		"/api/v1/webhooks/phonepe/uploads",
		bytes.NewReader([]byte(`{"response":"tampered"}`)))
	req.Header.Set("X-VERIFY", "bad-sig###1")
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
	assert.Empty(t, svc.calls, "Purchase service MUST NOT be called on invalid signature")
}

// Valid signature + success callback → Purchase called with decoded input.
func TestPhonePeUploadWebhook_ValidSuccess_CallsPurchase(t *testing.T) {
	wsID := uuid.New()
	merchantID := "ws:" + wsID.String() + ":starter:order123"
	verifier := &stubVerifier{
		verifyErr: nil,
		callback: &recharge.CallbackPayload{
			ProviderOrderID:   merchantID,
			ProviderPaymentID: "PP-TXN-42",
			AmountPaise:       29900,
			Status:            recharge.CallbackSuccess,
		},
	}
	svc := &stubPurchaseSvc{
		result: &credit.PurchaseResult{
			LedgerEntry: &credit.LedgerEntry{ID: uuid.New(), AmountCredits: 500},
			Credits:     500,
			PackageCode: "starter",
		},
	}
	h := &handlers.PhonePeUploadWebhookHandler{Verifier: verifier, Svc: svc}
	r := chi.NewRouter()
	h.RegisterRoutes(r)

	req := httptest.NewRequest(http.MethodPost,
		"/api/v1/webhooks/phonepe/uploads",
		bytes.NewReader([]byte(`{"response":"ok"}`)))
	req.Header.Set("X-VERIFY", "valid###1")
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	require.Equal(t, http.StatusOK, rr.Code, "valid signature + success should be 200; body=%s", rr.Body.String())
	require.Len(t, svc.calls, 1, "Purchase must be called exactly once")
	call := svc.calls[0]
	assert.Equal(t, wsID, call.WorkspaceID)
	assert.Equal(t, "starter", call.PackageCode)
	assert.Equal(t, "phonepe", call.Gateway)
	assert.Equal(t, "PP-TXN-42", call.GatewayTxnID)
	assert.Equal(t, merchantID, call.IdempotencyKey,
		"idempotency key must be the merchantTransactionID so duplicate webhooks short-circuit")
}

// AC-E15-S1-3: Duplicate delivery must not create a second ledger row. The
// (workspace_id, idempotency_key) partial unique index enforces this at
// the DB level; at the handler level, duplicate deliveries pass the same
// IdempotencyKey into Purchase and get back a WasReplay result.
func TestPhonePeUploadWebhook_DuplicateDelivery_200_SameIdempotencyKey(t *testing.T) {
	wsID := uuid.New()
	merchantID := "ws:" + wsID.String() + ":pro:orderABC"
	verifier := &stubVerifier{
		callback: &recharge.CallbackPayload{
			ProviderOrderID:   merchantID,
			ProviderPaymentID: "PP-TXN-dup",
			Status:            recharge.CallbackSuccess,
		},
	}
	svc := &stubPurchaseSvc{
		result: &credit.PurchaseResult{
			LedgerEntry: &credit.LedgerEntry{ID: uuid.New(), AmountCredits: 2000},
			Credits:     2000,
			WasReplay:   true,
		},
	}
	h := &handlers.PhonePeUploadWebhookHandler{Verifier: verifier, Svc: svc}
	r := chi.NewRouter()
	h.RegisterRoutes(r)

	// Simulate two deliveries of the same webhook.
	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodPost,
			"/api/v1/webhooks/phonepe/uploads",
			bytes.NewReader([]byte(`{"response":"ok"}`)))
		req.Header.Set("X-VERIFY", "valid###1")
		rr := httptest.NewRecorder()
		r.ServeHTTP(rr, req)
		assert.Equal(t, http.StatusOK, rr.Code, "delivery %d should succeed", i+1)
	}
	require.Len(t, svc.calls, 2, "Purchase is called on every delivery")
	assert.Equal(t, svc.calls[0].IdempotencyKey, svc.calls[1].IdempotencyKey,
		"both calls must use the same IdempotencyKey so the DB-level unique index keeps the ledger coherent")
}

// Non-success callback states (FAILED / PENDING) must be ACKed with 200
// but MUST NOT credit the workspace.
func TestPhonePeUploadWebhook_NonSuccessCallback_200_NoPurchase(t *testing.T) {
	verifier := &stubVerifier{
		callback: &recharge.CallbackPayload{
			ProviderOrderID:   "ws:" + uuid.New().String() + ":starter:x",
			ProviderPaymentID: "PP-TXN-fail",
			Status:            recharge.CallbackFailed,
		},
	}
	svc := &stubPurchaseSvc{}
	h := &handlers.PhonePeUploadWebhookHandler{Verifier: verifier, Svc: svc}
	r := chi.NewRouter()
	h.RegisterRoutes(r)

	req := httptest.NewRequest(http.MethodPost,
		"/api/v1/webhooks/phonepe/uploads",
		bytes.NewReader([]byte(`{"response":"failed"}`)))
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Empty(t, svc.calls, "Purchase must not be called on non-success callback")
}

// A merchantTransactionID that doesn't match the upload-credit format is
// almost certainly a mis-routed streaming recharge callback. Returning
// 400 stops PhonePe retry loops without corrupting the ledger.
func TestPhonePeUploadWebhook_UnroutableMerchantID_400(t *testing.T) {
	verifier := &stubVerifier{
		callback: &recharge.CallbackPayload{
			ProviderOrderID: "STREAMING-ORDER-NOT-US-123",
			Status:          recharge.CallbackSuccess,
		},
	}
	svc := &stubPurchaseSvc{}
	h := &handlers.PhonePeUploadWebhookHandler{Verifier: verifier, Svc: svc}
	r := chi.NewRouter()
	h.RegisterRoutes(r)

	req := httptest.NewRequest(http.MethodPost,
		"/api/v1/webhooks/phonepe/uploads",
		bytes.NewReader([]byte(`{"response":"ok"}`)))
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
	assert.Contains(t, rr.Body.String(), "UNROUTABLE_MERCHANT_ID")
	assert.Empty(t, svc.calls)
}

// Nil verifier / svc → 503 (mis-wired handler). Prevents PhonePe's retry
// storm from silently completing on a broken deployment.
func TestPhonePeUploadWebhook_NilDeps_503(t *testing.T) {
	h := &handlers.PhonePeUploadWebhookHandler{}
	r := chi.NewRouter()
	h.RegisterRoutes(r)

	req := httptest.NewRequest(http.MethodPost,
		"/api/v1/webhooks/phonepe/uploads",
		bytes.NewReader([]byte(`{}`)))
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusServiceUnavailable, rr.Code)
}

var _ = errors.New // keep the errors import live if the file grows
