package handlers

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/rawdrive/backend/internal/streaming/recharge"
	"github.com/rawdrive/backend/internal/upload/credit"
)

// RazorpaySignatureVerifier mirrors PhonePeSignatureVerifier but is defined
// as its own interface so tests can swap providers without forcing a shared
// type. *recharge.RazorpayProvider satisfies this directly. The shared
// webhook-signature package extraction in E15-S1 task T2 can fold both
// interfaces when the second consumer lands — today the indirection keeps
// them separate.
type RazorpaySignatureVerifier interface {
	VerifyWebhookSignature(rawBody []byte, headers map[string]string) error
	ParseCallback(rawBody []byte) (*recharge.CallbackPayload, error)
}

// RazorpayUploadWebhookHandler serves POST /api/v1/webhooks/razorpay/uploads.
// FR-UCRT-06. Behavioural mirror of PhonePeUploadWebhookHandler: signature
// check fires BEFORE any DB write, non-success callbacks are ACKed without
// crediting, and the merchantTransactionID format
// `ws:<workspace-uuid>:<package-code>:<suffix>` encodes the routing info
// so webhook replays stay idempotent on (workspace_id, idempotency_key).
//
// Razorpay specifics:
//   - Signature header is X-Razorpay-Signature (HMAC-SHA256 of raw body
//     with the webhook secret). The streaming/recharge provider handles
//     the constant-time comparison.
//   - ParseCallback already normalises Razorpay's `payment.captured` /
//     `payment.failed` / `payment.authorized` events into the same
//     CallbackPayload shape as PhonePe so this handler can reuse the
//     upload-credit Purchase call verbatim.
type RazorpayUploadWebhookHandler struct {
	Verifier RazorpaySignatureVerifier
	Svc      UploadPurchaseService
}

// Handle serves POST /api/v1/webhooks/razorpay/uploads. See the per-step
// comments in phonepe_webhook_handler.Handle — the flow is identical
// except for the provider-specific signature header.
func (h *RazorpayUploadWebhookHandler) Handle(w http.ResponseWriter, r *http.Request) {
	if h == nil || h.Verifier == nil || h.Svc == nil {
		http.Error(w, `{"error":"webhook_not_configured"}`, http.StatusServiceUnavailable)
		return
	}

	rawBody, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
	if err != nil {
		http.Error(w, `{"error":"body_too_large"}`, http.StatusRequestEntityTooLarge)
		return
	}

	headers := map[string]string{}
	for k, v := range r.Header {
		if len(v) > 0 {
			headers[k] = v[0]
		}
	}
	if err := h.Verifier.VerifyWebhookSignature(rawBody, headers); err != nil {
		http.Error(w, `{"error":"invalid_signature"}`, http.StatusUnauthorized)
		return
	}

	payload, err := h.Verifier.ParseCallback(rawBody)
	if err != nil {
		http.Error(w, `{"error":"invalid_payload"}`, http.StatusBadRequest)
		return
	}

	if payload.Status != recharge.CallbackSuccess {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"accepted": true,
			"status":   string(payload.Status),
			"note":     "non-success callbacks are ACKed without crediting",
		})
		return
	}

	// Reuse the same encoded-merchant-id parser as the PhonePe handler —
	// the format is provider-agnostic and Razorpay carries it back as
	// receipt/notes.merchantTransactionID via ParseCallback.
	wsID, packageCode, parseErr := parseUploadMerchantTxnID(payload.ProviderOrderID)
	if parseErr != nil {
		http.Error(w, `{"error_code":"UNROUTABLE_MERCHANT_ID","error":"merchant transaction id does not match upload-credit order format"}`,
			http.StatusBadRequest)
		return
	}

	result, err := h.Svc.Purchase(r.Context(), credit.PurchaseInput{
		WorkspaceID:    wsID,
		PackageCode:    packageCode,
		Gateway:        "razorpay",
		GatewayTxnID:   payload.ProviderPaymentID,
		IdempotencyKey: payload.ProviderOrderID,
	})
	switch {
	case err == nil:
		// success
	case errors.Is(err, credit.ErrPackageNotFound):
		http.Error(w, `{"error_code":"PACKAGE_NOT_FOUND","error":"package no longer active"}`, http.StatusBadRequest)
		return
	case errors.Is(err, credit.ErrEmptyIdempotencyKey),
		errors.Is(err, credit.ErrEmptyPackageCode):
		http.Error(w, `{"error_code":"INVALID_PURCHASE_INPUT","error":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
	default:
		http.Error(w, `{"error":"purchase_failed"}`, http.StatusInternalServerError)
		return
	}

	resp := map[string]any{
		"accepted":        true,
		"ledger_entry_id": result.LedgerEntry.ID.String(),
		"workspace_id":    wsID.String(),
		"package_code":    packageCode,
		"credits":         result.Credits,
		"was_replay":      result.WasReplay,
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

// RegisterRoutes wires the Razorpay upload webhook onto the chi router.
func (h *RazorpayUploadWebhookHandler) RegisterRoutes(mux interface {
	Post(string, http.HandlerFunc)
}) {
	mux.Post("/api/v1/webhooks/razorpay/uploads", h.Handle)
}
