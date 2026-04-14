package statepusher_test

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/streaming/statepusher"
)

// fakeNATSPublisher records publishes and optionally returns an error
// to simulate broker outages.
type fakeNATSPublisher struct {
	mu       sync.Mutex
	calls    []fakeNATSPub
	failWith error
}

type fakeNATSPub struct {
	Subject string
	Data    []byte
}

func (f *fakeNATSPublisher) Publish(_ context.Context, subject string, data []byte) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.failWith != nil {
		return f.failWith
	}
	cp := make([]byte, len(data))
	copy(cp, data)
	f.calls = append(f.calls, fakeNATSPub{Subject: subject, Data: cp})
	return nil
}

func (f *fakeNATSPublisher) snapshot() []fakeNATSPub {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]fakeNATSPub, len(f.calls))
	copy(out, f.calls)
	return out
}

// fakeNATSSubscriber lets tests push messages into the bridge channel
// after Subscribe has been called and inspect the requested startSeq.
type fakeNATSSubscriber struct {
	mu       sync.Mutex
	subs     []*fakeNATSSub
	failWith error
}

type fakeNATSSub struct {
	Subject  string
	StartSeq uint64
	ch       chan statepusher.NATSMessage
}

func (f *fakeNATSSubscriber) Subscribe(_ context.Context, subject string, startSeq uint64) (<-chan statepusher.NATSMessage, func(), error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.failWith != nil {
		return nil, nil, f.failWith
	}
	s := &fakeNATSSub{
		Subject:  subject,
		StartSeq: startSeq,
		ch:       make(chan statepusher.NATSMessage, 16),
	}
	f.subs = append(f.subs, s)
	cancel := func() {
		f.mu.Lock()
		defer f.mu.Unlock()
		// Idempotent close.
		select {
		case _, ok := <-s.ch:
			if !ok {
				return
			}
		default:
		}
		// Drain & close defensively.
		defer func() { _ = recover() }()
		close(s.ch)
	}
	return s.ch, cancel, nil
}

func (f *fakeNATSSubscriber) lastSub() *fakeNATSSub {
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.subs) == 0 {
		return nil
	}
	return f.subs[len(f.subs)-1]
}

func (f *fakeNATSSubscriber) push(msg statepusher.NATSMessage) {
	if s := f.lastSub(); s != nil {
		s.ch <- msg
	}
}

func waitFor(t *testing.T, ch <-chan statepusher.StateEvent, want string) statepusher.StateEvent {
	t.Helper()
	deadline := time.After(2 * time.Second)
	for {
		select {
		case ev, ok := <-ch:
			if !ok {
				t.Fatalf("channel closed before receiving event %q", want)
			}
			if ev.Kind == "heartbeat" {
				continue
			}
			if ev.ID != want {
				t.Fatalf("got event id %q, want %q", ev.ID, want)
			}
			return ev
		case <-deadline:
			t.Fatalf("timeout waiting for event %q", want)
		}
	}
}

func TestNATSStatePusher_Publish_FansOutLocalAndNATS(t *testing.T) {
	t.Parallel()
	pub := &fakeNATSPublisher{}
	sub := &fakeNATSSubscriber{}
	local := statepusher.NewStatePusher(newFakeClock(time.Now()), 16)
	p := statepusher.NewNATSStatePusher(pub, sub, local)

	streamID := uuid.New()
	ctx := context.Background()
	ch, cleanup, err := p.Subscribe(ctx, streamID, "")
	if err != nil {
		t.Fatalf("subscribe: %v", err)
	}
	defer cleanup()

	ev := statepusher.StateEvent{ID: "ev-1", Kind: "state_change", State: "live", At: time.Now()}
	if err := p.Publish(ctx, streamID, ev); err != nil {
		t.Fatalf("publish: %v", err)
	}

	got := waitFor(t, ch, "ev-1")
	if got.State != "live" {
		t.Fatalf("local subscriber got wrong state %q", got.State)
	}

	calls := pub.snapshot()
	if len(calls) != 1 {
		t.Fatalf("expected 1 NATS publish, got %d", len(calls))
	}
	wantSubj := statepusher.DefaultSubject(streamID)
	if calls[0].Subject != wantSubj {
		t.Fatalf("nats subject = %q, want %q", calls[0].Subject, wantSubj)
	}
	var roundtrip statepusher.StateEvent
	if err := json.Unmarshal(calls[0].Data, &roundtrip); err != nil {
		t.Fatalf("nats payload not valid StateEvent JSON: %v", err)
	}
	if roundtrip.ID != "ev-1" {
		t.Fatalf("nats payload id = %q, want ev-1", roundtrip.ID)
	}
}

func TestNATSStatePusher_NATSMessage_ReachesLocalSubscriber(t *testing.T) {
	t.Parallel()
	pub := &fakeNATSPublisher{}
	sub := &fakeNATSSubscriber{}
	local := statepusher.NewStatePusher(newFakeClock(time.Now()), 16)
	p := statepusher.NewNATSStatePusher(pub, sub, local)

	streamID := uuid.New()
	ctx := context.Background()
	ch, cleanup, err := p.Subscribe(ctx, streamID, "")
	if err != nil {
		t.Fatalf("subscribe: %v", err)
	}
	defer cleanup()

	// Simulate an event arriving from another pod via NATS.
	remote := statepusher.StateEvent{ID: "remote-1", Kind: "state_change", State: "ended", At: time.Now()}
	data, _ := json.Marshal(remote)
	sub.push(statepusher.NATSMessage{Subject: statepusher.DefaultSubject(streamID), Data: data, Seq: 7})

	got := waitFor(t, ch, "remote-1")
	if got.State != "ended" {
		t.Fatalf("bridged event state = %q, want ended", got.State)
	}
}

func TestNATSStatePusher_Subscribe_LastEventID_UsesNATSStartSeq(t *testing.T) {
	t.Parallel()
	pub := &fakeNATSPublisher{}
	sub := &fakeNATSSubscriber{}
	local := statepusher.NewStatePusher(newFakeClock(time.Now()), 16)
	p := statepusher.NewNATSStatePusher(pub, sub, local)

	streamID := uuid.New()
	ctx := context.Background()

	// First subscriber: opens the bridge with no last id (live-only).
	ch1, cleanup1, err := p.Subscribe(ctx, streamID, "")
	if err != nil {
		t.Fatalf("subscribe 1: %v", err)
	}
	t.Cleanup(cleanup1)
	if got := sub.lastSub().StartSeq; got != 0 {
		t.Fatalf("first subscribe startSeq = %d, want 0 (live)", got)
	}

	// Push a remote event so the bridge advances its lastSeq tracking.
	remote := statepusher.StateEvent{ID: "remote-42", Kind: "state_change", State: "live", At: time.Now()}
	data, _ := json.Marshal(remote)
	sub.push(statepusher.NATSMessage{Subject: statepusher.DefaultSubject(streamID), Data: data, Seq: 42})
	waitFor(t, ch1, "remote-42")

	// Drop the first subscriber so the bridge tears down, then resubscribe
	// with a Last-Event-ID — the new bridge must request startSeq=42.
	cleanup1()

	// Allow bridge teardown to complete.
	time.Sleep(20 * time.Millisecond)

	_, cleanup2, err := p.Subscribe(ctx, streamID, "remote-42")
	if err != nil {
		t.Fatalf("subscribe 2: %v", err)
	}
	t.Cleanup(cleanup2)

	if got := sub.lastSub().StartSeq; got != 42 {
		t.Fatalf("second subscribe startSeq = %d, want 42", got)
	}
}

func TestNATSStatePusher_Publisher_Down_FallsBackToLocal(t *testing.T) {
	t.Parallel()
	pub := &fakeNATSPublisher{failWith: errors.New("nats: connection closed")}
	sub := &fakeNATSSubscriber{}
	local := statepusher.NewStatePusher(newFakeClock(time.Now()), 16)
	p := statepusher.NewNATSStatePusher(pub, sub, local)

	streamID := uuid.New()
	ctx := context.Background()
	ch, cleanup, err := p.Subscribe(ctx, streamID, "")
	if err != nil {
		t.Fatalf("subscribe: %v", err)
	}
	defer cleanup()

	ev := statepusher.StateEvent{ID: "ev-down-1", Kind: "state_change", State: "live", At: time.Now()}
	if err := p.Publish(ctx, streamID, ev); err != nil {
		t.Fatalf("publish should not fail when NATS is down, got: %v", err)
	}

	// Local subscriber must still receive the event.
	got := waitFor(t, ch, "ev-down-1")
	if got.State != "live" {
		t.Fatalf("local fallback state = %q, want live", got.State)
	}
}

func TestNATSStatePusher_DefaultSubject_MatchesRawDrivePrefix(t *testing.T) {
	t.Parallel()
	id := uuid.New()
	subj := statepusher.DefaultSubject(id)
	if !strings.HasPrefix(subj, "rawdrive.") {
		t.Fatalf("default subject %q must start with rawdrive. to match RAWDRIVE_EVENTS stream filter", subj)
	}
	if !strings.Contains(subj, id.String()) {
		t.Fatalf("default subject %q must include the stream id", subj)
	}
}
