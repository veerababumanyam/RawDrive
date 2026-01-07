/**
 * Redis Client Module for Caching and Distributed Locks.
 *
 * Provides a Redis connection for the Photo Sync Service with:
 * - Connection management with automatic reconnection
 * - Simple caching operations (get, set, delete)
 * - Distributed locking with Redlock-style algorithm
 * - Health check functionality for readiness probes
 * - Graceful shutdown handling
 *
 * @module cache/redis-client
 */

import Redis from 'ioredis';
import type { RedisOptions } from 'ioredis';
import { config } from '../config/index.js';

type RedisClient = InstanceType<typeof Redis>;

// ============================================================================
// Types
// ============================================================================

/**
 * Redis health check result.
 */
export interface RedisHealthCheck {
  healthy: boolean;
  latencyMs?: number;
  error?: string;
  connectedClients?: number;
  usedMemory?: string;
}

/**
 * Cache set options.
 */
export interface CacheSetOptions {
  /** Time-to-live in seconds */
  ttlSeconds?: number;
  /** Only set if key does not exist */
  nx?: boolean;
  /** Only set if key already exists */
  xx?: boolean;
}

/**
 * Distributed lock options.
 */
export interface LockOptions {
  /** Lock TTL in milliseconds (default: 30000) */
  ttlMs?: number;
  /** Number of retry attempts (default: 3) */
  retryCount?: number;
  /** Delay between retries in milliseconds (default: 200) */
  retryDelayMs?: number;
  /** Add jitter to retry delay (default: true) */
  retryJitter?: boolean;
}

/**
 * Lock acquisition result.
 */
export interface LockResult {
  acquired: boolean;
  lockId: string;
  key: string;
}

/**
 * Lock release result.
 */
export interface UnlockResult {
  released: boolean;
  key: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Default lock TTL in milliseconds */
const DEFAULT_LOCK_TTL_MS = 30000;

/** Default retry count for lock acquisition */
const DEFAULT_LOCK_RETRY_COUNT = 3;

/** Default delay between lock retries in milliseconds */
const DEFAULT_LOCK_RETRY_DELAY_MS = 200;

/** Lock key prefix */
const LOCK_PREFIX = 'lock:';

/** Cache key prefix for this service */
const CACHE_PREFIX = 'photo-sync:';

// ============================================================================
// Lua Scripts
// ============================================================================

/**
 * Lua script for atomic unlock operation.
 * Only releases the lock if the lock ID matches.
 */
const UNLOCK_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;

/**
 * Lua script for atomic lock extension.
 * Only extends if the lock ID matches.
 */
const EXTEND_LOCK_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("pexpire", KEYS[1], ARGV[2])
  else
    return 0
  end
`;

// ============================================================================
// Redis Client Instance
// ============================================================================

let redis: RedisClient | null = null;
let isShuttingDown = false;

/**
 * Create Redis connection options from configuration.
 */
function createRedisOptions(): RedisOptions {
  return {
    // Connection string parsing is handled by ioredis
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    retryStrategy: (times: number) => {
      if (isShuttingDown) {
        return null; // Stop retrying during shutdown
      }
      // Exponential backoff with max 10 seconds
      const delay = Math.min(times * 100, 10000);
      console.log(`[Redis] Reconnecting in ${delay}ms (attempt ${times})`);
      return delay;
    },
    reconnectOnError: (err: Error) => {
      const targetError = 'READONLY';
      if (err.message.includes(targetError)) {
        // Only reconnect when the error contains "READONLY"
        return true;
      }
      return false;
    },
    // Connection pool settings (ioredis manages this internally)
    enableReadyCheck: true,
    enableOfflineQueue: true,
    connectTimeout: 10000,
    // Keep-alive settings
    keepAlive: 10000,
    // Command timeout
    commandTimeout: 5000,
  };
}

/**
 * Get or create the Redis client instance.
 * This is a singleton that returns the same client.
 */
export function getRedisClient(): RedisClient {
  if (isShuttingDown) {
    throw new Error('Redis client is shutting down');
  }

  if (!redis) {
    const options = createRedisOptions();
    redis = new Redis(config.REDIS_URL, options);

    // Set up event handlers
    redis.on('connect', () => {
      console.log('[Redis] Connected to Redis server');
    });

    redis.on('ready', () => {
      console.log('[Redis] Redis client ready');
    });

    redis.on('error', (err: Error) => {
      console.error('[Redis] Connection error', {
        error: err.message,
        stack: err.stack,
      });
    });

    redis.on('close', () => {
      console.log('[Redis] Connection closed');
    });

    redis.on('reconnecting', () => {
      console.log('[Redis] Reconnecting...');
    });

    redis.on('end', () => {
      console.log('[Redis] Connection ended');
    });
  }

  return redis;
}

// ============================================================================
// Cache Operations
// ============================================================================

/**
 * Build a prefixed cache key.
 *
 * @param key - The cache key
 * @returns Prefixed key
 */
export function buildCacheKey(key: string): string {
  return `${CACHE_PREFIX}${key}`;
}

/**
 * Get a value from the cache.
 *
 * @param key - The cache key (will be prefixed)
 * @returns The cached value or null if not found
 *
 * @example
 * ```ts
 * const user = await cacheGet<User>('user:123');
 * if (user) {
 *   console.log('Cache hit');
 * }
 * ```
 */
export async function cacheGet<T = string>(key: string): Promise<T | null> {
  const client = getRedisClient();
  const prefixedKey = buildCacheKey(key);

  try {
    const value = await client.get(prefixedKey);

    if (value === null) {
      return null;
    }

    // Try to parse as JSON, fall back to raw string
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as T;
    }
  } catch (error) {
    console.error('[Redis] Cache get failed', {
      key: prefixedKey,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Set a value in the cache.
 *
 * @param key - The cache key (will be prefixed)
 * @param value - The value to cache (will be JSON-stringified if object)
 * @param options - Cache set options
 * @returns True if the value was set, false otherwise
 *
 * @example
 * ```ts
 * await cacheSet('user:123', { id: '123', name: 'John' }, { ttlSeconds: 3600 });
 * ```
 */
export async function cacheSet(
  key: string,
  value: unknown,
  options: CacheSetOptions = {}
): Promise<boolean> {
  const client = getRedisClient();
  const prefixedKey = buildCacheKey(key);

  // Serialize the value
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);

  try {
    const args: (string | number)[] = [prefixedKey, serialized];

    // Add TTL if specified
    if (options.ttlSeconds !== undefined && options.ttlSeconds > 0) {
      args.push('EX', options.ttlSeconds);
    }

    // Add NX/XX if specified
    if (options.nx) {
      args.push('NX');
    } else if (options.xx) {
      args.push('XX');
    }

    const result = await client.set(...(args as [string, string, ...string[]]));
    return result === 'OK';
  } catch (error) {
    console.error('[Redis] Cache set failed', {
      key: prefixedKey,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Delete a value from the cache.
 *
 * @param key - The cache key (will be prefixed)
 * @returns Number of keys deleted (0 or 1)
 *
 * @example
 * ```ts
 * await cacheDelete('user:123');
 * ```
 */
export async function cacheDelete(key: string): Promise<number> {
  const client = getRedisClient();
  const prefixedKey = buildCacheKey(key);

  try {
    return await client.del(prefixedKey);
  } catch (error) {
    console.error('[Redis] Cache delete failed', {
      key: prefixedKey,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Delete multiple values from the cache by pattern.
 *
 * @param pattern - The pattern to match (e.g., 'user:*')
 * @returns Number of keys deleted
 *
 * @example
 * ```ts
 * await cacheDeletePattern('user:*');
 * ```
 */
export async function cacheDeletePattern(pattern: string): Promise<number> {
  const client = getRedisClient();
  const prefixedPattern = buildCacheKey(pattern);

  try {
    let cursor = '0';
    let deletedCount = 0;

    do {
      const [newCursor, keys] = await client.scan(
        cursor,
        'MATCH',
        prefixedPattern,
        'COUNT',
        100
      );
      cursor = newCursor;

      if (keys.length > 0) {
        deletedCount += await client.del(...keys);
      }
    } while (cursor !== '0');

    return deletedCount;
  } catch (error) {
    console.error('[Redis] Cache delete pattern failed', {
      pattern: prefixedPattern,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Check if a key exists in the cache.
 *
 * @param key - The cache key (will be prefixed)
 * @returns True if the key exists
 */
export async function cacheExists(key: string): Promise<boolean> {
  const client = getRedisClient();
  const prefixedKey = buildCacheKey(key);

  try {
    const result = await client.exists(prefixedKey);
    return result === 1;
  } catch (error) {
    console.error('[Redis] Cache exists check failed', {
      key: prefixedKey,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Set TTL on an existing key.
 *
 * @param key - The cache key (will be prefixed)
 * @param ttlSeconds - New TTL in seconds
 * @returns True if TTL was set, false if key doesn't exist
 */
export async function cacheExpire(key: string, ttlSeconds: number): Promise<boolean> {
  const client = getRedisClient();
  const prefixedKey = buildCacheKey(key);

  try {
    const result = await client.expire(prefixedKey, ttlSeconds);
    return result === 1;
  } catch (error) {
    console.error('[Redis] Cache expire failed', {
      key: prefixedKey,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Get remaining TTL for a key.
 *
 * @param key - The cache key (will be prefixed)
 * @returns TTL in seconds, -1 if no TTL, -2 if key doesn't exist
 */
export async function cacheTtl(key: string): Promise<number> {
  const client = getRedisClient();
  const prefixedKey = buildCacheKey(key);

  try {
    return await client.ttl(prefixedKey);
  } catch (error) {
    console.error('[Redis] Cache TTL check failed', {
      key: prefixedKey,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Increment a counter in the cache.
 *
 * @param key - The cache key (will be prefixed)
 * @param increment - Amount to increment by (default: 1)
 * @returns New value after increment
 */
export async function cacheIncrement(key: string, increment = 1): Promise<number> {
  const client = getRedisClient();
  const prefixedKey = buildCacheKey(key);

  try {
    if (increment === 1) {
      return await client.incr(prefixedKey);
    }
    return await client.incrby(prefixedKey, increment);
  } catch (error) {
    console.error('[Redis] Cache increment failed', {
      key: prefixedKey,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

// ============================================================================
// Distributed Locking
// ============================================================================

/**
 * Generate a unique lock ID.
 */
function generateLockId(): string {
  return `${process.pid}:${Date.now()}:${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Add jitter to a delay value.
 */
function addJitter(delay: number): number {
  const jitter = Math.random() * delay * 0.1; // Up to 10% jitter
  return delay + jitter;
}

/**
 * Build a lock key.
 */
function buildLockKey(resource: string): string {
  return `${LOCK_PREFIX}${resource}`;
}

/**
 * Acquire a distributed lock.
 *
 * Uses SET NX with TTL for atomic lock acquisition.
 * Implements retry with exponential backoff and jitter.
 *
 * @param resource - The resource to lock
 * @param options - Lock options
 * @returns Lock result with lock ID if acquired
 *
 * @example
 * ```ts
 * const lock = await acquireLock('sync-job:123', { ttlMs: 60000 });
 * if (lock.acquired) {
 *   try {
 *     // Do work
 *   } finally {
 *     await releaseLock(lock.key, lock.lockId);
 *   }
 * }
 * ```
 */
export async function acquireLock(
  resource: string,
  options: LockOptions = {}
): Promise<LockResult> {
  const client = getRedisClient();
  const lockKey = buildLockKey(resource);
  const lockId = generateLockId();

  const ttlMs = options.ttlMs ?? DEFAULT_LOCK_TTL_MS;
  const retryCount = options.retryCount ?? DEFAULT_LOCK_RETRY_COUNT;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_LOCK_RETRY_DELAY_MS;
  const retryJitter = options.retryJitter ?? true;

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      // Try to acquire the lock atomically
      const result = await client.set(lockKey, lockId, 'PX', ttlMs, 'NX');

      if (result === 'OK') {
        if (config.isDevelopment) {
          console.log('[Redis] Lock acquired', { lockKey, lockId, ttlMs });
        }

        return {
          acquired: true,
          lockId,
          key: lockKey,
        };
      }

      // Lock not acquired, wait before retry
      if (attempt < retryCount) {
        const delay = retryJitter ? addJitter(retryDelayMs) : retryDelayMs;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    } catch (error) {
      console.error('[Redis] Lock acquisition error', {
        lockKey,
        attempt,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (attempt === retryCount) {
        throw error;
      }
    }
  }

  if (config.isDevelopment) {
    console.log('[Redis] Lock acquisition failed after retries', { lockKey, retryCount });
  }

  return {
    acquired: false,
    lockId,
    key: lockKey,
  };
}

/**
 * Release a distributed lock.
 *
 * Uses Lua script for atomic check-and-delete.
 * Only releases the lock if the lock ID matches.
 *
 * @param lockKey - The lock key returned from acquireLock
 * @param lockId - The lock ID returned from acquireLock
 * @returns Unlock result
 *
 * @example
 * ```ts
 * const result = await releaseLock(lock.key, lock.lockId);
 * if (result.released) {
 *   console.log('Lock released successfully');
 * }
 * ```
 */
export async function releaseLock(lockKey: string, lockId: string): Promise<UnlockResult> {
  const client = getRedisClient();

  try {
    const result = await client.eval(UNLOCK_SCRIPT, 1, lockKey, lockId);

    const released = result === 1;

    if (config.isDevelopment) {
      console.log('[Redis] Lock release', { lockKey, lockId, released });
    }

    return {
      released,
      key: lockKey,
    };
  } catch (error) {
    console.error('[Redis] Lock release error', {
      lockKey,
      lockId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Extend a lock's TTL.
 *
 * Uses Lua script for atomic check-and-extend.
 * Only extends if the lock ID matches.
 *
 * @param lockKey - The lock key
 * @param lockId - The lock ID
 * @param ttlMs - New TTL in milliseconds
 * @returns True if the lock was extended, false otherwise
 *
 * @example
 * ```ts
 * const extended = await extendLock(lock.key, lock.lockId, 60000);
 * if (!extended) {
 *   // Lock was lost, handle appropriately
 * }
 * ```
 */
export async function extendLock(
  lockKey: string,
  lockId: string,
  ttlMs: number
): Promise<boolean> {
  const client = getRedisClient();

  try {
    const result = await client.eval(EXTEND_LOCK_SCRIPT, 1, lockKey, lockId, ttlMs.toString());
    const extended = result === 1;

    if (config.isDevelopment) {
      console.log('[Redis] Lock extend', { lockKey, lockId, ttlMs, extended });
    }

    return extended;
  } catch (error) {
    console.error('[Redis] Lock extend error', {
      lockKey,
      lockId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Execute a function with a distributed lock.
 *
 * Acquires the lock, executes the callback, and releases the lock.
 * If lock cannot be acquired, throws an error.
 *
 * @param resource - The resource to lock
 * @param callback - Function to execute while holding the lock
 * @param options - Lock options
 * @returns Result of the callback function
 * @throws Error if lock cannot be acquired
 *
 * @example
 * ```ts
 * const result = await withLock('sync-job:123', async () => {
 *   // Do exclusive work
 *   return { processed: true };
 * }, { ttlMs: 60000 });
 * ```
 */
export async function withLock<T>(
  resource: string,
  callback: () => Promise<T>,
  options: LockOptions = {}
): Promise<T> {
  const lock = await acquireLock(resource, options);

  if (!lock.acquired) {
    throw new Error(`Failed to acquire lock for resource: ${resource}`);
  }

  try {
    return await callback();
  } finally {
    await releaseLock(lock.key, lock.lockId);
  }
}

// ============================================================================
// Health Check
// ============================================================================

/**
 * Check Redis health and return connection info.
 *
 * Executes PING command and INFO to verify connectivity.
 * Used for readiness probes and monitoring.
 *
 * @returns Health check result
 */
export async function checkHealth(): Promise<RedisHealthCheck> {
  const client = getRedisClient();

  const result: RedisHealthCheck = {
    healthy: false,
  };

  const start = Date.now();

  try {
    // Execute PING to verify connectivity
    const pong = await client.ping();

    if (pong !== 'PONG') {
      result.healthy = false;
      result.error = `Unexpected PING response: ${pong}`;
      result.latencyMs = Date.now() - start;
      return result;
    }

    // Get some info for monitoring
    const info = await client.info('clients');
    const memoryInfo = await client.info('memory');

    // Parse connected clients
    const clientsMatch = info.match(/connected_clients:(\d+)/);
    if (clientsMatch) {
      result.connectedClients = parseInt(clientsMatch[1], 10);
    }

    // Parse used memory
    const memoryMatch = memoryInfo.match(/used_memory_human:([^\r\n]+)/);
    if (memoryMatch) {
      result.usedMemory = memoryMatch[1];
    }

    result.healthy = true;
    result.latencyMs = Date.now() - start;
  } catch (error) {
    result.healthy = false;
    result.latencyMs = Date.now() - start;
    result.error = error instanceof Error ? error.message : 'Unknown error';
  }

  return result;
}

/**
 * Check if Redis is healthy (simple boolean check).
 *
 * @returns True if Redis is reachable
 */
export async function isHealthy(): Promise<boolean> {
  try {
    const health = await checkHealth();
    return health.healthy;
  } catch {
    return false;
  }
}

// ============================================================================
// Connection Lifecycle
// ============================================================================

/**
 * Initialize the Redis connection.
 *
 * Call this during application startup to verify Redis connectivity.
 *
 * @throws Error if Redis connection fails
 */
export async function initialize(): Promise<void> {
  console.log('[Redis] Initializing Redis connection...');
  console.log('[Redis] Configuration:', {
    url: config.REDIS_URL.replace(/\/\/[^@]*@/, '//***:***@'),
  });

  const client = getRedisClient();

  try {
    // Connect to Redis
    await client.connect();

    // Verify connectivity
    const pong = await client.ping();

    if (pong !== 'PONG') {
      throw new Error(`Unexpected PING response: ${pong}`);
    }

    // Get server info
    const info = await client.info('server');
    const versionMatch = info.match(/redis_version:([^\r\n]+)/);
    const version = versionMatch ? versionMatch[1] : 'unknown';

    console.log('[Redis] Connection established', {
      version,
    });
  } catch (error) {
    console.error('[Redis] Failed to initialize connection', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Close the Redis connection.
 *
 * Call this during application shutdown to gracefully close the connection.
 */
export async function close(): Promise<void> {
  if (!redis) {
    console.log('[Redis] No connection to close');
    return;
  }

  isShuttingDown = true;

  console.log('[Redis] Closing connection...');

  try {
    await redis.quit();
    redis = null;
    console.log('[Redis] Connection closed');
  } catch (error) {
    console.error('[Redis] Error closing connection', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    // Force disconnect if quit fails
    if (redis) {
      redis.disconnect();
      redis = null;
    }
    throw error;
  } finally {
    isShuttingDown = false;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get the raw Redis client for advanced operations.
 *
 * Use this when you need access to Redis commands not wrapped by this module.
 *
 * @returns Raw ioredis client
 */
export function getRawClient(): RedisClient {
  return getRedisClient();
}

/**
 * Execute a pipeline of commands.
 *
 * @param commands - Array of commands to execute
 * @returns Array of results
 *
 * @example
 * ```ts
 * const results = await pipeline([
 *   ['set', 'key1', 'value1'],
 *   ['set', 'key2', 'value2'],
 *   ['get', 'key1'],
 * ]);
 * ```
 */
export async function pipeline(
  commands: Array<[string, ...unknown[]]>
): Promise<Array<[Error | null, unknown]>> {
  const client = getRedisClient();
  const pipe = client.pipeline();

  for (const [command, ...args] of commands) {
    (pipe as unknown as Record<string, (...args: unknown[]) => void>)[command](...args);
  }

  return await pipe.exec() as Array<[Error | null, unknown]>;
}

/**
 * Execute multiple commands in a transaction (MULTI/EXEC).
 *
 * @param commands - Array of commands to execute
 * @returns Array of results
 *
 * @example
 * ```ts
 * const results = await multi([
 *   ['incr', 'counter'],
 *   ['expire', 'counter', 3600],
 * ]);
 * ```
 */
export async function multi(
  commands: Array<[string, ...unknown[]]>
): Promise<Array<[Error | null, unknown]>> {
  const client = getRedisClient();
  const transaction = client.multi();

  for (const [command, ...args] of commands) {
    (transaction as unknown as Record<string, (...args: unknown[]) => void>)[command](...args);
  }

  return await transaction.exec() as Array<[Error | null, unknown]>;
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  // Client
  getRedisClient,
  getRawClient,

  // Cache operations
  buildCacheKey,
  cacheGet,
  cacheSet,
  cacheDelete,
  cacheDeletePattern,
  cacheExists,
  cacheExpire,
  cacheTtl,
  cacheIncrement,

  // Locking
  acquireLock,
  releaseLock,
  extendLock,
  withLock,

  // Health
  checkHealth,
  isHealthy,

  // Lifecycle
  initialize,
  close,

  // Utilities
  pipeline,
  multi,
};
