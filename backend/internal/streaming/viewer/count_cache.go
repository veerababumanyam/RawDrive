// Package viewer — ViewerCountCache (M35 / E107-S4).
//
// Wraps the owner-console presence source (LiveConsoleDeps.GetViewerMetrics)
// with a TTL-bounded, per-stream in-memory cache so that public viewer-count
// requests coalesce into one upstream hit per TTL bucket.
//
// Field-whitelisting is enforced at the cache boundary: PublicViewerCount
// exposes ONLY {Current, AsOf}. peak/unique are owner-only and are stripped
// here so no downstream serializer can leak them.
package viewer

import (
	"context"
	"sync"
	"time"

	"github.com/google/uuid"
)

// LiveViewerMetricsShim is the minimal shape this package depends on.
//
// We do not import the handlers package (would create an import cycle via
// the public viewer handler). The real presence source returns a richer
// struct — the adapter the wiring code passes in must populate at least
// Current; Peak/Unique are accepted but never surfaced by the cache.
type LiveViewerMetricsShim struct {
	Current int
	Peak    int
	Unique  int
}

// PresenceSource is the upstream the cache wraps. It maps 1:1 onto
// LiveConsoleDeps.GetViewerMetrics; a thin adapter converts the concrete
// handlers.LiveViewerMetrics into LiveViewerMetricsShim at wire-up time.
type PresenceSource interface {
	GetViewerMetrics(ctx context.Context, streamID uuid.UUID) (*LiveViewerMetricsShim, error)
}

// PublicViewerCount is the field-whitelisted public projection. Do NOT add
// Peak/Unique here — those are owner-console data and have their own route.
type PublicViewerCount struct {
	Current int       `json:"current"`
	AsOf    time.Time `json:"as_of"`
}

type countEntry struct {
	value PublicViewerCount
	at    time.Time
}

// ViewerCountCache coalesces concurrent viewer-count requests per stream.
type ViewerCountCache struct {
	src   PresenceSource
	ttl   time.Duration
	now   func() time.Time
	mu    sync.Mutex
	data  map[uuid.UUID]countEntry
	locks map[uuid.UUID]*sync.Mutex // per-stream serialisation of upstream fetches
}

// NewViewerCountCache constructs the cache. ttl defaults to 5s, clock defaults
// to time.Now.
func NewViewerCountCache(src PresenceSource, ttl time.Duration, clock func() time.Time) *ViewerCountCache {
	if ttl <= 0 {
		ttl = 5 * time.Second
	}
	if clock == nil {
		clock = time.Now
	}
	return &ViewerCountCache{
		src:   src,
		ttl:   ttl,
		now:   clock,
		data:  make(map[uuid.UUID]countEntry),
		locks: make(map[uuid.UUID]*sync.Mutex),
	}
}

// GetCurrent returns the cached PublicViewerCount if fresh, else refetches.
// Upstream errors are NOT cached.
func (c *ViewerCountCache) GetCurrent(ctx context.Context, streamID uuid.UUID) (PublicViewerCount, error) {
	// Fast path: fresh cache hit.
	c.mu.Lock()
	if e, ok := c.data[streamID]; ok && c.now().Sub(e.at) < c.ttl {
		c.mu.Unlock()
		return e.value, nil
	}
	// Get / create the per-stream fetch lock.
	fl, ok := c.locks[streamID]
	if !ok {
		fl = &sync.Mutex{}
		c.locks[streamID] = fl
	}
	c.mu.Unlock()

	fl.Lock()
	defer fl.Unlock()

	// Re-check after acquiring fetch lock — another caller may have filled it.
	c.mu.Lock()
	if e, ok := c.data[streamID]; ok && c.now().Sub(e.at) < c.ttl {
		c.mu.Unlock()
		return e.value, nil
	}
	c.mu.Unlock()

	m, err := c.src.GetViewerMetrics(ctx, streamID)
	if err != nil {
		return PublicViewerCount{}, err
	}

	now := c.now()
	pub := PublicViewerCount{Current: 0, AsOf: now}
	if m != nil {
		pub.Current = m.Current
	}

	c.mu.Lock()
	c.data[streamID] = countEntry{value: pub, at: now}
	c.mu.Unlock()

	return pub, nil
}
