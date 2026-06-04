package observability_test

// dataplane_test.go — pure mapping tests (no DB, no network).
//
// The cache mapper is fully unit-testable because go-redis PoolStats is a
// plain struct. The pool mapper takes a *pgxpool.Stat (no synthetic
// constructor exists), so only its nil-safety is unit-tested here; its live
// mapping is exercised through the admin summary integration path.

import (
	"testing"

	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"

	"github.com/rawdrive/backend/internal/observability"
)

func TestCacheStatsFromMapsAllFields(t *testing.T) {
	in := &redis.PoolStats{Hits: 100, Misses: 5, Timeouts: 1, TotalConns: 8, IdleConns: 6, StaleConns: 2}

	got := observability.CacheStatsFrom(in)

	assert.Equal(t, uint32(100), got.Hits)
	assert.Equal(t, uint32(5), got.Misses)
	assert.Equal(t, uint32(1), got.Timeouts)
	assert.Equal(t, uint32(8), got.TotalConns)
	assert.Equal(t, uint32(6), got.IdleConns)
	assert.Equal(t, uint32(2), got.StaleConns)
}

func TestCacheStatsFromNilIsZeroValue(t *testing.T) {
	assert.Equal(t, observability.CacheStats{}, observability.CacheStatsFrom(nil))
}

func TestPoolStatsFromNilIsZeroValue(t *testing.T) {
	assert.Equal(t, observability.PoolStats{}, observability.PoolStatsFrom(nil))
}
