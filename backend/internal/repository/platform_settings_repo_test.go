package repository

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestSettingsCache_Mechanics exercises the in-process GetByKey cache in
// isolation (no DB): TTL expiry, explicit invalidation, negative caching for
// absent keys, and copy-safety so a caller that mutates the returned struct
// cannot corrupt the cached entry.
func TestSettingsCache_Mechanics(t *testing.T) {
	r := NewPlatformSettingsRepo(nil)
	r.cacheTTL = 60 * time.Millisecond

	s := &PlatformSetting{Category: "auth", Key: "jwt_issuer", Value: "v1"}
	r.cachePut("auth", "jwt_issuer", s)

	got, hit := r.cacheGet("auth", "jwt_issuer")
	require.True(t, hit, "expected cache hit immediately after put")
	require.NotNil(t, got)
	assert.Equal(t, "v1", got.Value)

	// Copy-safety: mutating the returned pointer must not mutate the cache.
	got.Value = "mutated-by-caller"
	again, hit := r.cacheGet("auth", "jwt_issuer")
	require.True(t, hit)
	assert.Equal(t, "v1", again.Value, "returned value must be a copy; cache entry was corrupted")

	// Explicit invalidation drops the entry.
	r.cacheInvalidate("auth", "jwt_issuer")
	_, hit = r.cacheGet("auth", "jwt_issuer")
	assert.False(t, hit, "expected miss after invalidate")

	// Negative caching: absent keys are remembered as a (nil, hit) entry.
	r.cachePut("auth", "absent_key", nil)
	neg, hit := r.cacheGet("auth", "absent_key")
	assert.True(t, hit, "expected negative cache hit")
	assert.Nil(t, neg, "negative entry must surface as nil setting")

	// TTL expiry: entries vanish after cacheTTL.
	r.cachePut("auth", "jwt_issuer", s)
	time.Sleep(80 * time.Millisecond)
	_, hit = r.cacheGet("auth", "jwt_issuer")
	assert.False(t, hit, "expected miss after TTL expiry")

	// TTL <= 0 disables the cache entirely.
	r.cacheTTL = 0
	r.cachePut("auth", "jwt_issuer", s)
	_, hit = r.cacheGet("auth", "jwt_issuer")
	assert.False(t, hit, "cache must be disabled when cacheTTL <= 0")
}

// TestGetByKey_ServesFromCacheWithoutDB proves GetByKey consults the cache
// before the pool: with a nil pool, a cached entry must be returned without any
// database access (a DB query on the nil pool would panic). This is the
// behavioral contract that collapses the 5-6 per-request DB round-trips on the
// streaming-config / feature-flag hot paths.
func TestGetByKey_ServesFromCacheWithoutDB(t *testing.T) {
	r := NewPlatformSettingsRepo(nil) // nil pool: any DB access panics
	r.cachePut("ai", "gemini_api_key", &PlatformSetting{
		Category: "ai", Key: "gemini_api_key", Value: "cached-secret",
	})

	got, err := r.GetByKey(context.Background(), "ai", "gemini_api_key")
	require.NoError(t, err)
	require.NotNil(t, got, "GetByKey must serve the cached entry")
	assert.Equal(t, "cached-secret", got.Value)

	// Negative cache: a remembered-absent key returns (nil, nil) without DB.
	r.cachePut("ai", "missing", nil)
	got, err = r.GetByKey(context.Background(), "ai", "missing")
	require.NoError(t, err)
	assert.Nil(t, got, "negative cache hit must return nil without touching the pool")
}

// TestSettingsCache_ConcurrentAccess hammers the cache from many goroutines so
// `go test -race` exercises the get/put/invalidate lock discipline directly,
// rather than relying only on review of the happens-before argument.
func TestSettingsCache_ConcurrentAccess(t *testing.T) {
	r := NewPlatformSettingsRepo(nil)
	r.cacheTTL = time.Second

	const workers = 32
	var wg sync.WaitGroup
	wg.Add(workers)
	for i := 0; i < workers; i++ {
		go func(n int) {
			defer wg.Done()
			cat := "ai"
			key := "k" + string(rune('a'+n%5))
			for j := 0; j < 200; j++ {
				switch j % 3 {
				case 0:
					r.cachePut(cat, key, &PlatformSetting{Category: cat, Key: key, Value: "v"})
				case 1:
					if got, hit := r.cacheGet(cat, key); hit && got != nil {
						_ = got.Value
					}
				case 2:
					r.cacheInvalidate(cat, key)
				}
			}
		}(i)
	}
	wg.Wait()
}

// TestGetByKey_InvalidatesOnWrite is the DB-backed end-to-end proof that
// (a) GetByKey actually serves from the cache (a stale value survives an
// out-of-band UPDATE that bypasses the repo) and (b) Upsert and Delete
// invalidate that cache so writers see their own writes immediately on the
// same node. Graceful-skip when no migrated test DB is available.
func TestGetByKey_InvalidatesOnWrite(t *testing.T) {
	pool := getRetryTestPool(t) // skips when no Docker / DATABASE_URL
	ctx := context.Background()

	repo := NewPlatformSettingsRepo(pool)
	repo.cacheTTL = time.Minute // long TTL: only invalidation should clear the entry

	cat := "ai"
	key := "test_cache_" + uuid.NewString()
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM platform_settings WHERE category=$1 AND key=$2`, cat, key)
	})

	require.NoError(t, repo.Upsert(ctx, cat, key, "v1", false, "cache test", nil))

	got, err := repo.GetByKey(ctx, cat, key) // populates cache with v1
	require.NoError(t, err)
	require.NotNil(t, got)
	require.Equal(t, "v1", got.Value)

	// Out-of-band UPDATE bypasses repo invalidation; the cache must still serve v1.
	_, err = pool.Exec(ctx, `UPDATE platform_settings SET value='v2' WHERE category=$1 AND key=$2`, cat, key)
	require.NoError(t, err)
	got, err = repo.GetByKey(ctx, cat, key)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, "v1", got.Value, "cache should still serve the stale value after an out-of-band update")

	// Upsert through the repo must invalidate so the writer sees v3 immediately.
	require.NoError(t, repo.Upsert(ctx, cat, key, "v3", false, "", nil))
	got, err = repo.GetByKey(ctx, cat, key)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, "v3", got.Value, "Upsert must invalidate the cache")

	// Delete through the repo must invalidate so the row reads as absent.
	require.NoError(t, repo.Delete(ctx, cat, key))
	got, err = repo.GetByKey(ctx, cat, key)
	require.NoError(t, err)
	assert.Nil(t, got, "Delete must invalidate the cache; key now reads as absent")
}
