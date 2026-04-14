package chat

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
)

// fakeValkey is an in-process stand-in for the SET NX EX surface. We
// don't model wall-clock TTL expiry — tests advance state explicitly
// by calling expire() so the assertions stay deterministic.
type fakeValkey struct {
	mu       sync.Mutex
	keys     map[string]time.Time // key -> expires-at (in fake clock)
	now      func() time.Time
	setNXErr error
	pttlErr  error
}

func newFakeValkey(now func() time.Time) *fakeValkey {
	return &fakeValkey{keys: map[string]time.Time{}, now: now}
}

func (f *fakeValkey) SetNX(_ context.Context, key, _ string, ttl time.Duration) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.setNXErr != nil {
		return false, f.setNXErr
	}
	if exp, ok := f.keys[key]; ok && exp.After(f.now()) {
		return false, nil
	}
	f.keys[key] = f.now().Add(ttl)
	return true, nil
}

func (f *fakeValkey) PTTL(_ context.Context, key string) (time.Duration, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.pttlErr != nil {
		return 0, f.pttlErr
	}
	exp, ok := f.keys[key]
	if !ok {
		return 0, nil
	}
	rem := exp.Sub(f.now())
	if rem <= 0 {
		return 0, nil
	}
	return rem, nil
}

func TestValkeyGate_Allow_WithinWindow_Blocks(t *testing.T) {
	now := time.Date(2026, 4, 14, 10, 0, 0, 0, time.UTC)
	clock := &now
	fake := newFakeValkey(func() time.Time { return *clock })
	gate := NewValkeySlowModeGate(fake, func() time.Time { return *clock })

	stream, sess := uuid.New(), uuid.New()

	ok, retry, err := gate.Allow(context.Background(), stream, sess, 5)
	if err != nil || !ok || retry != 0 {
		t.Fatalf("first Allow: ok=%v retry=%v err=%v", ok, retry, err)
	}

	// Advance 2s — still within the 5s window.
	*clock = clock.Add(2 * time.Second)
	ok, retry, err = gate.Allow(context.Background(), stream, sess, 5)
	if err != nil {
		t.Fatalf("second Allow err: %v", err)
	}
	if ok {
		t.Fatalf("expected block within window, got allow")
	}
	if retry <= 0 || retry > 5*time.Second {
		t.Fatalf("retry-after out of range: %v", retry)
	}
}

func TestValkeyGate_Allow_AfterWindow_Allows(t *testing.T) {
	now := time.Date(2026, 4, 14, 10, 0, 0, 0, time.UTC)
	clock := &now
	fake := newFakeValkey(func() time.Time { return *clock })
	gate := NewValkeySlowModeGate(fake, func() time.Time { return *clock })

	stream, sess := uuid.New(), uuid.New()

	if ok, _, err := gate.Allow(context.Background(), stream, sess, 5); err != nil || !ok {
		t.Fatalf("first Allow failed: ok=%v err=%v", ok, err)
	}
	// Advance past the window — fake "expires" the key.
	*clock = clock.Add(6 * time.Second)
	ok, retry, err := gate.Allow(context.Background(), stream, sess, 5)
	if err != nil || !ok || retry != 0 {
		t.Fatalf("post-window Allow: ok=%v retry=%v err=%v", ok, retry, err)
	}
}

func TestValkeyGate_Allow_ZeroWindow_AlwaysAllows(t *testing.T) {
	fake := newFakeValkey(time.Now)
	gate := NewValkeySlowModeGate(fake, time.Now)
	ok, retry, err := gate.Allow(context.Background(), uuid.New(), uuid.New(), 0)
	if err != nil || !ok || retry != 0 {
		t.Fatalf("zero-window: ok=%v retry=%v err=%v", ok, retry, err)
	}
}

func TestValkeyGate_ReactionAllow_RateLimits(t *testing.T) {
	now := time.Date(2026, 4, 14, 10, 0, 0, 0, time.UTC)
	clock := &now
	fake := newFakeValkey(func() time.Time { return *clock })
	gate := NewValkeySlowModeGate(fake, func() time.Time { return *clock })

	stream, sess := uuid.New(), uuid.New()

	ok, _, err := gate.ReactionRateLimit(context.Background(), stream, sess)
	if err != nil || !ok {
		t.Fatalf("first reaction: ok=%v err=%v", ok, err)
	}

	// Within 100ms — should be blocked.
	*clock = clock.Add(20 * time.Millisecond)
	ok, retry, err := gate.ReactionRateLimit(context.Background(), stream, sess)
	if err != nil {
		t.Fatalf("second reaction err: %v", err)
	}
	if ok {
		t.Fatalf("expected reaction block within 100ms")
	}
	if retry <= 0 || retry > reactionWindowValkey {
		t.Fatalf("reaction retry-after out of range: %v", retry)
	}

	// After 100ms — allowed again.
	*clock = clock.Add(150 * time.Millisecond)
	ok, _, err = gate.ReactionRateLimit(context.Background(), stream, sess)
	if err != nil || !ok {
		t.Fatalf("post-window reaction: ok=%v err=%v", ok, err)
	}
}

func TestValkeyGate_ClientError_ReturnsError(t *testing.T) {
	fake := newFakeValkey(time.Now)
	fake.setNXErr = errors.New("valkey down")
	gate := NewValkeySlowModeGate(fake, time.Now)

	if _, _, err := gate.Allow(context.Background(), uuid.New(), uuid.New(), 5); err == nil {
		t.Fatalf("expected SETNX error to propagate")
	}
	if _, _, err := gate.ReactionRateLimit(context.Background(), uuid.New(), uuid.New()); err == nil {
		t.Fatalf("expected SETNX error to propagate from ReactionRateLimit")
	}

	// PTTL error path: SET succeeds first to populate key, then a
	// second SET-collision triggers PTTL which we force to fail.
	fake2 := newFakeValkey(time.Now)
	gate2 := NewValkeySlowModeGate(fake2, time.Now)
	stream, sess := uuid.New(), uuid.New()
	if _, _, err := gate2.Allow(context.Background(), stream, sess, 5); err != nil {
		t.Fatalf("seed Allow: %v", err)
	}
	fake2.pttlErr = errors.New("pttl boom")
	if _, _, err := gate2.Allow(context.Background(), stream, sess, 5); err == nil {
		t.Fatalf("expected PTTL error to propagate")
	}
}
