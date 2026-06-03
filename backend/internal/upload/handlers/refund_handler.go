package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/upload/credit"
)

// UploadRefundService is the narrow service interface the refund handler
// needs. *credit.Service satisfies this directly.
type UploadRefundService interface {
	RefundPurchase(ctx context.Context, in credit.RefundPurchaseInput) (*credit.LedgerEntry, error)
}

// UploadRefundHandler serves POST /api/v1/uploads/purchases/{id}/refund.
// FR-UCRT-11 — 7-day window + fully-unspent eligibility are enforced inside
// credit.Service.RefundPurchase; this handler only translates HTTP → service
// input and service errors → HTTP status codes.
//
// Workspace scoping: the workspace_id is taken from the authenticated JWT's
// workspace_id claim, NOT from a URL param. This prevents a
// cross-workspace refund attack where an attacker guesses a purchase UUID
// in another workspace. The service also re-validates ownership by
// comparing the persisted upload_purchases.workspace_id against the input;
// mismatches return ErrPurchaseNotFound (404-style obfuscation).
type UploadRefundHandler struct {
	Svc UploadRefundService
}

type refundRequest struct {
	IdempotencyKey string `json:"idempotency_key"`
}

type refundResponse struct {
	LedgerEntryID  string `json:"ledger_entry_id"`
	PurchaseID     string `json:"purchase_id"`
	AmountCredits  int64  `json:"amount_credits"` // negative — credits removed from balance
	IdempotencyKey string `json:"idempotency_key"`
	CreatedAt      string `json:"created_at"`
}

// Refund handles POST /api/v1/uploads/purchases/{id}/refund.
//
// 401 — no JWT (upstream RequireAuth)
// 400 — malformed URL param or body, missing workspace/actor claim
// 404 — purchase not found OR workspace mismatch (handled as ErrPurchaseNotFound
//
//	to avoid leaking cross-workspace presence)
//
// 422 REFUND_WINDOW_EXPIRED — purchase older than 7 days
// 422 CREDITS_PARTIALLY_CONSUMED — credits from this purchase already reserved/consumed
// 500 — service or DB error
// 200 — success; idempotent on (workspace_id, idempotency_key)
func (h *UploadRefundHandler) Refund(w http.ResponseWriter, r *http.Request) {
	if h.Svc == nil {
		http.Error(w, `{"error":"refund_service_unavailable"}`, http.StatusServiceUnavailable)
		return
	}

	// Purchase id from URL.
	purchaseIDRaw := chi.URLParam(r, "id")
	purchaseID, err := uuid.Parse(purchaseIDRaw)
	if err != nil {
		http.Error(w, `{"error_code":"INVALID_PURCHASE_ID","error":"purchase id must be a UUID"}`, http.StatusBadRequest)
		return
	}

	// Workspace + actor from JWT claims.
	claims := middleware.JWTClaimsFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthenticated"}`, http.StatusUnauthorized)
		return
	}
	wsRaw, _ := claims["workspace_id"].(string)
	wsID, err := uuid.Parse(wsRaw)
	if err != nil {
		http.Error(w, `{"error_code":"WORKSPACE_ID_MISSING","error":"workspace_id claim missing or malformed"}`, http.StatusBadRequest)
		return
	}
	actorRaw, _ := claims["sub"].(string)
	actorID, err := uuid.Parse(actorRaw)
	if err != nil {
		http.Error(w, `{"error_code":"ACTOR_ID_MISSING","error":"sub claim missing or malformed"}`, http.StatusBadRequest)
		return
	}

	// M41-SEC-002: Cap the request body at 1 KiB. The refund payload has
	// one field (idempotency_key) and fits well under 1 KiB. Without a
	// cap, an authenticated user could stream a multi-GB JSON body into
	// the decoder and force unbounded memory allocation. Mirrors the
	// 1 MiB cap on the webhook handlers and the 4 KiB cap on the admin
	// grant handler — the max here is tighter because the payload is
	// even simpler.
	const refundBodyCap = 1024
	capped, readErr := io.ReadAll(http.MaxBytesReader(w, r.Body, refundBodyCap))
	if readErr != nil {
		http.Error(w, `{"error":"body_too_large"}`, http.StatusRequestEntityTooLarge)
		return
	}
	var body refundRequest
	if err := json.Unmarshal(capped, &body); err != nil {
		http.Error(w, `{"error":"invalid_json"}`, http.StatusBadRequest)
		return
	}

	entry, err := h.Svc.RefundPurchase(r.Context(), credit.RefundPurchaseInput{
		PurchaseID:     purchaseID,
		WorkspaceID:    wsID,
		IdempotencyKey: body.IdempotencyKey,
		ActorID:        actorID,
	})
	switch {
	case err == nil:
		// success
	case errors.Is(err, credit.ErrEmptyPurchaseID),
		errors.Is(err, credit.ErrEmptyIdempotencyKey):
		http.Error(w, `{"error_code":"INVALID_REFUND_INPUT","error":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
	case errors.Is(err, credit.ErrPurchaseNotFound):
		// Covers both "row missing" and "row exists in another workspace".
		// We return the same 404 in both cases so enumeration attempts can't
		// distinguish "your purchase doesn't exist" from "that purchase
		// belongs to a different workspace".
		http.Error(w, `{"error_code":"PURCHASE_NOT_FOUND","error":"purchase not found"}`, http.StatusNotFound)
		return
	case errors.Is(err, credit.ErrRefundWindowExpired):
		http.Error(w, `{"error_code":"REFUND_WINDOW_EXPIRED","error":"refund window expired (7-day limit)"}`, http.StatusUnprocessableEntity)
		return
	case errors.Is(err, credit.ErrCreditsPartiallyConsumed):
		http.Error(w, `{"error_code":"CREDITS_PARTIALLY_CONSUMED","error":"credits from this purchase have been consumed or reserved"}`, http.StatusUnprocessableEntity)
		return
	default:
		http.Error(w, `{"error":"refund_failed"}`, http.StatusInternalServerError)
		return
	}

	resp := refundResponse{
		LedgerEntryID:  entry.ID.String(),
		PurchaseID:     purchaseID.String(),
		AmountCredits:  entry.AmountCredits,
		IdempotencyKey: entry.IdempotencyKey,
		CreatedAt:      entry.CreatedAt.UTC().Format("2006-01-02T15:04:05Z07:00"),
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

// RegisterRoutes wires the refund endpoint onto an existing chi router.
func (h *UploadRefundHandler) RegisterRoutes(mux interface {
	Post(string, http.HandlerFunc)
}) {
	mux.Post("/api/v1/uploads/purchases/{id}/refund", h.Refund)
}
