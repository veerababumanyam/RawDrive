// Package observability provides driver-neutral snapshots of data-plane
// runtime state (Postgres connection pool, Valkey/Redis client pool) so the
// HTTP/JSON layers can report saturation and cache hit/miss without depending
// on pgx or go-redis internals.
package observability

import (
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// PoolStats is a JSON-stable snapshot of pgxpool connection-pool counters.
// Saturation = AcquiredConns / MaxConns; a rising EmptyAcquireCount means
// callers are blocking on an exhausted pool.
type PoolStats struct {
	TotalConns           int32 `json:"total_conns"`
	IdleConns            int32 `json:"idle_conns"`
	AcquiredConns        int32 `json:"acquired_conns"`
	MaxConns             int32 `json:"max_conns"`
	AcquireCount         int64 `json:"acquire_count"`
	EmptyAcquireCount    int64 `json:"empty_acquire_count"`
	CanceledAcquireCount int64 `json:"canceled_acquire_count"`
}

// CacheStats is a JSON-stable snapshot of go-redis client pool counters.
// Hits/Misses are the connection-pool reuse rate (not key hit rate);
// Timeouts > 0 means the client could not get a connection in time.
type CacheStats struct {
	Hits       uint32 `json:"hits"`
	Misses     uint32 `json:"misses"`
	Timeouts   uint32 `json:"timeouts"`
	TotalConns uint32 `json:"total_conns"`
	IdleConns  uint32 `json:"idle_conns"`
	StaleConns uint32 `json:"stale_conns"`
}

// PoolStatsFrom maps a live *pgxpool.Stat to the neutral snapshot. nil-safe.
func PoolStatsFrom(s *pgxpool.Stat) PoolStats {
	if s == nil {
		return PoolStats{}
	}
	return PoolStats{
		TotalConns:           s.TotalConns(),
		IdleConns:            s.IdleConns(),
		AcquiredConns:        s.AcquiredConns(),
		MaxConns:             s.MaxConns(),
		AcquireCount:         s.AcquireCount(),
		EmptyAcquireCount:    s.EmptyAcquireCount(),
		CanceledAcquireCount: s.CanceledAcquireCount(),
	}
}

// CacheStatsFrom maps a live *redis.PoolStats to the neutral snapshot. nil-safe.
func CacheStatsFrom(s *redis.PoolStats) CacheStats {
	if s == nil {
		return CacheStats{}
	}
	return CacheStats{
		Hits:       s.Hits,
		Misses:     s.Misses,
		Timeouts:   s.Timeouts,
		TotalConns: s.TotalConns,
		IdleConns:  s.IdleConns,
		StaleConns: s.StaleConns,
	}
}
