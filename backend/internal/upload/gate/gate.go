// Package gate is the seam between chunked upload handlers and the
// M40 upload credit ledger. It exists so the handler integration is a
// small, mechanical diff:
//
//	g := chosenGate // NoopGate or LiveGate depending on feature flag
//	handle, err := g.ReserveForSession(ctx, gate.ReserveRequest{...})
//	// ... upload happens ...
//	_ = g.Consume(ctx, handle, idempotencyKey)
//	// or on failure:
//	_ = g.Refund(ctx, handle, idempotencyKey, "stream-hash-fail")
//
// The handler never imports upload/credit directly, which keeps the
// existing package boundary clean and makes it trivial to stub the
// gate in handler-level tests.
package gate

import (
	"context"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/upload/credit"
)

// UploadCreditService is the narrow surface of upload/credit.Service
// that the gate needs. credit.Service satisfies this via its exported
// methods — the interface exists so tests can stub it without pulling
// a *pgxpool.Pool or a real DB.
type UploadCreditService interface {
	Reserve(ctx context.Context, in credit.ReserveInput) (*credit.ReservationResult, error)
	Consume(ctx context.Context, in credit.ConsumeInput) (*credit.LedgerEntry, error)
	Refund(ctx context.Context, in credit.RefundInput) (*credit.LedgerEntry, error)
}

// ReserveRequest is the input the handler passes to ReserveForSession.
// It's a thin value type; the gate converts it into credit.ReserveInput.
//
// M40 v1 is fixed at 1 credit per upload (feature-prd.md §4 Decision 1) and
// the handler has no plumbing for plan tier, so PlanCode + EnterpriseUnlimited
// were removed from this request in 2026-04-20 (M40-CODE-001). They live on in
// credit.ReserveInput + the `unlimited_passthrough` entry_type so a later wave
// that adds plan-tier plumbing (JWT claim or workspace repo on the handler)
// can restore the unlimited path without changing the DB schema.
type ReserveRequest struct {
	WorkspaceID     uuid.UUID
	UploadSessionID uuid.UUID
	Cost            int64
	IdempotencyKey  string
	CreatedBy       *uuid.UUID
}

// ReservationHandle is what the handler carries from CreateSession
// through to finalize or cancel. Intentionally opaque — the handler
// should never reach into the ReservationID directly, only pass the
// handle to Consume() or Refund().
//
// When FeatureEnabled is false (NoopGate, or a disabled-on-handle
// scenario), Consume/Refund become no-ops so the call sites stay
// branch-free.
type ReservationHandle struct {
	ReservationID  uuid.UUID
	FeatureEnabled bool
}

// UploadCreditGate is the interface the handler imports.
type UploadCreditGate interface {
	ReserveForSession(ctx context.Context, req ReserveRequest) (*ReservationHandle, error)
	Consume(ctx context.Context, h *ReservationHandle, idempotencyKey string) error
	Refund(ctx context.Context, h *ReservationHandle, idempotencyKey, reason string) error
}

// NoopGate is the feature-off implementation. Every ReserveForSession
// call returns a disabled-handle and no ledger entry is ever written.
// Wired in main.go when streaming.upload_credit_pill_v1 is false OR
// when no credit service is available.
type NoopGate struct{}

// NewNoopGate returns a gate that allows every upload unconditionally.
func NewNoopGate() *NoopGate { return &NoopGate{} }

// ReserveForSession always returns a disabled handle — upload proceeds.
func (g *NoopGate) ReserveForSession(ctx context.Context, req ReserveRequest) (*ReservationHandle, error) {
	return &ReservationHandle{ReservationID: uuid.Nil, FeatureEnabled: false}, nil
}

// Consume is inert.
func (g *NoopGate) Consume(ctx context.Context, h *ReservationHandle, idempotencyKey string) error {
	return nil
}

// Refund is inert.
func (g *NoopGate) Refund(ctx context.Context, h *ReservationHandle, idempotencyKey, reason string) error {
	return nil
}

// LiveGate is the feature-on implementation. Delegates to a real
// UploadCreditService (typically *credit.Service wired in main.go).
type LiveGate struct {
	svc UploadCreditService
}

// NewLiveGate constructs a LiveGate around the provided credit service.
func NewLiveGate(svc UploadCreditService) *LiveGate {
	return &LiveGate{svc: svc}
}

// ReserveForSession calls credit.Reserve and converts the result to a
// ReservationHandle. If the service returns an
// *credit.InsufficientBalanceDetails error, that error is propagated
// verbatim so the handler can emit the 400 INSUFFICIENT_CREDITS body.
func (g *LiveGate) ReserveForSession(ctx context.Context, req ReserveRequest) (*ReservationHandle, error) {
	res, err := g.svc.Reserve(ctx, credit.ReserveInput{
		WorkspaceID:     req.WorkspaceID,
		UploadSessionID: req.UploadSessionID,
		AmountCredits:   req.Cost,
		IdempotencyKey:  req.IdempotencyKey,
		CreatedBy:       req.CreatedBy,
		// PlanCode + EnterpriseUnlimited intentionally unset — see ReserveRequest
		// doc (M40-CODE-001). The credit service defaults to the reserve path
		// with a balance check, which is the correct behaviour for M40 v1.
	})
	if err != nil {
		return nil, err
	}
	if res == nil {
		return &ReservationHandle{ReservationID: uuid.Nil, FeatureEnabled: false}, nil
	}
	return &ReservationHandle{
		ReservationID:  res.ReservationID,
		FeatureEnabled: true,
	}, nil
}

// Consume routes through to credit.Consume when the handle is enabled.
// No-ops when FeatureEnabled=false so the handler can call Consume
// unconditionally at finalize time.
func (g *LiveGate) Consume(ctx context.Context, h *ReservationHandle, idempotencyKey string) error {
	if h == nil || !h.FeatureEnabled {
		return nil
	}
	_, err := g.svc.Consume(ctx, credit.ConsumeInput{
		ReservationID:  h.ReservationID,
		IdempotencyKey: idempotencyKey,
	})
	return err
}

// Refund routes through to credit.Refund. No-ops on disabled handle.
func (g *LiveGate) Refund(ctx context.Context, h *ReservationHandle, idempotencyKey, reason string) error {
	if h == nil || !h.FeatureEnabled {
		return nil
	}
	_, err := g.svc.Refund(ctx, credit.RefundInput{
		ReservationID:  h.ReservationID,
		IdempotencyKey: idempotencyKey,
		Reason:         reason,
	})
	return err
}

// InsufficientCreditsPayload is the JSON body the handler returns as a
// 400 response when Reserve fails with insufficient balance. Pinned
// to the shape the frontend useUpload hook parses: error_code +
// required + available + shortfall.
type InsufficientCreditsPayload struct {
	ErrorCode string `json:"error_code"`
	Required  int64  `json:"required"`
	Available int64  `json:"available"`
	Shortfall int64  `json:"shortfall"`
}

// InsufficientCreditsResponse converts credit.InsufficientBalanceDetails
// into the frontend-facing payload. Centralising the mapping here keeps
// handler code free of the "INSUFFICIENT_CREDITS" literal so renames
// stay local.
func InsufficientCreditsResponse(d *credit.InsufficientBalanceDetails) InsufficientCreditsPayload {
	if d == nil {
		return InsufficientCreditsPayload{ErrorCode: "INSUFFICIENT_CREDITS"}
	}
	return InsufficientCreditsPayload{
		ErrorCode: "INSUFFICIENT_CREDITS",
		Required:  d.Required,
		Available: d.Available,
		Shortfall: d.Shortfall,
	}
}
