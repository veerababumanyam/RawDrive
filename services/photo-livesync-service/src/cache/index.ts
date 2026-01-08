/**
 * Cache Module Exports.
 *
 * Re-exports all cache functionality for convenient importing.
 *
 * @module cache
 *
 * @example
 * ```ts
 * import { cacheGet, cacheSet, acquireLock, releaseLock } from './cache/index.js';
 *
 * // Initialize on startup
 * await initialize();
 *
 * // Cache operations
 * await cacheSet('user:123', userData, { ttlSeconds: 3600 });
 * const cached = await cacheGet<User>('user:123');
 *
 * // Distributed locking
 * const lock = await acquireLock('resource:123');
 * if (lock.acquired) {
 *   try {
 *     // Do exclusive work
 *   } finally {
 *     await releaseLock(lock.key, lock.lockId);
 *   }
 * }
 *
 * // Close on shutdown
 * await close();
 * ```
 */

export {
  // Client access
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

  // Distributed locking
  acquireLock,
  releaseLock,
  extendLock,
  withLock,

  // Health checks
  checkHealth,
  isHealthy,

  // Lifecycle
  initialize,
  close,

  // Utilities
  pipeline,
  multi,

  // Types
  type RedisHealthCheck,
  type CacheSetOptions,
  type LockOptions,
  type LockResult,
  type UnlockResult,
} from './redis-client.js';

// Default export for convenience
export { default as redis } from './redis-client.js';
