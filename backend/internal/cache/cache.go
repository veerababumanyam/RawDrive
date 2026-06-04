// Package cache provides a single, typed, namespaced in-process TTL cache with
// hit/miss metrics and an optional JSON-serializing remote backend.
//
// It exists to replace the per-package bespoke `map[string]…` + `sync.RWMutex`
// + per-entry expiry caches that have accreted across the backend (rbac role
// projections, upload policy validity, …). Those all reimplement the same
// read-through-with-TTL pattern slightly differently. Consolidating them onto
// one audited primitive removes that drift and gives a single place to add
// metrics and (in a future PR) a shared Valkey backend.
//
// Design constraints (RawDrive laws):
//   - Pure standard library + existing deps. No new third-party dependencies.
//     Metrics are internal atomic counters, NOT prometheus — a separate PR owns
//     the prometheus wiring.
//   - Thread-safe: an RWMutex guards the in-proc store (read-fast-path on Get)
//     and atomic counters track hits/misses. Safe under the race detector.
//   - Errors are returned, never panicked, in any caller-facing path.
//   - Namespaced: every key is internally prefixed with the cache's namespace so
//     two caches that might later share a backend (Valkey) can never collide.
//
// Concrete remote backends (e.g. Valkey) are intentionally NOT implemented here.
// This package defines only the Backend interface and the in-proc fallback path;
// a future PR wires the real Valkey backend behind the same interface.
package cache

import (
	"context"
	"encoding/json"
	"sync"
	"sync/atomic"
	"time"
)

// Backend is an optional remote store (e.g. Valkey) that a Cache can read
// through. Values cross the backend boundary as JSON-encoded bytes. A Backend
// is best-effort: a Cache NEVER fails a caller because the backend is down or
// errored — it transparently falls back to its in-proc TTL store. Implementations
// must therefore surface "absent" as (nil, false, nil) rather than an error.
type Backend interface {
	// GetJSON returns the raw JSON bytes stored at key. The second result is
	// false when the key is absent (a clean miss, not an error).
	GetJSON(ctx context.Context, key string) ([]byte, bool, error)
	// SetJSON stores the raw JSON bytes at key with the given TTL. A non-positive
	// ttl means "no expiry"; backends should honor that or treat it as their
	// longest-lived write.
	SetJSON(ctx context.Context, key string, data []byte, ttl time.Duration) error
}

// entry is a single in-proc cached value plus its absolute expiry.
type entry[V any] struct {
	value     V
	expiresAt time.Time
}

// Cache is a typed, namespaced, in-process TTL cache with hit/miss metrics and
// an optional read-through JSON backend. The zero value is not usable — build
// one with New.
//
// A Cache is safe for concurrent use by multiple goroutines.
type Cache[V any] struct {
	namespace  string
	defaultTTL time.Duration
	backend    Backend // optional; nil ⇒ pure in-proc

	mu    sync.RWMutex
	store map[string]entry[V]

	hits   atomic.Uint64
	misses atomic.Uint64
}

// Option configures a Cache at construction time.
type Option[V any] func(*Cache[V])

// WithBackend attaches an optional remote backend that the Cache reads/writes
// through as JSON. On any backend miss or error the Cache falls back to its
// in-proc TTL store, so attaching a backend never makes the cache less
// available than pure in-proc. Passing a nil backend is a no-op (stays in-proc).
func WithBackend[V any](b Backend) Option[V] {
	return func(c *Cache[V]) {
		if b != nil {
			c.backend = b
		}
	}
}

// New constructs a Cache for values of type V under the given namespace, using
// defaultTTL for Set / GetOrLoad / SetJSON writes that do not specify their own
// TTL. With no options it is a pure in-process cache; pass WithBackend to read
// through to a remote store.
func New[V any](namespace string, defaultTTL time.Duration, opts ...Option[V]) *Cache[V] {
	c := &Cache[V]{
		namespace:  namespace,
		defaultTTL: defaultTTL,
		store:      make(map[string]entry[V]),
	}
	for _, opt := range opts {
		opt(c)
	}
	return c
}

// nsKey returns the internal, namespace-prefixed storage key for a caller key.
// Distinct caches namespace their keys so a future shared backend never
// collides entries from different caches.
func (c *Cache[V]) nsKey(key string) string {
	return c.namespace + ":" + key
}

// getInProc returns the live (unexpired) in-proc value for key, if any. It does
// NOT touch the hit/miss counters — callers record those so a backend hit isn't
// double-counted.
func (c *Cache[V]) getInProc(key string) (V, bool) {
	c.mu.RLock()
	e, ok := c.store[key]
	c.mu.RUnlock()
	if !ok {
		var zero V
		return zero, false
	}
	// TTL boundary: an entry stored at T with ttl D is valid while now < expiresAt,
	// matching the bespoke rbac / upload-policy caches this package replaces.
	if !time.Now().Before(e.expiresAt) {
		var zero V
		return zero, false
	}
	return e.value, true
}

// setInProc stores a value in the in-proc store with an explicit TTL.
func (c *Cache[V]) setInProc(key string, v V, ttl time.Duration) {
	c.mu.Lock()
	c.store[key] = entry[V]{value: v, expiresAt: time.Now().Add(ttl)}
	c.mu.Unlock()
}

// Get returns the value for key if present and not expired, recording a hit;
// otherwise it records a miss and returns the zero value with ok=false. Expired
// entries are treated as a miss. This is the pure in-proc read path; use GetJSON
// to also consult a configured backend.
func (c *Cache[V]) Get(key string) (V, bool) {
	v, ok := c.getInProc(c.nsKey(key))
	if ok {
		c.hits.Add(1)
		return v, true
	}
	c.misses.Add(1)
	var zero V
	return zero, false
}

// Set stores v under key with the cache's defaultTTL.
func (c *Cache[V]) Set(key string, v V) {
	c.setInProc(c.nsKey(key), v, c.defaultTTL)
}

// SetTTL stores v under key with an explicit per-entry TTL, overriding
// defaultTTL for this entry only.
func (c *Cache[V]) SetTTL(key string, v V, ttl time.Duration) {
	c.setInProc(c.nsKey(key), v, ttl)
}

// Delete removes key from the in-proc store. It is the invalidation primitive
// that keeps a read-through cache coherent when the source of truth changes
// (e.g. an RBAC role reassignment, a revoked upload policy version). Deleting an
// absent key is a no-op.
func (c *Cache[V]) Delete(key string) {
	nsk := c.nsKey(key)
	c.mu.Lock()
	delete(c.store, nsk)
	c.mu.Unlock()
}

// GetOrLoad is the read-through helper: on a cache hit it returns the cached
// value; on a miss it calls loader, stores the result under defaultTTL, and
// returns it. Loader errors are propagated and NOT cached, so a transient
// upstream failure does not poison the cache. Get/miss are recorded on the
// counters.
func (c *Cache[V]) GetOrLoad(ctx context.Context, key string, loader func(context.Context) (V, error)) (V, error) {
	if v, ok := c.Get(key); ok {
		return v, nil
	}
	v, err := loader(ctx)
	if err != nil {
		var zero V
		return zero, err
	}
	c.Set(key, v)
	return v, nil
}

// GetJSON reads key through the configured backend (decoding JSON into V) and,
// on any backend miss or error, falls back to the in-proc TTL store. On a
// backend hit the value is also populated into the in-proc store so subsequent
// reads are local. When no backend is configured this is equivalent to Get.
// Hit/miss counters reflect whether ANY tier (backend or in-proc) served the
// value.
func (c *Cache[V]) GetJSON(ctx context.Context, key string) (V, bool) {
	nsk := c.nsKey(key)

	if c.backend != nil {
		data, ok, err := c.backend.GetJSON(ctx, nsk)
		if err == nil && ok {
			var v V
			if jsonErr := json.Unmarshal(data, &v); jsonErr == nil {
				// Backend hit: warm the in-proc tier so the next read is local.
				c.setInProc(nsk, v, c.defaultTTL)
				c.hits.Add(1)
				return v, true
			}
			// Corrupt payload from the backend ⇒ treat as a miss and fall back.
		}
		// Backend miss or error ⇒ fall through to the in-proc store. We never
		// fail the caller because the remote backend is unavailable.
	}

	if v, ok := c.getInProc(nsk); ok {
		c.hits.Add(1)
		return v, true
	}
	c.misses.Add(1)
	var zero V
	return zero, false
}

// SetJSON stores v under key in both the in-proc store (always) and the
// configured backend (best-effort, as JSON) using defaultTTL. A backend write
// failure is swallowed: the in-proc write still succeeds, so the value is
// cached locally even when the remote backend is down. When no backend is
// configured this is equivalent to Set. The returned error is non-nil only when
// v itself cannot be JSON-encoded for a configured backend.
func (c *Cache[V]) SetJSON(ctx context.Context, key string, v V) error {
	nsk := c.nsKey(key)
	c.setInProc(nsk, v, c.defaultTTL)

	if c.backend == nil {
		return nil
	}
	data, err := json.Marshal(v)
	if err != nil {
		// The value is un-encodable for the backend. The in-proc write already
		// landed, so the caller still has a working cache; report the encode
		// failure so callers can log it.
		return err
	}
	// Best-effort remote write — a backend outage must not fail the caller.
	_ = c.backend.SetJSON(ctx, nsk, data, c.defaultTTL)
	return nil
}

// Stats returns the cumulative hit and miss counts.
func (c *Cache[V]) Stats() (hits, misses uint64) {
	return c.hits.Load(), c.misses.Load()
}

// Len returns the number of entries currently held in the in-proc store,
// including any that have expired but not yet been overwritten or deleted.
func (c *Cache[V]) Len() int {
	c.mu.RLock()
	n := len(c.store)
	c.mu.RUnlock()
	return n
}
