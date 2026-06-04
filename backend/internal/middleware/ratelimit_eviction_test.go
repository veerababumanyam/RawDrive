package middleware

// CACHE-6 regression tests — the in-memory fallback rate limiter and the PIN
// verify limiter must evict expired keys so their maps cannot grow unbounded
// by distinct client cardinality.
//
// White-box (package middleware) so the tests can drive the unexported clock
// seam, sweep, and janitor directly with a fake clock — no wall-clock sleeps,
// fully deterministic.

import (
	"sync"
	"testing"
	"time"
)

// fakeClock is a manually-advanced clock for deterministic expiry tests.
type fakeClock struct {
	mu sync.Mutex
	t  time.Time
}

func newFakeClock() *fakeClock { return &fakeClock{t: time.Unix(1_700_000_000, 0)} }

func (c *fakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}

func (c *fakeClock) Advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.t = c.t.Add(d)
}

// ─────────────── inMemoryRateLimiter (RateLimitWithReset fallback) ───────────────

func TestInMemoryRateLimiter_SweepEvictsExpiredEntries(t *testing.T) {
	clk := newFakeClock()
	l := newInMemoryRateLimiter()
	l.now = clk.Now
	window := time.Minute

	// Simulate 1000 distinct IPs each making one request. Pre-fix, every key
	// stays in the map forever.
	for i := 0; i < 1000; i++ {
		ip := "203.0.113." + itoa(i)
		if !l.allow(ip, 5, window) {
			t.Fatalf("first request for %s should be allowed", ip)
		}
	}

	l.mu.Lock()
	got := len(l.entries)
	l.mu.Unlock()
	if got != 1000 {
		t.Fatalf("expected 1000 live entries before expiry, got %d", got)
	}

	// A sweep before expiry must NOT evict anything (windows still open).
	l.sweep()
	l.mu.Lock()
	got = len(l.entries)
	l.mu.Unlock()
	if got != 1000 {
		t.Fatalf("sweep before expiry must not evict; got %d, want 1000", got)
	}

	// Advance past the window; now every entry's window has elapsed.
	clk.Advance(window + time.Second)
	l.sweep()

	l.mu.Lock()
	got = len(l.entries)
	l.mu.Unlock()
	if got != 0 {
		t.Fatalf("sweep after expiry must drain the map back to baseline; got %d, want 0", got)
	}
}

func TestInMemoryRateLimiter_SweepKeepsActiveEntries(t *testing.T) {
	clk := newFakeClock()
	l := newInMemoryRateLimiter()
	l.now = clk.Now
	window := time.Minute

	l.allow("10.0.0.1", 5, window) // will go stale
	clk.Advance(window / 2)
	l.allow("10.0.0.2", 5, window) // still fresh after the advance below

	// Advance so .1's window has elapsed but .2's has not.
	clk.Advance(window/2 + time.Second)
	l.sweep()

	l.mu.Lock()
	_, hasStale := l.entries["10.0.0.1"]
	_, hasFresh := l.entries["10.0.0.2"]
	got := len(l.entries)
	l.mu.Unlock()

	if hasStale {
		t.Fatal("expired entry 10.0.0.1 should have been evicted")
	}
	if !hasFresh {
		t.Fatal("still-active entry 10.0.0.2 must be retained")
	}
	if got != 1 {
		t.Fatalf("expected exactly 1 surviving entry, got %d", got)
	}
}

func TestInMemoryRateLimiter_JanitorEvictsAndStops(t *testing.T) {
	clk := newFakeClock()
	l := newInMemoryRateLimiter()
	l.now = clk.Now
	window := time.Minute

	for i := 0; i < 50; i++ {
		l.allow("198.51.100."+itoa(i), 5, window)
	}
	clk.Advance(window + time.Second)

	// Run the janitor on a tight cadence and wait for it to drain the map.
	l.startJanitor(2 * time.Millisecond)
	deadline := time.Now().Add(2 * time.Second)
	for {
		l.mu.Lock()
		n := len(l.entries)
		l.mu.Unlock()
		if n == 0 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("janitor did not evict expired entries within deadline; %d remain", n)
		}
		time.Sleep(time.Millisecond)
	}

	// Stop must be idempotent and must not panic or leak.
	l.stop()
	l.stop()
}

func TestInMemoryRateLimiter_AllowSemanticsUnchanged(t *testing.T) {
	clk := newFakeClock()
	l := newInMemoryRateLimiter()
	l.now = clk.Now
	window := time.Minute

	for i := 0; i < 5; i++ {
		if !l.allow("192.0.2.1", 5, window) {
			t.Fatalf("attempt %d within budget must be allowed", i+1)
		}
	}
	if l.allow("192.0.2.1", 5, window) {
		t.Fatal("6th attempt over budget must be blocked")
	}

	// After the window elapses the same IP gets a fresh budget.
	clk.Advance(window + time.Second)
	if !l.allow("192.0.2.1", 5, window) {
		t.Fatal("request after window reset must be allowed")
	}
}

// ────────────────────────── memoryLimiter (PIN limiter) ──────────────────────────

func TestPINMemoryLimiter_SweepEvictsExpiredKeys(t *testing.T) {
	clk := newFakeClock()
	m := &memoryLimiter{
		hits:        make(map[string][]time.Time),
		max:         5,
		window:      5 * time.Minute,
		now:         clk.Now,
		stopJanitor: make(chan struct{}),
	}

	for i := 0; i < 500; i++ {
		ip := "203.0.113." + itoa(i)
		if allowed, _ := m.Allow(ip, "stream-x"); !allowed {
			t.Fatalf("first attempt for %s should be allowed", ip)
		}
	}

	m.mu.Lock()
	got := len(m.hits)
	m.mu.Unlock()
	if got != 500 {
		t.Fatalf("expected 500 keys before expiry, got %d", got)
	}

	// Sweep before expiry: nothing evicted.
	m.sweep()
	m.mu.Lock()
	got = len(m.hits)
	m.mu.Unlock()
	if got != 500 {
		t.Fatalf("sweep before expiry must not evict; got %d, want 500", got)
	}

	// Advance past the window and sweep: map drains to baseline.
	clk.Advance(5*time.Minute + time.Second)
	m.sweep()

	m.mu.Lock()
	got = len(m.hits)
	m.mu.Unlock()
	if got != 0 {
		t.Fatalf("sweep after expiry must drain PIN map to baseline; got %d, want 0", got)
	}
}

func TestPINMemoryLimiter_SweepKeepsActiveKeys(t *testing.T) {
	clk := newFakeClock()
	m := &memoryLimiter{
		hits:        make(map[string][]time.Time),
		max:         5,
		window:      5 * time.Minute,
		now:         clk.Now,
		stopJanitor: make(chan struct{}),
	}

	m.Allow("10.0.0.1", "s1") // becomes stale
	clk.Advance(3 * time.Minute)
	m.Allow("10.0.0.2", "s2") // fresh

	clk.Advance(3 * time.Minute) // .1 now 6m old (>5m), .2 only 3m old
	m.sweep()

	m.mu.Lock()
	_, hasStale := m.hits["10.0.0.1:s1"]
	_, hasFresh := m.hits["10.0.0.2:s2"]
	got := len(m.hits)
	m.mu.Unlock()

	if hasStale {
		t.Fatal("expired PIN key 10.0.0.1:s1 should have been evicted")
	}
	if !hasFresh {
		t.Fatal("still-active PIN key 10.0.0.2:s2 must be retained")
	}
	if got != 1 {
		t.Fatalf("expected exactly 1 surviving PIN key, got %d", got)
	}
}

func TestPINMemoryLimiter_JanitorEvictsAndStops(t *testing.T) {
	clk := newFakeClock()
	m := &memoryLimiter{
		hits:        make(map[string][]time.Time),
		max:         5,
		window:      5 * time.Minute,
		now:         clk.Now,
		stopJanitor: make(chan struct{}),
	}

	for i := 0; i < 50; i++ {
		m.Allow("198.51.100."+itoa(i), "s")
	}
	clk.Advance(5*time.Minute + time.Second)

	m.startJanitor(2 * time.Millisecond)
	deadline := time.Now().Add(2 * time.Second)
	for {
		m.mu.Lock()
		n := len(m.hits)
		m.mu.Unlock()
		if n == 0 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("PIN janitor did not evict expired keys within deadline; %d remain", n)
		}
		time.Sleep(time.Millisecond)
	}

	m.Stop()
	m.Stop() // idempotent
}

// itoa is a tiny allocation-free base-10 helper so the test file has no extra
// imports beyond the standard library already used by the package tests.
func itoa(i int) string {
	if i == 0 {
		return "0"
	}
	var buf [12]byte
	pos := len(buf)
	for i > 0 {
		pos--
		buf[pos] = byte('0' + i%10)
		i /= 10
	}
	return string(buf[pos:])
}
