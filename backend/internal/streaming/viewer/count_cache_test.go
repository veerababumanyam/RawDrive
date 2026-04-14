package viewer

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
)

// fakePresenceSource records calls and returns a configurable count.
type fakePresenceSource struct {
	mu    sync.Mutex
	calls int64
	// current is returned as LiveViewerMetrics.Current. Peak/Unique set to
	// sentinel values so tests can assert they are never leaked.
	current int
	peak    int
	unique  int
	err     error
}

func (f *fakePresenceSource) GetViewerMetrics(_ context.Context, _ uuid.UUID) (*LiveViewerMetricsShim, error) {
	atomic.AddInt64(&f.calls, 1)
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.err != nil {
		return nil, f.err
	}
	return &LiveViewerMetricsShim{Current: f.current, Peak: f.peak, Unique: f.unique}, nil
}

func (f *fakePresenceSource) Calls() int64 { return atomic.LoadInt64(&f.calls) }

func TestViewerCountCache_GetCurrent_ReturnsCoalesced(t *testing.T) {
	src := &fakePresenceSource{current: 42, peak: 999, unique: 777}
	now := time.Date(2026, 4, 14, 12, 0, 0, 0, time.UTC)
	clock := &manualClock{t: now}

	c := NewViewerCountCache(src, 5*time.Second, clock.Now)
	streamID := uuid.New()

	for i := 0; i < 5; i++ {
		got, err := c.GetCurrent(context.Background(), streamID)
		if err != nil {
			t.Fatalf("GetCurrent #%d: %v", i, err)
		}
		if got.Current != 42 {
			t.Fatalf("want current=42 got=%d", got.Current)
		}
	}
	if got := src.Calls(); got != 1 {
		t.Fatalf("want coalesced to 1 upstream call, got %d", got)
	}
}

func TestViewerCountCache_ExcludesPeakAndUnique_FromPublicView(t *testing.T) {
	// Compile-time whitelist: PublicViewerCount must expose only {Current, AsOf}.
	// Any future struct drift that adds Peak/Unique will break this assignment.
	var p PublicViewerCount
	p.Current = 1
	p.AsOf = time.Now()
	_ = p

	src := &fakePresenceSource{current: 3, peak: 500, unique: 250}
	clock := &manualClock{t: time.Unix(1700000000, 0).UTC()}
	c := NewViewerCountCache(src, 5*time.Second, clock.Now)

	got, err := c.GetCurrent(context.Background(), uuid.New())
	if err != nil {
		t.Fatal(err)
	}
	if got.Current != 3 {
		t.Fatalf("want current=3 got=%d", got.Current)
	}
	if !got.AsOf.Equal(clock.t) {
		t.Fatalf("want as_of=%v got=%v", clock.t, got.AsOf)
	}
}

func TestViewerCountCache_StaleAfter_5s_Refetches(t *testing.T) {
	src := &fakePresenceSource{current: 10}
	clock := &manualClock{t: time.Unix(1700000000, 0).UTC()}
	c := NewViewerCountCache(src, 5*time.Second, clock.Now)

	streamID := uuid.New()

	if _, err := c.GetCurrent(context.Background(), streamID); err != nil {
		t.Fatal(err)
	}
	if src.Calls() != 1 {
		t.Fatalf("want 1 call, got %d", src.Calls())
	}

	// Advance past TTL.
	clock.Advance(6 * time.Second)
	src.mu.Lock()
	src.current = 20
	src.mu.Unlock()

	got, err := c.GetCurrent(context.Background(), streamID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Current != 20 {
		t.Fatalf("want refreshed current=20 got=%d", got.Current)
	}
	if src.Calls() != 2 {
		t.Fatalf("want 2 calls after TTL expiry, got %d", src.Calls())
	}
}

func TestViewerCountCache_UpstreamError_NotCached(t *testing.T) {
	src := &fakePresenceSource{err: errors.New("boom")}
	clock := &manualClock{t: time.Unix(1700000000, 0).UTC()}
	c := NewViewerCountCache(src, 5*time.Second, clock.Now)

	if _, err := c.GetCurrent(context.Background(), uuid.New()); err == nil {
		t.Fatal("expected error")
	}
	if _, err := c.GetCurrent(context.Background(), uuid.New()); err == nil {
		t.Fatal("expected error on 2nd call (errors must not be cached)")
	}
	if src.Calls() != 2 {
		t.Fatalf("want 2 upstream calls (errors not cached), got %d", src.Calls())
	}
}

type manualClock struct {
	mu sync.Mutex
	t  time.Time
}

func (c *manualClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}

func (c *manualClock) Advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.t = c.t.Add(d)
}
