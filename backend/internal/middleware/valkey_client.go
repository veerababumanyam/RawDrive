package middleware

// valkey_client.go — concrete Redis/Valkey-backed implementation of
// the sliding-window rate limiter interface from valkey_ratelimit.go.
//
// The core algorithm lives in a Lua script so a single round trip to
// the server handles: trim old entries, count remaining entries, push
// the current request, and return the count. That atomicity is what
// makes sliding-log fair under concurrent load — two parallel workers
// racing on the same key will never double-count.
//
// The script body:
//
//   -- KEYS[1]: the sorted-set key (one per rate-limit bucket)
//   -- ARGV[1]: window cutoff (now - window) in ms
//   -- ARGV[2]: current now in ms (also used as score and value)
//   -- ARGV[3]: maxRequests
//   -- ARGV[4]: window in ms (for TTL)
//
//   redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[1])
//   local count = redis.call('ZCARD', KEYS[1])
//   if count < tonumber(ARGV[3]) then
//       redis.call('ZADD', KEYS[1], ARGV[2], ARGV[2]..'-'..math.random(1,1000000))
//       redis.call('PEXPIRE', KEYS[1], ARGV[4])
//       return {count + 1, 1}
//   end
//   return {count, 0}
//
// Return shape is [current_count_after, allowed_flag]. The caller
// uses allowed_flag to decide whether to let the request through.

import (
	"context"
	"fmt"

	"github.com/redis/go-redis/v9"
)

// slidingWindowLua is the single-round-trip atomic sliding-log script.
// Store the SHA once on startup and EVALSHA on every request.
const slidingWindowLua = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[1])
local count = redis.call('ZCARD', KEYS[1])
if tonumber(count) < tonumber(ARGV[3]) then
	redis.call('ZADD', KEYS[1], ARGV[2], ARGV[2]..'-'..math.random(1,1000000))
	redis.call('PEXPIRE', KEYS[1], ARGV[4])
	return {count + 1, 1}
end
return {count, 0}
`

// RedisValkeyClient wraps a go-redis client to implement the ValkeyClient
// interface. Construct with NewRedisValkeyClient(redis.NewClient(...)).
type RedisValkeyClient struct {
	rdb    *redis.Client
	script *redis.Script
}

// NewRedisValkeyClient creates a ValkeyClient backed by go-redis.
func NewRedisValkeyClient(rdb *redis.Client) *RedisValkeyClient {
	return &RedisValkeyClient{
		rdb:    rdb,
		script: redis.NewScript(slidingWindowLua),
	}
}

// Ping implements ValkeyClient.
func (c *RedisValkeyClient) Ping(ctx context.Context) error {
	return c.rdb.Ping(ctx).Err()
}

// IncrementSlidingWindow implements ValkeyClient via the Lua script.
func (c *RedisValkeyClient) IncrementSlidingWindow(
	ctx context.Context,
	key string,
	maxRequests int,
	windowMs int64,
	nowMs int64,
) (int, bool, error) {
	cutoff := nowMs - windowMs
	raw, err := c.script.Run(ctx, c.rdb, []string{key}, cutoff, nowMs, maxRequests, windowMs).Result()
	if err != nil {
		return 0, false, fmt.Errorf("sliding window script: %w", err)
	}
	// Script returns [count_after, allowed_flag] as []interface{}.
	arr, ok := raw.([]interface{})
	if !ok || len(arr) != 2 {
		return 0, false, fmt.Errorf("sliding window script: unexpected return shape: %T", raw)
	}
	count, _ := arr[0].(int64)
	allowed, _ := arr[1].(int64)
	return int(count), allowed == 1, nil
}
