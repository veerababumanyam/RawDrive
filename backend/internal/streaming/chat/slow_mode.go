// Package chat implements server-authoritative chat, reaction, and moderation
// logic for F-014 live streaming. HTTP wiring lives in ../handlers (Round 3).
package chat

import (
	"context"
	"sync"
	"time"

	"github.com/google/uuid"
)

// Clock is the minimal time source so tests can inject a deterministic clock.
type Clock interface {
	Now() time.Time
}

type systemClock struct{}

func (systemClock) Now() time.Time { return time.Now() }

// SlowModeGate enforces per-viewer posting windows and reaction rate limits.
// Implementations must be safe for concurrent use. The in-memory impl below
// is the test / single-process default; a Valkey-backed impl will replace it
// in Round 3 without changing the interface.
type SlowModeGate interface {
	// Allow returns (true, 0) if the viewer may post now; otherwise (false, retryAfter).
	// windowSeconds = 0 disables the window and always allows.
	Allow(ctx context.Context, streamID, viewerSessionID uuid.UUID, windowSeconds int) (bool, time.Duration, error)

	// ReactionRateLimit enforces 10 batches per second per (stream, viewer_session).
	ReactionRateLimit(ctx context.Context, streamID, viewerSessionID uuid.UUID) (bool, time.Duration, error)
}

const reactionWindowDuration = time.Second
const reactionWindowCap = 10

// InMemorySlowModeGate is a sync.Map-backed sliding-window gate suitable for
// unit tests and single-process dev. Keyed by (streamID, viewerSessionID).
type InMemorySlowModeGate struct {
	clock Clock

	// slowMode: key -> last-post time
	slowMode sync.Map // map[slowKey]time.Time

	// reactions: key -> bucket
	reactMu sync.Mutex
	react   map[slowKey]*reactBucket
}

type slowKey struct {
	stream, session uuid.UUID
}

type reactBucket struct {
	windowStart time.Time
	count       int
}

// NewInMemorySlowModeGate constructs an in-memory gate. Passing nil uses the real clock.
func NewInMemorySlowModeGate(clock Clock) *InMemorySlowModeGate {
	if clock == nil {
		clock = systemClock{}
	}
	return &InMemorySlowModeGate{
		clock: clock,
		react: make(map[slowKey]*reactBucket),
	}
}

// Allow implements SlowModeGate.
func (g *InMemorySlowModeGate) Allow(ctx context.Context, streamID, sess uuid.UUID, windowSeconds int) (bool, time.Duration, error) {
	if windowSeconds <= 0 {
		return true, 0, nil
	}
	now := g.clock.Now()
	k := slowKey{streamID, sess}
	window := time.Duration(windowSeconds) * time.Second

	if v, ok := g.slowMode.Load(k); ok {
		last := v.(time.Time)
		elapsed := now.Sub(last)
		if elapsed < window {
			return false, window - elapsed, nil
		}
	}
	g.slowMode.Store(k, now)
	return true, 0, nil
}

// ReactionRateLimit implements SlowModeGate.
func (g *InMemorySlowModeGate) ReactionRateLimit(ctx context.Context, streamID, sess uuid.UUID) (bool, time.Duration, error) {
	now := g.clock.Now()
	k := slowKey{streamID, sess}

	g.reactMu.Lock()
	defer g.reactMu.Unlock()

	b, ok := g.react[k]
	if !ok || now.Sub(b.windowStart) >= reactionWindowDuration {
		g.react[k] = &reactBucket{windowStart: now, count: 1}
		return true, 0, nil
	}
	if b.count >= reactionWindowCap {
		remaining := reactionWindowDuration - now.Sub(b.windowStart)
		if remaining <= 0 {
			remaining = time.Millisecond
		}
		return false, remaining, nil
	}
	b.count++
	return true, 0, nil
}
