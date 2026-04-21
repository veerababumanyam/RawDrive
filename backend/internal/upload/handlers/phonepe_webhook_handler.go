package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/streaming/recharge"
	"github.com/rawdrive/backend/internal/upload/credit"
)

// UploadPurchaseService is the narrow credit.Service surface the PhonePe
// upload webhook needs. Implemented by *credit.Service.
type UploadPurchaseService interface {
	Purchase(ctx context.Context, in credit.PurchaseInput) (*credit.PurchaseResult, error)
}

// PhonePeSignatureVerifier is the subset of *recharge.PhonePeProvider the
// webhook handler reuses. Both VerifyWebhookSignature and ParseCallback
// live on the streaming recharge provider (E15-S1 task T2 calls for
// extracting them to a shared package; reusing the concrete type here
// avoids that refactor until the Razorpay handler lands and gives the
// shared package two consumers).
type PhonePeSignatureVerifier interface {
	VerifyWebhookSignature(rawBody []byte, headers map[string]string) error
	ParseCallback(rawBody []byte) (*recharge.CallbackPayload, error)
}

// PhonePeUploadWebhookHandler serves POST /api/v1/webhooks/phonepe/uploads.
// FR-UCRT-05.
//
// Flow:
//
//  1. Read the raw body once (buffered) so the signature verifier sees the
//     exact bytes PhonePe sent, not a re-serialised copy.
//  2. Verify X-VERIFY — any mismatch returns 401 BEFORE any DB write
//     (AC-E15-S1-1).
//  3. Parse the callback → CallbackPayload.
//  4. Extract workspace_id + package_code from the merchantTransactionID
//     (encoded as `ws:<uuid>:<package-code>:<rest>` when the client
//     initiates checkout). This handler rejects callbacks whose merchant
//     id does not match that format with 400 — these are replays of
//     orders initiated before the upload-credit integration shipped and
//     must be routed to the streaming recharge handler, not here.
//  5. Delegate to credit.Service.Purchase with
//     IdempotencyKey = merchantTransactionID so duplicate deliveries
//     short-circuit on the (workspace_id, idempotency_key) partial unique
//     index (AC-E15-S1-3 — a second webhook returns 200 without creating
//     a second ledger row).
type PhonePeUploadWebhookHandler struct {
	Verifier PhonePeSignatureVerifier
	Svc      UploadPurchaseService
}

// Handle serves POST /api/v1/webhooks/phonepe/uploads.
func (h *PhonePeUploadWebhookHandler) Handle(w http.ResponseWriter, r *http.Request) {
	if h == nil || h.Verifier == nil || h.Svc == nil {
		// Mis-wired handler — do not pretend to have accepted a webhook.
		// PhonePe retries on non-2xx, so 503 triggers their backoff.
		http.Error(w, `{"error":"webhook_not_configured"}`, http.StatusServiceUnavailable)
		return
	}

	rawBody, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
	if err != nil {
		http.Error(w, `{"error":"body_too_large"}`, http.StatusRequestEntityTooLarge)
		return
	}

	// Signature check MUST precede any DB write. Any header lookup the
	// verifier needs is served by copying the request header map — this
	// matches the interface shape shared with the streaming recharge
	// webhook tests.
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

	// Only ACK successful completion here. Failed/pending states are
	// recorded by the caller but must not credit the workspace.
	if payload.Status != recharge.CallbackSuccess {
		// 200 so PhonePe stops retrying; nothing posted to the ledger.
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"accepted": true,
			"status":   string(payload.Status),
			"note":     "non-success callbacks are ACKed without crediting",
		})
		return
	}

	wsID, packageCode, parseErr := parseUploadMerchantTxnID(payload.ProviderOrderID)
	if parseErr != nil {
		// The merchantTransactionID was not one this handler issued.
		// 400 prevents PhonePe from infinite-retrying; the operator's
		// dashboard should flag these as mis-routed callbacks.
		http.Error(w, `{"error_code":"UNROUTABLE_MERCHANT_ID","error":"merchant transaction id does not match upload-credit order format"}`,
			http.StatusBadRequest)
		return
	}

	result, err := h.Svc.Purchase(r.Context(), credit.PurchaseInput{
		WorkspaceID:    wsID,
		PackageCode:    packageCode,
		Gateway:        "phonepe",
		GatewayTxnID:   payload.ProviderPaymentID,
		IdempotencyKey: payload.ProviderOrderID,
	})
	switch {
	case err == nil:
		// success (new credit, or idempotent replay — Purchase handles both)
	case errors.Is(err, credit.ErrPackageNotFound):
		http.Error(w, `{"error_code":"PACKAGE_NOT_FOUND","error":"package no longer active"}`, http.StatusBadRequest)
		return
	case errors.Is(err, credit.ErrEmptyIdempotencyKey),
		errors.Is(err, credit.ErrEmptyPackageCode):
		http.Error(w, `{"error_code":"INVALID_PURCHASE_INPUT","error":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
	default:
		// Let PhonePe retry by returning 5xx — the purchase will be
		// idempotent on retry via (workspace_id, idempotency_key).
		http.Error(w, `{"error":"purchase_failed"}`, http.StatusInternalServerError)
		return
	}

	resp := map[string]any{
		"accepted":         true,
		"ledger_entry_id":  result.LedgerEntry.ID.String(),
		"workspace_id":     wsID.String(),
		"package_code":     packageCode,
		"credits":          result.Credits,
		"was_replay":       result.WasReplay,
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

// parseUploadMerchantTxnID splits the encoded merchantTransactionID into
// workspace_id + package_code. The format is intentionally namespaced
// with an "ws:" prefix so future product surfaces can coexist without
// ambiguity: `ws:<uuid>:<package-code>:<opaque-suffix>`. The suffix is
// whatever additional uniqueness the order-initiation flow adds (ULID,
// request timestamp, etc.); it's captured in the full ID so idempotency
// still resolves per-order.
func parseUploadMerchantTxnID(id string) (uuid.UUID, string, error) {
	parts := strings.SplitN(id, ":", 4)
	if len(parts) < 3 || parts[0] != "ws" {
		return uuid.Nil, "", errors.New("merchant id missing ws: prefix")
	}
	wsID, err := uuid.Parse(parts[1])
	if err != nil {
		return uuid.Nil, "", errors.New("merchant id workspace uuid malformed")
	}
	packageCode := parts[2]
	if packageCode == "" {
		return uuid.Nil, "", errors.New("merchant id missing package code")
	}
	return wsID, packageCode, nil
}

// RegisterRoutes wires the PhonePe upload webhook onto the chi router.
func (h *PhonePeUploadWebhookHandler) RegisterRoutes(mux interface {
	Post(string, http.HandlerFunc)
}) {
	mux.Post("/api/v1/webhooks/phonepe/uploads", h.Handle)
}
