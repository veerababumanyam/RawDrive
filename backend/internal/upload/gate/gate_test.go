package gate_test

// M40 / Upload Credit Meter — gate package tests (R3 RED-first).
//
// The gate package is the seam between chunked_upload.go and
// upload/credit. It isolates three decisions so the handler integration
// is a mechanical 3-line diff once this seam is proven:
//
//   1. Should the Reserve call happen? (feature-off or enterprise
//      unlimited short-circuits bypass the ledger write.)
//   2. How is InsufficientCredits surfaced? (As a structured 400 payload
//      the frontend hook can parse and open the recharge modal.)
//   3. How does the handler carry a reservation id across CreateSession
//      → finalizeUpload → Cancel without forcing every caller to learn
//      the ledger package surface? (Opaque Handle.)

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/upload/credit"
	"github.com/rawdrive/backend/internal/upload/gate"
)

// stubCredit is a hand-rolled stub of the UploadCreditService interface
// the gate talks to. The credit package's real Service satisfies the
// same surface (see integration at main.go wiring time), so the gate
// can be unit-tested without a DB OR a *credit.Service.
type stubCredit struct {
	reserveResult *credit.ReservationResult
	reserveErr    error
	consumeCalled bool
	refundCalled  bool
	lastReason    string
}

func (s *stubCredit) Reserve(ctx context.Context, in credit.ReserveInput) (*credit.ReservationResult, error) {
	return s.reserveResult, s.reserveErr
}
func (s *stubCredit) Consume(ctx context.Context, in credit.ConsumeInput) (*credit.LedgerEntry, error) {
	s.consumeCalled = true
	return &credit.LedgerEntry{ID: uuid.New()}, nil
}
func (s *stubCredit) Refund(ctx context.Context, in credit.RefundInput) (*credit.LedgerEntry, error) {
	s.refundCalled = true
	s.lastReason = in.Reason
	return &credit.LedgerEntry{ID: uuid.New()}, nil
}

// NoopGate: when the feature flag is off (or the platform has not wired
// a credit service), the gate must allow every upload and never post
// a ledger entry. The handler's call sites should see a no-op Handle.
func TestNoopGate_AllowsAllUploads_NoReservation(t *testing.T) {
	g := gate.NewNoopGate()
	h, err := g.ReserveForSession(context.Background(), gate.ReserveRequest{
		WorkspaceID:     uuid.New(),
		UploadSessionID: uuid.New(),
		Cost:            5,
		IdempotencyKey:  "k",
	})
	if err != nil {
		t.Fatalf("noop gate must not return an error, got: %v", err)
	}
	if h == nil {
		t.Fatalf("noop gate must return a non-nil handle so callers can always defer Consume/Refund")
	}
	if h.ReservationID != uuid.Nil {
		t.Fatalf("noop handle ReservationID should be uuid.Nil, got %s", h.ReservationID)
	}
	if h.FeatureEnabled {
		t.Fatalf("noop handle.FeatureEnabled should be false")
	}
}

// NoopGate Consume/Refund must be inert — they should not panic when
// the handler calls them with a Nil reservation id.
func TestNoopGate_ConsumeRefund_AreInert(t *testing.T) {
	g := gate.NewNoopGate()
	handle := &gate.ReservationHandle{ReservationID: uuid.Nil, FeatureEnabled: false}
	if err := g.Consume(context.Background(), handle, "consume-key"); err != nil {
		t.Fatalf("noop Consume must not error: %v", err)
	}
	if err := g.Refund(context.Background(), handle, "refund-key", "user-cancel"); err != nil {
		t.Fatalf("noop Refund must not error: %v", err)
	}
}

// LiveGate with a stub credit service: Reserve must return a handle
// carrying the real reservation id and mark the feature as enabled.
func TestLiveGate_Reserve_SuccessReturnsHandle(t *testing.T) {
	resID := uuid.New()
	stub := &stubCredit{
		reserveResult: &credit.ReservationResult{
			ReservationID: resID,
			AmountCredits: 5,
			State:         credit.ReservationActive,
		},
	}
	g := gate.NewLiveGate(stub)
	h, err := g.ReserveForSession(context.Background(), gate.ReserveRequest{
		WorkspaceID:     uuid.New(),
		UploadSessionID: uuid.New(),
		Cost:            5,
		IdempotencyKey:  "k1",
	})
	if err != nil {
		t.Fatalf("live gate Reserve: %v", err)
	}
	if h.ReservationID != resID {
		t.Fatalf("handle.ReservationID: want %s got %s", resID, h.ReservationID)
	}
	if !h.FeatureEnabled {
		t.Fatalf("live handle.FeatureEnabled must be true")
	}
}

// LiveGate must surface InsufficientBalanceDetails to the caller so the
// handler can render the 400 INSUFFICIENT_CREDITS response. The gate
// must preserve the structured payload — not flatten to plain error.
func TestLiveGate_Reserve_InsufficientCredits_PreservesDetails(t *testing.T) {
	stub := &stubCredit{
		reserveErr: &credit.InsufficientBalanceDetails{
			Required:  5,
			Available: 2,
			Shortfall: 3,
		},
	}
	g := gate.NewLiveGate(stub)
	_, err := g.ReserveForSession(context.Background(), gate.ReserveRequest{
		WorkspaceID:     uuid.New(),
		UploadSessionID: uuid.New(),
		Cost:            5,
		IdempotencyKey:  "k2",
	})
	if err == nil {
		t.Fatalf("expected insufficient-credits error, got nil")
	}
	var details *credit.InsufficientBalanceDetails
	if !errors.As(err, &details) {
		t.Fatalf("error must unwrap to *credit.InsufficientBalanceDetails, got %T: %v", err, err)
	}
	if details.Required != 5 || details.Available != 2 || details.Shortfall != 3 {
		t.Fatalf("details round-trip: want {5,2,3} got {%d,%d,%d}",
			details.Required, details.Available, details.Shortfall)
	}
}

// The InsufficientCreditsResponse helper serialises the structured
// payload to the exact JSON shape the frontend hook expects
// (INSUFFICIENT_CREDITS error code + required/available/shortfall).
// This pins the contract with the frontend PR #32 disabled-on-404
// sibling hook pattern.
func TestInsufficientCreditsResponse_MatchesFrontendContract(t *testing.T) {
	details := &credit.InsufficientBalanceDetails{
		Required:  5,
		Available: 2,
		Shortfall: 3,
	}
	payload := gate.InsufficientCreditsResponse(details)
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var parsed map[string]any
	if err := json.Unmarshal(raw, &parsed); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if parsed["error_code"] != "INSUFFICIENT_CREDITS" {
		t.Fatalf("error_code: want INSUFFICIENT_CREDITS got %v", parsed["error_code"])
	}
	for _, k := range []string{"required", "available", "shortfall"} {
		if _, ok := parsed[k]; !ok {
			t.Fatalf("missing %q in response: %v", k, parsed)
		}
	}
	if v, _ := parsed["shortfall"].(float64); int64(v) != 3 {
		t.Fatalf("shortfall: want 3 got %v", parsed["shortfall"])
	}
}

// Consume routes through to the underlying credit service when the
// feature is enabled.
func TestLiveGate_Consume_CallsCreditService(t *testing.T) {
	stub := &stubCredit{}
	g := gate.NewLiveGate(stub)
	handle := &gate.ReservationHandle{ReservationID: uuid.New(), FeatureEnabled: true}
	if err := g.Consume(context.Background(), handle, "consume-k"); err != nil {
		t.Fatalf("Consume: %v", err)
	}
	if !stub.consumeCalled {
		t.Fatalf("Consume must call the underlying credit service when FeatureEnabled=true")
	}
}

// Consume is a no-op when feature is disabled on the handle, even on
// a live gate. This lets the handler call Consume unconditionally at
// finalize time without branching on feature flag state.
func TestLiveGate_Consume_NoopsWhenFeatureDisabledOnHandle(t *testing.T) {
	stub := &stubCredit{}
	g := gate.NewLiveGate(stub)
	handle := &gate.ReservationHandle{ReservationID: uuid.Nil, FeatureEnabled: false}
	if err := g.Consume(context.Background(), handle, "k"); err != nil {
		t.Fatalf("Consume must not error with disabled handle: %v", err)
	}
	if stub.consumeCalled {
		t.Fatalf("Consume must not call service when FeatureEnabled=false on the handle")
	}
}

// Refund passes through the reason string — essential for observability
// (user-cancel vs stream-hash-fail vs infra-failure post-mortems).
func TestLiveGate_Refund_PassesReasonThrough(t *testing.T) {
	stub := &stubCredit{}
	g := gate.NewLiveGate(stub)
	handle := &gate.ReservationHandle{ReservationID: uuid.New(), FeatureEnabled: true}
	if err := g.Refund(context.Background(), handle, "refund-k", "stream-hash-fail"); err != nil {
		t.Fatalf("Refund: %v", err)
	}
	if !stub.refundCalled {
		t.Fatalf("Refund must call credit service")
	}
	if stub.lastReason != "stream-hash-fail" {
		t.Fatalf("reason passthrough: want 'stream-hash-fail' got %q", stub.lastReason)
	}
}
