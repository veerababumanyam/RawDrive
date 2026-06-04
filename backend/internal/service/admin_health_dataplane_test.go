package service

// admin_health_dataplane_test.go — guards the WithDataplane cache-source
// storage logic, specifically the typed-nil trap: a non-nil interface whose
// PoolStats() returns nil (e.g. (*middleware.RedisValkeyClient)(nil)) must NOT
// be stored, so a disabled Valkey yields an omitted cache block rather than a
// misleading all-zero one. No DB required.

import (
	"testing"

	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
)

type fakeCacheStatSource struct{ stats *redis.PoolStats }

func (f fakeCacheStatSource) PoolStats() *redis.PoolStats { return f.stats }

func TestWithDataplaneStoresUsableCacheSource(t *testing.T) {
	svc := NewAdminHealthService(nil).WithDataplane(nil, fakeCacheStatSource{stats: &redis.PoolStats{Hits: 1}})
	assert.NotNil(t, svc.cacheSource, "a source yielding real stats must be stored")
}

func TestWithDataplaneSkipsSourceWithNilStats(t *testing.T) {
	svc := NewAdminHealthService(nil).WithDataplane(nil, fakeCacheStatSource{stats: nil})
	assert.Nil(t, svc.cacheSource, "a source that yields no stats must NOT be stored")
}

func TestWithDataplaneSkipsNilInterface(t *testing.T) {
	svc := NewAdminHealthService(nil).WithDataplane(nil, nil)
	assert.Nil(t, svc.cacheSource)
}
