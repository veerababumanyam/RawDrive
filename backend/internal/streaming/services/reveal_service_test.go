package services

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/streaming/repository"
)

// -------- fakes --------------------------------------------------------------

type fakeStreams struct {
	stream *IngestStream
	err    error
}

func (f *fakeStreams) GetIngestStream(ctx context.Context, id uuid.UUID) (*IngestStream, error) {
	if f.err != nil {
		return nil, f.err
	}
	s := *f.stream // copy
	s.ID = id
	return &s, nil
}

type fakeRotator struct {
	called bool
	err    error
}

func (r *fakeRotator) RotateKey(ctx context.Context, streamID uuid.UUID, uid string) (*IngestStream, error) {
	r.called = true
	return nil, r.err
}

type fakeAudit struct {
	mu      sync.Mutex
	entries []repository.IngestRevealAuditEntry
	err     error
}

func (a *fakeAudit) Insert(ctx context.Context, e repository.IngestRevealAuditEntry) (uuid.UUID, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.err != nil {
		return uuid.Nil, a.err
	}
	id := uuid.New()
	e.ID = id
	a.entries = append(a.entries, e)
	return id, nil
}

func (a *fakeAudit) ListByStream(ctx context.Context, id uuid.UUID, limit int) ([]repository.IngestRevealAuditEntry, error) {
	return nil, nil
}

// -------- helper builder -----------------------------------------------------

func buildService(t *testing.T, scheduled time.Time, now time.Time) (*RevealService, *fakeStreams, *fakeAudit, *fakeRotator) {
	t.Helper()
	wid, sid := uuid.New(), uuid.New()
	streams := &fakeStreams{stream: &IngestStream{
		ID:                sid,
		WorkspaceID:       wid,
		ScheduledStartAt:  scheduled,
		CFLiveInputUID:    "cf-uid-1",
		RTMPSURL:          "rtmps://live.cloudflare.com:443/live/",
		SRTURL:            "srt://live.cloudflare.com:778",
		IngestKeyPlain:    "live_key_plain",
		IngestKeySRTPlain: "srt_key_plain",
	}}
	rot := &fakeRotator{}
	aud := &fakeAudit{}
	svc := NewRevealService(streams, rot, aud, Options{
		Clock:        func() time.Time { return now },
		RevealWindow: 30 * time.Minute,
	})
	return svc, streams, aud, rot
}

// -------- tests --------------------------------------------------------------

// T-S5-05 — Pre-T-30 reveal returns ErrRevealTooEarly; NOT audited (schema
// CHECK constraint forbids custom 'denied' reason, so denial is logged at
// handler layer only).
func TestReveal_PreT30_ReturnsErrTooEarly_NotAudited(t *testing.T) {
	scheduled := time.Date(2026, 5, 1, 18, 0, 0, 0, time.UTC)
	now := scheduled.Add(-45 * time.Minute) // 15 min before window opens
	svc, streams, aud, _ := buildService(t, scheduled, now)

	_, err := svc.Reveal(context.Background(), RevealRequest{
		StreamID: streams.stream.ID,
		ActorID:  uuid.New(),
		ActorIP:  "10.0.0.1",
	})
	if !errors.Is(err, ErrRevealTooEarly) {
		t.Fatalf("err = %v, want ErrRevealTooEarly", err)
	}
	if n := len(aud.entries); n != 0 {
		t.Errorf("audit entries = %d, want 0 (denied reveals are NOT inserted into append-only table)", n)
	}
}

// T-S5-06 — At T-30 exactly → allowed, reason=scheduled_t_minus_30
func TestReveal_AtT30_Allowed(t *testing.T) {
	scheduled := time.Date(2026, 5, 1, 18, 0, 0, 0, time.UTC)
	now := scheduled.Add(-30 * time.Minute).Add(time.Second) // just inside window
	svc, streams, aud, _ := buildService(t, scheduled, now)

	resp, err := svc.Reveal(context.Background(), RevealRequest{
		StreamID: streams.stream.ID, ActorID: uuid.New(), ActorIP: "10.0.0.2",
	})
	if err != nil {
		t.Fatalf("Reveal: %v", err)
	}
	if resp.StreamKey != "live_key_plain" {
		t.Errorf("StreamKey = %q", resp.StreamKey)
	}
	if len(aud.entries) != 1 {
		t.Fatalf("audit entries = %d", len(aud.entries))
	}
	if aud.entries[0].Reason != repository.RevealReasonScheduledT30 {
		t.Errorf("reason = %q", aud.entries[0].Reason)
	}
}

// T-S5-07 — Post-T-30 → allowed
func TestReveal_PostT30_Allowed(t *testing.T) {
	scheduled := time.Date(2026, 5, 1, 18, 0, 0, 0, time.UTC)
	now := scheduled.Add(10 * time.Minute) // past scheduled start
	svc, streams, aud, _ := buildService(t, scheduled, now)

	_, err := svc.Reveal(context.Background(), RevealRequest{
		StreamID: streams.stream.ID, ActorID: uuid.New(),
	})
	if err != nil {
		t.Fatalf("%v", err)
	}
	if aud.entries[0].Reason != repository.RevealReasonScheduledT30 {
		t.Errorf("reason = %q", aud.entries[0].Reason)
	}
}

// T-S5-08 — Override pre-T-30 → allowed, reason=manual_override
func TestReveal_OverridePreT30_Allowed_AuditedAsManual(t *testing.T) {
	scheduled := time.Date(2026, 5, 1, 18, 0, 0, 0, time.UTC)
	now := scheduled.Add(-2 * time.Hour) // well outside window
	svc, streams, aud, _ := buildService(t, scheduled, now)

	_, err := svc.Reveal(context.Background(), RevealRequest{
		StreamID: streams.stream.ID, ActorID: uuid.New(), Override: true,
	})
	if err != nil {
		t.Fatalf("%v", err)
	}
	if len(aud.entries) != 1 || aud.entries[0].Reason != repository.RevealReasonManualOverride {
		t.Errorf("expected manual_override audit, got %+v", aud.entries)
	}
}

// T-S5-09 — Audit captures actor, IP, UA
func TestReveal_AuditCapturesIPUserAgentActor(t *testing.T) {
	scheduled := time.Date(2026, 5, 1, 18, 0, 0, 0, time.UTC)
	now := scheduled.Add(-5 * time.Minute) // inside window
	svc, streams, aud, _ := buildService(t, scheduled, now)

	actor := uuid.New()
	_, err := svc.Reveal(context.Background(), RevealRequest{
		StreamID: streams.stream.ID, ActorID: actor,
		ActorIP: "203.0.113.42", UserAgent: "Rawdrive/1.0 test",
	})
	if err != nil {
		t.Fatalf("%v", err)
	}
	e := aud.entries[0]
	if e.RevealedBy == nil || *e.RevealedBy != actor {
		t.Errorf("RevealedBy = %v, want %v", e.RevealedBy, actor)
	}
	if e.ClientIP != "203.0.113.42" {
		t.Errorf("ClientIP = %q", e.ClientIP)
	}
	if e.UserAgent != "Rawdrive/1.0 test" {
		t.Errorf("UserAgent = %q", e.UserAgent)
	}
	if !e.RevealedAt.Equal(now) {
		t.Errorf("RevealedAt = %v, want %v", e.RevealedAt, now)
	}
}

// T-S5-10 — Rotate regenerates key, writes rotation audit
func TestRotate_RegeneratesKey_WritesRotationAudit(t *testing.T) {
	scheduled := time.Date(2026, 5, 1, 18, 0, 0, 0, time.UTC)
	now := scheduled.Add(-2 * time.Hour)
	svc, streams, aud, rot := buildService(t, scheduled, now)

	actor := uuid.New()
	err := svc.Rotate(context.Background(), RotateRequest{
		StreamID: streams.stream.ID, ActorID: actor, ActorIP: "10.0.0.3",
	})
	if err != nil {
		t.Fatalf("Rotate: %v", err)
	}
	if !rot.called {
		t.Error("KeyRotator.RotateKey not called")
	}
	if len(aud.entries) != 1 || aud.entries[0].Reason != repository.RevealReasonRotation {
		t.Errorf("expected rotation audit, got %+v", aud.entries)
	}
}

// Additional: rotation audit NOT written if CF rotation fails
func TestRotate_CFFailure_NoAudit(t *testing.T) {
	scheduled := time.Date(2026, 5, 1, 18, 0, 0, 0, time.UTC)
	now := scheduled
	svc, streams, aud, rot := buildService(t, scheduled, now)
	rot.err = errors.New("cf down")

	err := svc.Rotate(context.Background(), RotateRequest{StreamID: streams.stream.ID, ActorID: uuid.New()})
	if err == nil {
		t.Fatal("expected error")
	}
	if len(aud.entries) != 0 {
		t.Errorf("audit entries = %d, want 0 when rotation fails", len(aud.entries))
	}
}

// Additional: stream not found propagates
func TestReveal_StreamNotFound_ReturnsError(t *testing.T) {
	svc, streams, _, _ := buildService(t, time.Now(), time.Now())
	streams.err = errors.New("not found")
	_, err := svc.Reveal(context.Background(), RevealRequest{StreamID: uuid.New(), ActorID: uuid.New()})
	if err == nil {
		t.Fatal("expected error")
	}
}

// M34/M35 wiring — convenience constructor returns a non-nil service that
// satisfies the *RevealService type even with a nil pool. Reveal calls will
// fail (pool unreachable) but construction itself must not panic so main.go
// can eagerly wire it at boot before the DB is guaranteed ready.
func TestNewRevealServiceFromPool_NilPool_DoesNotPanic(t *testing.T) {
	svc := NewRevealServiceFromPool(nil, nil, Options{})
	if svc == nil {
		t.Fatal("expected non-nil service")
	}
	_, err := svc.Reveal(context.Background(), RevealRequest{StreamID: uuid.New(), ActorID: uuid.New()})
	if err == nil {
		t.Error("expected error with nil pool")
	}
}

// Reason is always valid per enum
func TestReveal_ReasonIsValid(t *testing.T) {
	scheduled := time.Date(2026, 5, 1, 18, 0, 0, 0, time.UTC)
	now := scheduled.Add(-10 * time.Minute)
	svc, streams, aud, _ := buildService(t, scheduled, now)

	_, _ = svc.Reveal(context.Background(), RevealRequest{StreamID: streams.stream.ID, ActorID: uuid.New()})
	if !aud.entries[0].Reason.IsValid() {
		t.Errorf("reason %q not in enum", aud.entries[0].Reason)
	}
}
