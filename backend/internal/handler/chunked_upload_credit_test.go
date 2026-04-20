package handler_test

// M40 / Upload Credit Meter — chunked upload + credit gate integration.
//
// These tests pin the behaviour that CreateSession calls the credit
// gate BEFORE any R2 multipart init, so an over-budget workspace gets
// rejected with 400 INSUFFICIENT_CREDITS without spending money on a
// failed R2 CreateMultipartUpload call.
//
// Scope: feature-on (LiveGate + stub credit service) behaviour. The
// feature-off case (NoopGate) is covered by the existing chunked_upload
// tests — those all pass unchanged, which is the backward-compat proof.

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/handler"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/service"
	"github.com/rawdrive/backend/internal/upload/credit"
	"github.com/rawdrive/backend/internal/upload/gate"
)

// stubCreditForHandler is a hand-rolled stub that satisfies
// gate.UploadCreditService. Drives the 3 handler integration paths:
// InsufficientCredits rejection, Reserve success, and Consume/Refund
// downstream (those are proven by gate_test.go — here we only verify
// the handler dispatches at the right moments).
type stubCreditForHandler struct {
	reserveErr    error
	reserveOK     *credit.ReservationResult
	reserveCalled bool
	consumeCalled bool
	refundCalled  bool
}

func (s *stubCreditForHandler) Reserve(_ context.Context, _ credit.ReserveInput) (*credit.ReservationResult, error) {
	s.reserveCalled = true
	return s.reserveOK, s.reserveErr
}
func (s *stubCreditForHandler) Consume(_ context.Context, _ credit.ConsumeInput) (*credit.LedgerEntry, error) {
	s.consumeCalled = true
	return &credit.LedgerEntry{ID: uuid.New()}, nil
}
func (s *stubCreditForHandler) Refund(_ context.Context, _ credit.RefundInput) (*credit.LedgerEntry, error) {
	s.refundCalled = true
	return &credit.LedgerEntry{ID: uuid.New()}, nil
}

// buildCreditTestHandler returns a ChunkedUploadHandler wired with a
// LiveGate over the stub. Other deps are nil because the tests reject
// at the gate BEFORE any store/storage call.
func buildCreditTestHandler(stub *stubCreditForHandler) *handler.ChunkedUploadHandler {
	return handler.NewChunkedUploadHandler(nil, nil, nil, nil).
		WithUploadCredit(gate.NewLiveGate(stub))
}

func buildCreditTestRequest(wsID, userID uuid.UUID) *http.Request {
	body := chunkedUploadCreateBody{
		Filename:    "test.jpg",
		ContentType: "image/jpeg",
		TotalSize:   1024,
	}
	buf, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads", bytes.NewReader(buf))
	req.Header.Set("Content-Type", "application/json")
	claims := map[string]interface{}{
		"sub":           userID.String(),
		"workspace_id":  wsID.String(),
		"platform_role": "photographer",
	}
	ctx := middleware.WithJWTClaims(req.Context(), claims)
	ctx = middleware.WithWorkspaceID(ctx, wsID.String())
	return req.WithContext(ctx)
}

// CreateSession must return 400 INSUFFICIENT_CREDITS with the structured
// payload when the credit gate returns InsufficientBalanceDetails. This
// proves the gate runs BEFORE R2 multipart init (no R2 call happened —
// the stub would have been bypassed if validation was the reject point,
// but we have no validation wired).
func TestChunkedUpload_ReserveFails_Returns400WithStructuredPayload(t *testing.T) {
	stub := &stubCreditForHandler{
		reserveErr: &credit.InsufficientBalanceDetails{
			Required:  1,
			Available: 0,
			Shortfall: 1,
		},
	}
	h := buildCreditTestHandler(stub)
	wsID := uuid.New()
	userID := uuid.New()

	req := buildCreditTestRequest(wsID, userID)
	rr := httptest.NewRecorder()
	h.CreateSession(rr, req)

	require.Equal(t, http.StatusBadRequest, rr.Code,
		"insufficient credits must be 400, not 500 or 201. body=%s", rr.Body.String())
	assert.True(t, stub.reserveCalled, "handler must invoke the credit gate")

	var body map[string]any
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &body))
	assert.Equal(t, "INSUFFICIENT_CREDITS", body["error_code"],
		"response error_code must match the frontend useUpload hook contract")
	assert.Equal(t, float64(1), body["required"])
	assert.Equal(t, float64(0), body["available"])
	assert.Equal(t, float64(1), body["shortfall"])
}

// When Reserve succeeds, the handler must proceed past the credit gate
// and only fail later at the next production-only dependency (the
// nil-sessions guard). This proves the happy path advances past the
// gate — the remaining 500 is expected because we deliberately pass
// nil sessions/storage for this narrow test.
func TestChunkedUpload_ReserveSucceeds_AdvancesPastGate(t *testing.T) {
	stub := &stubCreditForHandler{
		reserveOK: &credit.ReservationResult{
			ReservationID: uuid.New(),
			AmountCredits: 1,
			State:         credit.ReservationActive,
		},
	}
	h := buildCreditTestHandler(stub)
	wsID := uuid.New()
	userID := uuid.New()

	req := buildCreditTestRequest(wsID, userID)
	rr := httptest.NewRecorder()
	h.CreateSession(rr, req)

	assert.True(t, stub.reserveCalled, "handler must call Reserve on the gate")
	// With nil sessions store, CreateSession should reach the
	// `h.sessions == nil` guard and emit 500. Any OTHER status (e.g.
	// 400 INSUFFICIENT_CREDITS) would mean the gate rejected a valid
	// reservation — regression.
	assert.Equal(t, http.StatusInternalServerError, rr.Code,
		"after gate success, handler must advance to the sessions-store guard (500 here due to nil stores)")
	assert.Contains(t, rr.Body.String(), "upload sessions store not wired")
}

// A handler constructed WITHOUT WithUploadCredit must default to the
// NoopGate — existing backward-compat proof that the feature-off path
// is exactly what shipped before M40.
func TestChunkedUpload_NoExplicitGate_DefaultsToNoopAndAdvances(t *testing.T) {
	h := handler.NewChunkedUploadHandler(nil, nil, nil, nil)
	wsID := uuid.New()
	userID := uuid.New()
	req := buildCreditTestRequest(wsID, userID)
	rr := httptest.NewRecorder()
	h.CreateSession(rr, req)
	// NoopGate always succeeds, so again the nil-sessions guard fires.
	assert.Equal(t, http.StatusInternalServerError, rr.Code)
	assert.Contains(t, rr.Body.String(), "upload sessions store not wired")
}

// Passing nil to WithUploadCredit must silently fall back to NoopGate,
// not panic and not leave the handler with a nil gate that crashes at
// request time.
func TestChunkedUpload_WithUploadCreditNil_DefaultsToNoop(t *testing.T) {
	h := handler.NewChunkedUploadHandler(nil, nil, nil, nil).
		WithUploadCredit(nil)
	wsID := uuid.New()
	userID := uuid.New()
	req := buildCreditTestRequest(wsID, userID)
	rr := httptest.NewRecorder()
	assert.NotPanics(t, func() { h.CreateSession(rr, req) },
		"WithUploadCredit(nil) must not leave h.creditGate nil")
	assert.Equal(t, http.StatusInternalServerError, rr.Code,
		"NoopGate passes through — we still hit the sessions-store guard")
}

// Silence unused-import warnings in edge cases where the existing
// setupChunkedUploadRig is not referenced in this file's test run.
var _ = service.UploadManifestValidation(nil)
