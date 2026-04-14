package chat

// slow_mode_valkey.go — Valkey-backed SlowModeGate implementation.
//
// The InMemorySlowModeGate is fine for tests and single-process dev, but
// it has two production-fatal properties:
//
//   1. State is per-process, so a server restart (or a multi-replica
//      deployment) lets a viewer who just posted re-post immediately
//      from a different node — the slow-mode promise is broken.
//   2. There's no way for an operator to inspect or clear slow-mode
//      state without restarting.
//
// The Valkey impl uses the simplest correct primitive: SET NX EX.
//
//   - On Allow, we attempt SET NX EX <key> "1" <window>. NX = only set
//     if the key doesn't exist; EX = TTL. If we got the lock, the
//     viewer is allowed and the key auto-expires when the window
//     elapses. If we didn't, we PTTL the key to compute Retry-After.
//
//   - On ReactionRateLimit, the same primitive with a 100ms window
//     gives an effective ceiling of ~10 batches/sec/session — the same
//     contract the in-memory bucket enforces, but server-authoritative
//     and durable across restarts.
//
// This is deliberately not a sliding window — for the slow-mode UX
// (one post every N seconds) a fixed-window lock is exactly what the
// product requires and avoids the Lua-script complexity of the sliding
// limiter in middleware/valkey_client.go. If we ever need true
// sliding semantics here, the interface lets us swap impls without
// touching call sites.

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// ValkeyClient is the narrow SET NX EX surface this gate needs. It is
// intentionally separate from middleware.ValkeyClient (sliding-window)
// so the two evolve independently and so tests can fake just these
// two methods without dragging in Lua-script semantics.
type ValkeyClient interface {
	// SetNX attempts to set key=value with the given TTL only if the
	// key does not already exist. Returns true if the set happened
	// (i.e. caller "won the lock"), false if the key was already set.
	SetNX(ctx context.Context, key string, value string, ttl time.Duration) (bool, error)
	// PTTL returns the remaining TTL of key with millisecond
	// resolution. Returns (0, nil) if the key has no TTL or does not
	// exist — callers should treat that as "expired, retry now".
	PTTL(ctx context.Context, key string) (time.Duration, error)
}

// reactionWindowValkey is the per-session reaction lock TTL. 100ms gives
// an effective cap of ~10 batches/sec, matching reactionWindowCap in
// the in-memory impl (10 in 1s).
const reactionWindowValkey = 100 * time.Millisecond

// ValkeySlowModeGate is the production SlowModeGate. It satisfies the
// SlowModeGate interface defined in slow_mode.go.
type ValkeySlowModeGate struct {
	Client ValkeyClient
	Clock  func() time.Time
}

// NewValkeySlowModeGate constructs a Valkey-backed gate. Passing nil
// for clock uses time.Now.
func NewValkeySlowModeGate(client ValkeyClient, clock func() time.Time) *ValkeySlowModeGate {
	if clock == nil {
		clock = time.Now
	}
	return &ValkeySlowModeGate{Client: client, Clock: clock}
}

func slowKeyFor(streamID, sessID uuid.UUID) string {
	return fmt.Sprintf("chat:slow:%s:%s", streamID, sessID)
}

func reactKeyFor(streamID, sessID uuid.UUID) string {
	return fmt.Sprintf("chat:react:%s:%s", streamID, sessID)
}

// Allow implements SlowModeGate. windowSeconds <= 0 disables the gate.
func (g *ValkeySlowModeGate) Allow(ctx context.Context, streamID, sessID uuid.UUID, windowSeconds int) (bool, time.Duration, error) {
	if windowSeconds <= 0 {
		return true, 0, nil
	}
	window := time.Duration(windowSeconds) * time.Second
	key := slowKeyFor(streamID, sessID)

	ok, err := g.Client.SetNX(ctx, key, "1", window)
	if err != nil {
		return false, 0, fmt.Errorf("slow-mode SETNX: %w", err)
	}
	if ok {
		return true, 0, nil
	}
	// Lost the race — compute Retry-After from the TTL of the
	// existing key. If PTTL fails or returns zero, fall back to the
	// full window so we never under-report.
	ttl, err := g.Client.PTTL(ctx, key)
	if err != nil {
		return false, window, fmt.Errorf("slow-mode PTTL: %w", err)
	}
	if ttl <= 0 {
		// Key expired between SETNX and PTTL — race-tolerant: just
		// tell the caller to try again immediately.
		return false, time.Millisecond, nil
	}
	return false, ttl, nil
}

// ReactionRateLimit implements SlowModeGate via a 100ms NX lock.
func (g *ValkeySlowModeGate) ReactionRateLimit(ctx context.Context, streamID, sessID uuid.UUID) (bool, time.Duration, error) {
	key := reactKeyFor(streamID, sessID)
	ok, err := g.Client.SetNX(ctx, key, "1", reactionWindowValkey)
	if err != nil {
		return false, 0, fmt.Errorf("reaction SETNX: %w", err)
	}
	if ok {
		return true, 0, nil
	}
	ttl, err := g.Client.PTTL(ctx, key)
	if err != nil {
		return false, reactionWindowValkey, fmt.Errorf("reaction PTTL: %w", err)
	}
	if ttl <= 0 {
		return false, time.Millisecond, nil
	}
	return false, ttl, nil
}

// compile-time interface check.
var _ SlowModeGate = (*ValkeySlowModeGate)(nil)
