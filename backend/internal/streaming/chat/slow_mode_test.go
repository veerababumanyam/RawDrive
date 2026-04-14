package chat

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestSlowModeGate_Allow_RespectsWindow(t *testing.T) {
	t.Parallel()
	clk := &fakeClock{now: time.Unix(1_700_000_000, 0)}
	g := NewInMemorySlowModeGate(clk)
	ctx := context.Background()
	streamID, sess := uuid.New(), uuid.New()

	allowed, retry, err := g.Allow(ctx, streamID, sess, 5)
	if err != nil || !allowed || retry != 0 {
		t.Fatalf("first Allow: got allowed=%v retry=%v err=%v", allowed, retry, err)
	}

	// Second call within 5s window should be denied.
	clk.now = clk.now.Add(2 * time.Second)
	allowed, retry, err = g.Allow(ctx, streamID, sess, 5)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if allowed {
		t.Fatalf("expected denial inside window")
	}
	if retry <= 0 || retry > 5*time.Second {
		t.Fatalf("unexpected retryAfter: %v", retry)
	}
}

func TestSlowModeGate_Allow_ExpiredWindow_AllowsNew(t *testing.T) {
	t.Parallel()
	clk := &fakeClock{now: time.Unix(1_700_000_000, 0)}
	g := NewInMemorySlowModeGate(clk)
	ctx := context.Background()
	streamID, sess := uuid.New(), uuid.New()

	if ok, _, _ := g.Allow(ctx, streamID, sess, 5); !ok {
		t.Fatalf("first Allow should succeed")
	}
	clk.now = clk.now.Add(6 * time.Second)
	ok, retry, err := g.Allow(ctx, streamID, sess, 5)
	if err != nil || !ok || retry != 0 {
		t.Fatalf("post-window Allow: ok=%v retry=%v err=%v", ok, retry, err)
	}
}

func TestSlowModeGate_Allow_ZeroWindow_AlwaysAllows(t *testing.T) {
	t.Parallel()
	clk := &fakeClock{now: time.Unix(1_700_000_000, 0)}
	g := NewInMemorySlowModeGate(clk)
	ctx := context.Background()
	streamID, sess := uuid.New(), uuid.New()

	for i := 0; i < 3; i++ {
		if ok, _, err := g.Allow(ctx, streamID, sess, 0); !ok || err != nil {
			t.Fatalf("zero window should always allow")
		}
	}
}

func TestReactionRateLimit_10PerSecond(t *testing.T) {
	t.Parallel()
	clk := &fakeClock{now: time.Unix(1_700_000_000, 0)}
	g := NewInMemorySlowModeGate(clk)
	ctx := context.Background()
	streamID, sess := uuid.New(), uuid.New()

	for i := 0; i < 10; i++ {
		ok, _, err := g.ReactionRateLimit(ctx, streamID, sess)
		if err != nil || !ok {
			t.Fatalf("call %d: expected allowed, got ok=%v err=%v", i, ok, err)
		}
	}
	ok, retry, err := g.ReactionRateLimit(ctx, streamID, sess)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if ok {
		t.Fatalf("11th call within 1s window should be denied")
	}
	if retry <= 0 || retry > time.Second {
		t.Fatalf("unexpected retryAfter: %v", retry)
	}

	// Advance past the 1s window — should allow again.
	clk.now = clk.now.Add(1100 * time.Millisecond)
	if ok, _, _ := g.ReactionRateLimit(ctx, streamID, sess); !ok {
		t.Fatalf("after window, should allow")
	}
}

type fakeClock struct{ now time.Time }

func (f *fakeClock) Now() time.Time { return f.now }
