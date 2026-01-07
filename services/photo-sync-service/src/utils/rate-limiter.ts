/**
 * Token Bucket Rate Limiter Utility.
 *
 * Implements a token bucket algorithm for rate limiting API requests to
 * cloud storage providers (Google Photos, Dropbox, OneDrive, etc.).
 *
 * Features:
 * - Token bucket algorithm with configurable capacity and refill rate
 * - Support for both in-memory and Redis-backed distributed rate limiting
 * - Per-provider rate limiting with different configurations
 * - Graceful handling of burst traffic
 * - Wait-for-token functionality with timeout
 * - Statistics and monitoring support
 *
 * Token Bucket Algorithm:
 * - Bucket has a maximum capacity of tokens
 * - Tokens are consumed when requests are made
 * - Tokens are refilled at a constant rate over time
 * - If bucket is empty, requests are rate limited
 * - Allows for controlled bursting up to bucket capacity
 *
 * @module utils/rate-limiter
 */

import { config } from '../config/index.js';
import { getRedisClient } from '../cache/redis-client.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Provider type for rate limiting.
 */
export type ProviderType = 'google' | 'dropbox' | 'onedrive' | 'amazon' | 'icloud' | 'default';

/**
 * Rate limiter configuration.
 */
export interface RateLimiterConfig {
  /** Maximum number of tokens in the bucket (burst capacity) */
  capacity: number;
  /** Number of tokens to refill per interval */
  refillRate: number;
  /** Interval for token refill in milliseconds */
  refillIntervalMs: number;
  /** Optional key prefix for namespacing */
  keyPrefix?: string;
}

/**
 * Token consumption options.
 */
export interface ConsumeOptions {
  /** Number of tokens to consume (default: 1) */
  tokens?: number;
  /** Whether to wait if tokens aren't available (default: false) */
  waitForTokens?: boolean;
  /** Maximum time to wait for tokens in milliseconds (default: 30000) */
  waitTimeoutMs?: number;
}

/**
 * Result of a token consumption attempt.
 */
export interface ConsumeResult {
  /** Whether tokens were successfully consumed */
  allowed: boolean;
  /** Number of tokens remaining in the bucket */
  remaining: number;
  /** Time in milliseconds until the bucket is refilled */
  retryAfterMs: number;
  /** Current bucket capacity */
  capacity: number;
  /** Number of tokens consumed */
  consumed: number;
}

/**
 * Rate limiter statistics.
 */
export interface RateLimiterStats {
  /** Total number of requests */
  totalRequests: number;
  /** Number of allowed requests */
  allowedRequests: number;
  /** Number of rate limited (denied) requests */
  deniedRequests: number;
  /** Current token count */
  currentTokens: number;
  /** Time of last refill */
  lastRefillTime: number;
}

/**
 * Provider-specific rate limit configuration.
 */
export interface ProviderRateLimitConfig {
  /** Requests per minute */
  requestsPerMinute: number;
  /** Burst capacity (defaults to requestsPerMinute) */
  burstCapacity?: number;
  /** Whether this provider requires strict rate limiting */
  strictMode?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default rate limiter configuration.
 */
export const DEFAULT_CONFIG: RateLimiterConfig = {
  capacity: config.RATE_LIMIT_MAX_REQUESTS,
  refillRate: Math.ceil(config.RATE_LIMIT_MAX_REQUESTS / (config.RATE_LIMIT_WINDOW_MS / 1000)),
  refillIntervalMs: 1000,
  keyPrefix: 'ratelimit',
};

/**
 * Provider-specific rate limits based on documented API limits.
 * These are conservative estimates to avoid hitting actual limits.
 */
export const PROVIDER_RATE_LIMITS: Record<ProviderType, ProviderRateLimitConfig> = {
  google: {
    // Google Photos API: 10,000 requests per day (~7/min), burst allowed
    requestsPerMinute: 100,
    burstCapacity: 200,
    strictMode: false,
  },
  dropbox: {
    // Dropbox API: Varies by endpoint, ~1000/hour (~17/min)
    requestsPerMinute: 60,
    burstCapacity: 100,
    strictMode: true,
  },
  onedrive: {
    // Microsoft Graph API: 10,000 requests per 10 minutes
    requestsPerMinute: 500,
    burstCapacity: 1000,
    strictMode: false,
  },
  amazon: {
    // Amazon Drive API: Limited documentation, conservative limit
    requestsPerMinute: 30,
    burstCapacity: 50,
    strictMode: true,
  },
  icloud: {
    // iCloud CloudKit: Limited documentation, conservative limit
    requestsPerMinute: 40,
    burstCapacity: 60,
    strictMode: true,
  },
  default: {
    requestsPerMinute: config.RATE_LIMIT_MAX_REQUESTS,
    burstCapacity: config.RATE_LIMIT_MAX_REQUESTS,
    strictMode: false,
  },
};

/**
 * Redis key prefix for rate limiter.
 */
const REDIS_KEY_PREFIX = 'photo-sync:ratelimit:';

/**
 * Lua script for atomic token bucket consumption in Redis.
 * Returns: [allowed (0/1), remaining, retryAfterMs]
 */
const CONSUME_TOKENS_SCRIPT = `
  local key = KEYS[1]
  local capacity = tonumber(ARGV[1])
  local refillRate = tonumber(ARGV[2])
  local refillIntervalMs = tonumber(ARGV[3])
  local tokensRequested = tonumber(ARGV[4])
  local now = tonumber(ARGV[5])

  -- Get current state
  local bucket = redis.call('HMGET', key, 'tokens', 'lastRefill')
  local tokens = tonumber(bucket[1])
  local lastRefill = tonumber(bucket[2])

  -- Initialize if new bucket
  if tokens == nil then
    tokens = capacity
    lastRefill = now
  end

  -- Calculate tokens to add based on time elapsed
  local elapsed = now - lastRefill
  local tokensToAdd = math.floor(elapsed / refillIntervalMs) * refillRate

  -- Update tokens (capped at capacity)
  tokens = math.min(capacity, tokens + tokensToAdd)

  -- Update last refill time if tokens were added
  if tokensToAdd > 0 then
    lastRefill = now - (elapsed % refillIntervalMs)
  end

  -- Check if we can consume tokens
  local allowed = 0
  local retryAfterMs = 0

  if tokens >= tokensRequested then
    tokens = tokens - tokensRequested
    allowed = 1
  else
    -- Calculate time until enough tokens are available
    local tokensNeeded = tokensRequested - tokens
    retryAfterMs = math.ceil(tokensNeeded / refillRate) * refillIntervalMs
  end

  -- Save state with TTL (capacity * refillIntervalMs * 2 to handle inactivity)
  local ttl = math.ceil((capacity / refillRate) * refillIntervalMs * 2 / 1000)
  redis.call('HMSET', key, 'tokens', tokens, 'lastRefill', lastRefill)
  redis.call('EXPIRE', key, ttl)

  return {allowed, tokens, retryAfterMs}
`;

// ============================================================================
// Errors
// ============================================================================

/**
 * Base rate limiter error.
 */
export class RateLimiterError extends Error {
  public readonly code: string;

  constructor(message: string, code: string = 'RATE_LIMITER_ERROR') {
    super(message);
    this.name = 'RateLimiterError';
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): { error: string; code: string; message: string } {
    return {
      error: this.name,
      code: this.code,
      message: this.message,
    };
  }
}

/**
 * Error thrown when rate limit is exceeded.
 */
export class RateLimitExceededError extends RateLimiterError {
  public readonly retryAfterMs: number;
  public readonly remaining: number;

  constructor(message: string, retryAfterMs: number, remaining: number = 0) {
    super(message, 'RATE_LIMIT_EXCEEDED');
    this.name = 'RateLimitExceededError';
    this.retryAfterMs = retryAfterMs;
    this.remaining = remaining;
  }

  toJSON(): { error: string; code: string; message: string; retryAfterMs: number; remaining: number } {
    return {
      ...super.toJSON(),
      retryAfterMs: this.retryAfterMs,
      remaining: this.remaining,
    };
  }
}

/**
 * Error thrown when waiting for tokens times out.
 */
export class WaitTimeoutError extends RateLimiterError {
  public readonly waitedMs: number;

  constructor(message: string, waitedMs: number) {
    super(message, 'WAIT_TIMEOUT');
    this.name = 'WaitTimeoutError';
    this.waitedMs = waitedMs;
  }
}

// ============================================================================
// In-Memory Token Bucket
// ============================================================================

/**
 * In-memory token bucket state.
 */
interface TokenBucketState {
  tokens: number;
  lastRefill: number;
  stats: RateLimiterStats;
}

/**
 * In-memory token bucket implementation.
 * Suitable for single-instance deployments.
 */
export class InMemoryTokenBucket {
  private readonly config: RateLimiterConfig;
  private readonly buckets: Map<string, TokenBucketState> = new Map();

  constructor(rateLimiterConfig: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...rateLimiterConfig };
  }

  /**
   * Get or create a bucket for a key.
   */
  private getBucket(key: string): TokenBucketState {
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = {
        tokens: this.config.capacity,
        lastRefill: Date.now(),
        stats: {
          totalRequests: 0,
          allowedRequests: 0,
          deniedRequests: 0,
          currentTokens: this.config.capacity,
          lastRefillTime: Date.now(),
        },
      };
      this.buckets.set(key, bucket);
    }

    return bucket;
  }

  /**
   * Refill tokens based on elapsed time.
   */
  private refillTokens(bucket: TokenBucketState): void {
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    const tokensToAdd = Math.floor(elapsed / this.config.refillIntervalMs) * this.config.refillRate;

    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(this.config.capacity, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now - (elapsed % this.config.refillIntervalMs);
      bucket.stats.lastRefillTime = bucket.lastRefill;
    }

    bucket.stats.currentTokens = bucket.tokens;
  }

  /**
   * Attempt to consume tokens from the bucket.
   */
  consume(key: string, options: ConsumeOptions = {}): ConsumeResult {
    const { tokens: tokensRequested = 1 } = options;
    const bucket = this.getBucket(key);

    // Refill tokens first
    this.refillTokens(bucket);

    // Update stats
    bucket.stats.totalRequests++;

    // Check if we can consume
    if (bucket.tokens >= tokensRequested) {
      bucket.tokens -= tokensRequested;
      bucket.stats.allowedRequests++;
      bucket.stats.currentTokens = bucket.tokens;

      return {
        allowed: true,
        remaining: bucket.tokens,
        retryAfterMs: 0,
        capacity: this.config.capacity,
        consumed: tokensRequested,
      };
    }

    // Calculate retry time
    const tokensNeeded = tokensRequested - bucket.tokens;
    const retryAfterMs = Math.ceil(tokensNeeded / this.config.refillRate) * this.config.refillIntervalMs;

    bucket.stats.deniedRequests++;

    return {
      allowed: false,
      remaining: bucket.tokens,
      retryAfterMs,
      capacity: this.config.capacity,
      consumed: 0,
    };
  }

  /**
   * Get the current token count for a key.
   */
  getTokens(key: string): number {
    const bucket = this.getBucket(key);
    this.refillTokens(bucket);
    return bucket.tokens;
  }

  /**
   * Get statistics for a key.
   */
  getStats(key: string): RateLimiterStats {
    const bucket = this.getBucket(key);
    this.refillTokens(bucket);
    return { ...bucket.stats };
  }

  /**
   * Reset a bucket to full capacity.
   */
  reset(key: string): void {
    const bucket = this.getBucket(key);
    bucket.tokens = this.config.capacity;
    bucket.lastRefill = Date.now();
    bucket.stats.currentTokens = this.config.capacity;
    bucket.stats.lastRefillTime = bucket.lastRefill;
  }

  /**
   * Clear all buckets.
   */
  clear(): void {
    this.buckets.clear();
  }

  /**
   * Get the configuration.
   */
  getConfig(): RateLimiterConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Redis-Backed Token Bucket
// ============================================================================

/**
 * Redis-backed token bucket implementation.
 * Suitable for distributed deployments with multiple instances.
 */
export class RedisTokenBucket {
  private readonly config: RateLimiterConfig;
  private readonly keyPrefix: string;

  constructor(rateLimiterConfig: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...rateLimiterConfig };
    this.keyPrefix = `${REDIS_KEY_PREFIX}${this.config.keyPrefix || 'default'}:`;
  }

  /**
   * Build a Redis key for a bucket.
   */
  private buildKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  /**
   * Attempt to consume tokens from the bucket.
   */
  async consume(key: string, options: ConsumeOptions = {}): Promise<ConsumeResult> {
    const { tokens: tokensRequested = 1 } = options;
    const redis = getRedisClient();
    const redisKey = this.buildKey(key);
    const now = Date.now();

    try {
      const result = await redis.eval(
        CONSUME_TOKENS_SCRIPT,
        1,
        redisKey,
        this.config.capacity.toString(),
        this.config.refillRate.toString(),
        this.config.refillIntervalMs.toString(),
        tokensRequested.toString(),
        now.toString()
      ) as [number, number, number];

      const [allowed, remaining, retryAfterMs] = result;

      return {
        allowed: allowed === 1,
        remaining,
        retryAfterMs,
        capacity: this.config.capacity,
        consumed: allowed === 1 ? tokensRequested : 0,
      };
    } catch (error) {
      // Log error but fail open (allow request) to prevent blocking on Redis issues
      console.error('[RateLimiter] Redis error during consume', {
        key: redisKey,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Fail open - allow the request if Redis is unavailable
      return {
        allowed: true,
        remaining: this.config.capacity,
        retryAfterMs: 0,
        capacity: this.config.capacity,
        consumed: tokensRequested,
      };
    }
  }

  /**
   * Get the current token count for a key.
   */
  async getTokens(key: string): Promise<number> {
    const redis = getRedisClient();
    const redisKey = this.buildKey(key);

    try {
      const result = await redis.hget(redisKey, 'tokens');
      return result ? parseFloat(result) : this.config.capacity;
    } catch (error) {
      console.error('[RateLimiter] Redis error during getTokens', {
        key: redisKey,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return this.config.capacity;
    }
  }

  /**
   * Reset a bucket to full capacity.
   */
  async reset(key: string): Promise<void> {
    const redis = getRedisClient();
    const redisKey = this.buildKey(key);

    try {
      await redis.del(redisKey);
    } catch (error) {
      console.error('[RateLimiter] Redis error during reset', {
        key: redisKey,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get the configuration.
   */
  getConfig(): RateLimiterConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Provider Rate Limiter
// ============================================================================

/**
 * Rate limiter for cloud storage providers.
 * Manages rate limiting per provider and user combination.
 */
export class ProviderRateLimiter {
  private readonly limiters: Map<ProviderType, RedisTokenBucket | InMemoryTokenBucket> = new Map();
  private readonly useRedis: boolean;

  constructor(useRedis: boolean = true) {
    this.useRedis = useRedis && config.RATE_LIMIT_ENABLED;
    this.initializeLimiters();
  }

  /**
   * Initialize rate limiters for all providers.
   */
  private initializeLimiters(): void {
    for (const [provider, limits] of Object.entries(PROVIDER_RATE_LIMITS)) {
      const rateLimiterConfig: RateLimiterConfig = {
        capacity: limits.burstCapacity ?? limits.requestsPerMinute,
        refillRate: Math.ceil(limits.requestsPerMinute / 60), // Per second
        refillIntervalMs: 1000,
        keyPrefix: provider,
      };

      const limiter = this.useRedis
        ? new RedisTokenBucket(rateLimiterConfig)
        : new InMemoryTokenBucket(rateLimiterConfig);

      this.limiters.set(provider as ProviderType, limiter);
    }
  }

  /**
   * Get the limiter for a provider.
   */
  private getLimiter(provider: ProviderType): RedisTokenBucket | InMemoryTokenBucket {
    const limiter = this.limiters.get(provider) || this.limiters.get('default');
    if (!limiter) {
      throw new RateLimiterError(`No rate limiter configured for provider: ${provider}`);
    }
    return limiter;
  }

  /**
   * Build a rate limit key for a provider and user.
   */
  private buildKey(provider: ProviderType, userId: string): string {
    return `${provider}:${userId}`;
  }

  /**
   * Attempt to consume tokens for a provider request.
   */
  async consume(
    provider: ProviderType,
    userId: string,
    options: ConsumeOptions = {}
  ): Promise<ConsumeResult> {
    // If rate limiting is disabled, always allow
    if (!config.RATE_LIMIT_ENABLED) {
      return {
        allowed: true,
        remaining: Infinity,
        retryAfterMs: 0,
        capacity: Infinity,
        consumed: options.tokens ?? 1,
      };
    }

    const limiter = this.getLimiter(provider);
    const key = this.buildKey(provider, userId);

    if (limiter instanceof RedisTokenBucket) {
      return await limiter.consume(key, options);
    }

    return limiter.consume(key, options);
  }

  /**
   * Consume tokens or wait until they're available.
   */
  async consumeOrWait(
    provider: ProviderType,
    userId: string,
    options: ConsumeOptions = {}
  ): Promise<ConsumeResult> {
    const { waitTimeoutMs = 30000, tokens = 1 } = options;
    const startTime = Date.now();

    while (true) {
      const result = await this.consume(provider, userId, { tokens });

      if (result.allowed) {
        return result;
      }

      const elapsed = Date.now() - startTime;
      const remainingWait = waitTimeoutMs - elapsed;

      if (remainingWait <= 0) {
        throw new WaitTimeoutError(
          `Timeout waiting for rate limit tokens after ${elapsed}ms`,
          elapsed
        );
      }

      // Wait for the shorter of retry time or remaining timeout
      const waitTime = Math.min(result.retryAfterMs, remainingWait);

      // Add small jitter to prevent thundering herd
      const jitter = Math.random() * 100;

      await sleep(waitTime + jitter);
    }
  }

  /**
   * Check if a request would be allowed without consuming tokens.
   */
  async canConsume(
    provider: ProviderType,
    userId: string,
    tokens: number = 1
  ): Promise<boolean> {
    if (!config.RATE_LIMIT_ENABLED) {
      return true;
    }

    const limiter = this.getLimiter(provider);
    const key = this.buildKey(provider, userId);

    if (limiter instanceof RedisTokenBucket) {
      const currentTokens = await limiter.getTokens(key);
      return currentTokens >= tokens;
    }

    return limiter.getTokens(key) >= tokens;
  }

  /**
   * Get remaining tokens for a provider and user.
   */
  async getRemaining(provider: ProviderType, userId: string): Promise<number> {
    if (!config.RATE_LIMIT_ENABLED) {
      return Infinity;
    }

    const limiter = this.getLimiter(provider);
    const key = this.buildKey(provider, userId);

    if (limiter instanceof RedisTokenBucket) {
      return await limiter.getTokens(key);
    }

    return limiter.getTokens(key);
  }

  /**
   * Reset rate limit for a provider and user.
   */
  async reset(provider: ProviderType, userId: string): Promise<void> {
    const limiter = this.getLimiter(provider);
    const key = this.buildKey(provider, userId);

    if (limiter instanceof RedisTokenBucket) {
      await limiter.reset(key);
    } else {
      limiter.reset(key);
    }
  }

  /**
   * Get the rate limit configuration for a provider.
   */
  getProviderLimits(provider: ProviderType): ProviderRateLimitConfig {
    return PROVIDER_RATE_LIMITS[provider] || PROVIDER_RATE_LIMITS.default;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Sleep for a specified duration.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a rate limiter configuration from requests per minute.
 */
export function createConfigFromRpm(
  requestsPerMinute: number,
  burstCapacity?: number
): RateLimiterConfig {
  return {
    capacity: burstCapacity ?? requestsPerMinute,
    refillRate: Math.ceil(requestsPerMinute / 60),
    refillIntervalMs: 1000,
  };
}

/**
 * Create a rate limiter configuration from requests per second.
 */
export function createConfigFromRps(
  requestsPerSecond: number,
  burstCapacity?: number
): RateLimiterConfig {
  return {
    capacity: burstCapacity ?? requestsPerSecond * 10, // 10 second burst
    refillRate: requestsPerSecond,
    refillIntervalMs: 1000,
  };
}

// ============================================================================
// Singleton Instance
// ============================================================================

let providerRateLimiter: ProviderRateLimiter | null = null;

/**
 * Get the singleton provider rate limiter instance.
 */
export function getProviderRateLimiter(): ProviderRateLimiter {
  if (!providerRateLimiter) {
    providerRateLimiter = new ProviderRateLimiter(true);
  }
  return providerRateLimiter;
}

/**
 * Reset the singleton instance (for testing).
 */
export function resetProviderRateLimiter(): void {
  providerRateLimiter = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Consume tokens for a provider request using the singleton limiter.
 */
export async function consumeRateLimit(
  provider: ProviderType,
  userId: string,
  options: ConsumeOptions = {}
): Promise<ConsumeResult> {
  return getProviderRateLimiter().consume(provider, userId, options);
}

/**
 * Consume tokens or wait using the singleton limiter.
 */
export async function consumeRateLimitOrWait(
  provider: ProviderType,
  userId: string,
  options: ConsumeOptions = {}
): Promise<ConsumeResult> {
  return getProviderRateLimiter().consumeOrWait(provider, userId, options);
}

/**
 * Check if a request can be made without exceeding rate limits.
 */
export async function canMakeRequest(
  provider: ProviderType,
  userId: string,
  tokens: number = 1
): Promise<boolean> {
  return getProviderRateLimiter().canConsume(provider, userId, tokens);
}

/**
 * Get remaining rate limit tokens for a provider and user.
 */
export async function getRemainingRateLimit(
  provider: ProviderType,
  userId: string
): Promise<number> {
  return getProviderRateLimiter().getRemaining(provider, userId);
}

/**
 * Reset rate limit for a provider and user.
 */
export async function resetRateLimit(
  provider: ProviderType,
  userId: string
): Promise<void> {
  return getProviderRateLimiter().reset(provider, userId);
}

// ============================================================================
// Module Exports
// ============================================================================

export default {
  // Classes
  InMemoryTokenBucket,
  RedisTokenBucket,
  ProviderRateLimiter,

  // Errors
  RateLimiterError,
  RateLimitExceededError,
  WaitTimeoutError,

  // Singleton
  getProviderRateLimiter,
  resetProviderRateLimiter,

  // Convenience functions
  consumeRateLimit,
  consumeRateLimitOrWait,
  canMakeRequest,
  getRemainingRateLimit,
  resetRateLimit,

  // Configuration helpers
  createConfigFromRpm,
  createConfigFromRps,

  // Constants
  DEFAULT_CONFIG,
  PROVIDER_RATE_LIMITS,
};
