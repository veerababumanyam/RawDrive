package service

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeSharedCache is an in-memory stand-in for the Valkey-backed cross-node
// analytics cache. It lets us prove the shared-cache wiring, the JSON
// round-trip, and cross-node invalidation without a live Valkey or Postgres —
// matching this package's no-DB test convention.
type fakeSharedCache struct {
	mu   sync.Mutex
	data map[string][]byte
	gets int
	sets int
	dels int
}

func newFakeSharedCache() *fakeSharedCache {
	return &fakeSharedCache{data: make(map[string][]byte)}
}

func (f *fakeSharedCache) Get(_ context.Context, key string) ([]byte, bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.gets++
	b, ok := f.data[key]
	return b, ok, nil
}

func (f *fakeSharedCache) Set(_ context.Context, key string, val []byte, _ time.Duration) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.sets++
	cp := make([]byte, len(val))
	copy(cp, val)
	f.data[key] = cp
}

func (f *fakeSharedCache) Del(_ context.Context, key string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.dels++
	delete(f.data, key)
}

// When a shared cache is wired, the analytics cache read/write (the exact path
// GetAnalytics uses) must go through it — not the in-process map — and a JSON
// round-trip must preserve every field.
func TestStorageAnalytics_SharedCacheRoundTrip(t *testing.T) {
	fake := newFakeSharedCache()
	svc := NewStorageAccounting(nil).WithSharedCache(fake)
	ws := uuid.New()

	a := &StorageAnalytics{
		Usage:         &WorkspaceStorage{WorkspaceID: ws, UsedBytes: 123, DerivativeBytes: 45},
		TopGalleries:  []GalleryStorageBreakdown{{GalleryName: "Wedding", UsedBytes: 99}},
		TypeBreakdown: StorageTypeBreakdown{Originals: 100, Derivatives: 45, Thumbnails: 5},
	}
	svc.cache.set(ws, a, time.Hour)
	assert.GreaterOrEqual(t, fake.sets, 1, "set must write the shared cache")
	assert.Empty(t, svc.cache.entries, "shared mode must not populate the in-process map")

	got, ok := svc.cache.get(ws)
	require.True(t, ok, "get must hit the shared cache")
	require.NotNil(t, got)
	require.NotNil(t, got.Usage)
	assert.Equal(t, int64(123), got.Usage.UsedBytes)
	assert.Equal(t, int64(45), got.Usage.DerivativeBytes)
	assert.Equal(t, int64(100), got.TypeBreakdown.Originals)
	require.Len(t, got.TopGalleries, 1)
	assert.Equal(t, "Wedding", got.TopGalleries[0].GalleryName)
	assert.GreaterOrEqual(t, fake.gets, 1, "get must consult the shared cache")
}

// Invalidation must DELETE the SHARED key (so the other app node's next read
// misses and re-queries) — this is what kills the cross-node staleness. Both
// the mutation write paths and InvalidateAnalytics route through cache.invalidate.
func TestStorageAnalytics_InvalidateDeletesSharedKey(t *testing.T) {
	fake := newFakeSharedCache()
	svc := NewStorageAccounting(nil).WithSharedCache(fake)
	ws := uuid.New()

	svc.cache.set(ws, &StorageAnalytics{Usage: &WorkspaceStorage{WorkspaceID: ws}}, time.Hour)
	_, ok := svc.cache.get(ws)
	require.True(t, ok)

	svc.InvalidateAnalytics(ws)
	assert.GreaterOrEqual(t, fake.dels, 1, "InvalidateAnalytics must DEL the shared key")
	_, ok = svc.cache.get(ws)
	assert.False(t, ok, "shared entry must be gone after invalidation")
}

// With no shared cache wired, behavior must be exactly the in-process cache
// (single-node / no Valkey) — store, read, and invalidate all stay local.
func TestStorageAnalytics_FallsBackToInProcess(t *testing.T) {
	svc := NewStorageAccounting(nil) // no WithSharedCache
	ws := uuid.New()

	svc.cache.set(ws, &StorageAnalytics{Usage: &WorkspaceStorage{WorkspaceID: ws, UsedBytes: 7}}, time.Hour)
	require.NotEmpty(t, svc.cache.entries, "no-shared mode must use the in-process map")
	got, ok := svc.cache.get(ws)
	require.True(t, ok)
	require.NotNil(t, got.Usage)
	assert.Equal(t, int64(7), got.Usage.UsedBytes)

	svc.InvalidateAnalytics(ws)
	_, ok = svc.cache.get(ws)
	assert.False(t, ok, "in-process entry must be gone after invalidation")
}
