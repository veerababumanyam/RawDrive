package statepusher_test

import (
	"context"
	"encoding/json"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/streaming/statepusher"
)

// fakeClock is a manually advanced clock for heartbeat tests.
type fakeClock struct {
	mu      sync.Mutex
	now     time.Time
	tickers []*fakeTicker
}

type fakeTicker struct {
	c        chan time.Time
	d        time.Duration
	last     time.Time
	stopped  bool
	parent   *fakeClock
}

func newFakeClock(start time.Time) *fakeClock { return &fakeClock{now: start} }

func (f *fakeClock) Now() time.Time {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.now
}

func (f *fakeClock) NewTicker(d time.Duration) statepusher.Ticker {
	f.mu.Lock()
	defer f.mu.Unlock()
	t := &fakeTicker{c: make(chan time.Time, 8), d: d, last: f.now, parent: f}
	f.tickers = append(f.tickers, t)
	return t
}

func (t *fakeTicker) C() <-chan time.Time { return t.c }
func (t *fakeTicker) Stop() {
	t.parent.mu.Lock()
	defer t.parent.mu.Unlock()
	t.stopped = true
}

func (f *fakeClock) Advance(d time.Duration) {
	f.mu.Lock()
	f.now = f.now.Add(d)
	now := f.now
	tickers := append([]*fakeTicker(nil), f.tickers...)
	f.mu.Unlock()
	for _, t := range tickers {
		f.mu.Lock()
		stopped := t.stopped
		f.mu.Unlock()
		if stopped {
			continue
		}
		for now.Sub(t.last) >= t.d {
			t.last = t.last.Add(t.d)
			select {
			case t.c <- t.last:
			default:
			}
		}
	}
}

func newEvent(id, state string) statepusher.StateEvent {
	return statepusher.StateEvent{
		ID:      id,
		Kind:    "state_change",
		State:   state,
		At:      time.Unix(0, 0).UTC(),
		Payload: json.RawMessage(`{}`),
	}
}

func TestStatePusher_Subscribe_ReceivesStateEvent(t *testing.T) {
	t.Parallel()
	clk := newFakeClock(time.Unix(0, 0).UTC())
	p := statepusher.NewStatePusher(clk, 64)
	streamID := uuid.New()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	ch, unsub, err := p.Subscribe(ctx, streamID, "")
	if err != nil {
		t.Fatalf("subscribe: %v", err)
	}
	defer unsub()

	ev := newEvent("01", "live")
	if err := p.Publish(ctx, streamID, ev); err != nil {
		t.Fatalf("publish: %v", err)
	}

	select {
	case got := <-ch:
		if got.ID != "01" || got.State != "live" {
			t.Fatalf("unexpected event: %+v", got)
		}
	case <-time.After(time.Second):
		t.Fatal("timeout waiting for event")
	}
}

func TestStatePusher_Subscribe_LastEventID_Replays(t *testing.T) {
	t.Parallel()
	clk := newFakeClock(time.Unix(0, 0).UTC())
	p := statepusher.NewStatePusher(clk, 64)
	streamID := uuid.New()

	ctx := context.Background()
	// Publish 3 events before any subscriber exists.
	for _, id := range []string{"01", "02", "03"} {
		if err := p.Publish(ctx, streamID, newEvent(id, "live")); err != nil {
			t.Fatalf("publish %s: %v", id, err)
		}
	}

	subCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	ch, unsub, err := p.Subscribe(subCtx, streamID, "01")
	if err != nil {
		t.Fatalf("subscribe: %v", err)
	}
	defer unsub()

	var ids []string
	timeout := time.After(time.Second)
	for len(ids) < 2 {
		select {
		case e := <-ch:
			ids = append(ids, e.ID)
		case <-timeout:
			t.Fatalf("timeout; got %v", ids)
		}
	}
	if ids[0] != "02" || ids[1] != "03" {
		t.Fatalf("expected replay [02 03], got %v", ids)
	}
}

func TestStatePusher_Subscribe_HeartbeatEvery15s(t *testing.T) {
	t.Parallel()
	clk := newFakeClock(time.Unix(0, 0).UTC())
	p := statepusher.NewStatePusher(clk, 64)
	streamID := uuid.New()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch, unsub, err := p.Subscribe(ctx, streamID, "")
	if err != nil {
		t.Fatalf("subscribe: %v", err)
	}
	defer unsub()

	// Give subscriber goroutine a moment to register ticker.
	time.Sleep(20 * time.Millisecond)

	clk.Advance(15 * time.Second)

	select {
	case ev := <-ch:
		if ev.Kind != "heartbeat" {
			t.Fatalf("expected heartbeat, got kind=%q", ev.Kind)
		}
	case <-time.After(time.Second):
		t.Fatal("timeout waiting for heartbeat")
	}
}

func TestStatePusher_Unsubscribe_Cleanup(t *testing.T) {
	t.Parallel()
	clk := newFakeClock(time.Unix(0, 0).UTC())
	p := statepusher.NewStatePusher(clk, 64)
	streamID := uuid.New()

	ctx, cancel := context.WithCancel(context.Background())
	ch, unsub, err := p.Subscribe(ctx, streamID, "")
	if err != nil {
		t.Fatalf("subscribe: %v", err)
	}
	_ = ch

	cancel()
	unsub()

	// After cleanup, SubscriberCount should be 0 for this stream.
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if p.SubscriberCount(streamID) == 0 {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("expected 0 subscribers, got %d", p.SubscriberCount(streamID))
}

func TestStatePusher_MultipleSubscribers_Fanout(t *testing.T) {
	t.Parallel()
	clk := newFakeClock(time.Unix(0, 0).UTC())
	p := statepusher.NewStatePusher(clk, 64)
	streamID := uuid.New()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	ch1, unsub1, err := p.Subscribe(ctx, streamID, "")
	if err != nil {
		t.Fatalf("sub1: %v", err)
	}
	defer unsub1()
	ch2, unsub2, err := p.Subscribe(ctx, streamID, "")
	if err != nil {
		t.Fatalf("sub2: %v", err)
	}
	defer unsub2()

	if err := p.Publish(ctx, streamID, newEvent("01", "live")); err != nil {
		t.Fatalf("publish: %v", err)
	}

	var got1, got2 atomic.Int32
	var wg sync.WaitGroup
	wg.Add(2)
	consume := func(ch <-chan statepusher.StateEvent, counter *atomic.Int32) {
		defer wg.Done()
		deadline := time.After(time.Second)
		for {
			select {
			case ev := <-ch:
				if ev.Kind == "state_change" && ev.ID == "01" {
					counter.Add(1)
					return
				}
			case <-deadline:
				return
			}
		}
	}
	go consume(ch1, &got1)
	go consume(ch2, &got2)
	wg.Wait()

	if got1.Load() != 1 || got2.Load() != 1 {
		t.Fatalf("fanout failed: got1=%d got2=%d", got1.Load(), got2.Load())
	}
}

func TestStatePusher_Publish_SerializesToStateEvent(t *testing.T) {
	t.Parallel()
	clk := newFakeClock(time.Unix(0, 0).UTC())
	p := statepusher.NewStatePusher(clk, 64)
	streamID := uuid.New()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch, unsub, err := p.Subscribe(ctx, streamID, "")
	if err != nil {
		t.Fatalf("subscribe: %v", err)
	}
	defer unsub()

	ev := statepusher.StateEvent{
		ID:      "abc",
		Kind:    "state_change",
		State:   "waiting",
		At:      time.Unix(1700000000, 0).UTC(),
		Payload: json.RawMessage(`{"foo":"bar"}`),
	}
	if err := p.Publish(ctx, streamID, ev); err != nil {
		t.Fatalf("publish: %v", err)
	}

	select {
	case got := <-ch:
		b, err := json.Marshal(got)
		if err != nil {
			t.Fatalf("marshal: %v", err)
		}
		var m map[string]any
		if err := json.Unmarshal(b, &m); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		for _, key := range []string{"id", "kind", "state", "at", "payload"} {
			if _, ok := m[key]; !ok {
				t.Errorf("missing key %q in serialized StateEvent: %s", key, string(b))
			}
		}
	case <-time.After(time.Second):
		t.Fatal("timeout")
	}
}
