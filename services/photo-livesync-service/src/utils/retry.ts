/**
 * Exponential Backoff Retry Utility.
 *
 * Provides robust retry logic with exponential backoff for handling transient
 * failures when communicating with cloud storage providers (Google Photos,
 * Dropbox, OneDrive, etc.).
 *
 * Features:
 * - Exponential backoff with configurable base delay and multiplier
 * - Jitter (randomization) to prevent thundering herd problems
 * - Configurable maximum retries and maximum delay cap
 * - Custom retry conditions based on error type
 * - Abort signal support for cancellation
 * - Detailed retry statistics and event callbacks
 * - Support for both sync and async operations
 *
 * Algorithm:
 * delay = min(maxDelay, baseDelay * (multiplier ^ attempt)) + jitter
 *
 * @module utils/retry
 */

import { config } from '../config/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Retry configuration options.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: from config.SYNC_MAX_RETRIES) */
  maxRetries: number;
  /** Base delay in milliseconds before first retry (default: from config.SYNC_RETRY_DELAY_MS) */
  baseDelayMs: number;
  /** Multiplier for exponential backoff (default: 2) */
  multiplier: number;
  /** Maximum delay cap in milliseconds (default: 60000) */
  maxDelayMs: number;
  /** Enable jitter to randomize delays (default: true) */
  jitter: boolean;
  /** Jitter factor - max random addition as fraction of delay (default: 0.25) */
  jitterFactor: number;
}

/**
 * Options for individual retry operations.
 */
export interface RetryOptions extends Partial<RetryConfig> {
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
  /** Function to determine if an error is retryable (default: all errors are retryable) */
  shouldRetry?: (error: Error, attempt: number) => boolean | Promise<boolean>;
  /** Callback invoked before each retry attempt */
  onRetry?: (error: Error, attempt: number, delayMs: number) => void | Promise<void>;
  /** Callback invoked when all retries are exhausted */
  onExhausted?: (error: Error, attempts: number) => void | Promise<void>;
  /** Operation name for logging/debugging */
  operationName?: string;
  /** Custom delay function to override exponential backoff */
  getDelay?: (attempt: number, config: RetryConfig) => number;
}

/**
 * Result of a retry operation with statistics.
 */
export interface RetryResult<T> {
  /** The result value if successful */
  value: T;
  /** Number of attempts made (1 = succeeded on first try) */
  attempts: number;
  /** Total time spent including delays in milliseconds */
  totalTimeMs: number;
  /** Array of delays between attempts in milliseconds */
  delays: number[];
  /** Whether any retries were needed */
  retried: boolean;
}

/**
 * Retry statistics for monitoring.
 */
export interface RetryStats {
  /** Total number of operations attempted */
  totalOperations: number;
  /** Number of operations that succeeded on first try */
  immediateSuccesses: number;
  /** Number of operations that succeeded after retries */
  retriedSuccesses: number;
  /** Number of operations that failed after all retries */
  failures: number;
  /** Total number of retry attempts across all operations */
  totalRetryAttempts: number;
  /** Average number of retries per operation */
  averageRetries: number;
  /** Last error encountered (if any) */
  lastError?: Error;
}

/**
 * Context passed to retry callbacks.
 */
export interface RetryContext {
  /** Current attempt number (1-based) */
  attempt: number;
  /** Maximum attempts allowed */
  maxAttempts: number;
  /** The error from the current attempt */
  error: Error;
  /** Delay before next retry in milliseconds */
  nextDelayMs: number;
  /** Time elapsed since first attempt in milliseconds */
  elapsedMs: number;
  /** Whether this is the last attempt */
  isLastAttempt: boolean;
  /** Operation name if provided */
  operationName?: string;
}

/**
 * HTTP-like error with status code for conditional retry logic.
 */
export interface HttpLikeError extends Error {
  status?: number;
  statusCode?: number;
  code?: string;
  response?: {
    status?: number;
    statusCode?: number;
  };
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default retry configuration.
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: config.SYNC_MAX_RETRIES,
  baseDelayMs: config.SYNC_RETRY_DELAY_MS,
  multiplier: 2,
  maxDelayMs: 60000,
  jitter: true,
  jitterFactor: 0.25,
};

/**
 * HTTP status codes that are typically retryable.
 */
export const RETRYABLE_STATUS_CODES = new Set([
  408, // Request Timeout
  429, // Too Many Requests (Rate Limited)
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
]);

/**
 * Error codes that typically indicate transient failures.
 */
export const RETRYABLE_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ECONNABORTED',
  'ETIMEDOUT',
  'EPIPE',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EADDRNOTAVAIL',
  'ESOCKETTIMEDOUT',
  'ERR_SOCKET_CONNECTION_TIMEOUT',
]);

/**
 * Error messages that typically indicate transient failures.
 */
export const RETRYABLE_ERROR_MESSAGES = [
  'network error',
  'timeout',
  'socket hang up',
  'ECONNRESET',
  'ETIMEDOUT',
  'rate limit',
  'too many requests',
  'service unavailable',
  'temporarily unavailable',
  'try again',
  'retry later',
];

// ============================================================================
// Errors
// ============================================================================

/**
 * Base retry error class.
 */
export class RetryError extends Error {
  /** Machine-readable error code */
  public readonly code: string;

  constructor(message: string, code: string = 'RETRY_ERROR') {
    super(message);
    this.name = 'RetryError';
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert error to JSON-serializable object.
   */
  toJSON(): { error: string; code: string; message: string } {
    return {
      error: this.name,
      code: this.code,
      message: this.message,
    };
  }
}

/**
 * Error thrown when all retry attempts are exhausted.
 */
export class RetriesExhaustedError extends RetryError {
  /** The original error that caused the failure */
  public readonly cause: Error;
  /** Number of attempts made */
  public readonly attempts: number;
  /** Total time spent retrying in milliseconds */
  public readonly totalTimeMs: number;
  /** Name of the operation that failed */
  public readonly operationName?: string;

  constructor(
    cause: Error,
    attempts: number,
    totalTimeMs: number,
    operationName?: string
  ) {
    const opName = operationName ? ` "${operationName}"` : '';
    super(
      `Operation${opName} failed after ${attempts} attempts over ${totalTimeMs}ms: ${cause.message}`,
      'RETRIES_EXHAUSTED'
    );
    this.name = 'RetriesExhaustedError';
    this.cause = cause;
    this.attempts = attempts;
    this.totalTimeMs = totalTimeMs;
    this.operationName = operationName;
  }

  toJSON(): {
    error: string;
    code: string;
    message: string;
    attempts: number;
    totalTimeMs: number;
    operationName?: string;
    cause: string;
  } {
    return {
      ...super.toJSON(),
      attempts: this.attempts,
      totalTimeMs: this.totalTimeMs,
      operationName: this.operationName,
      cause: this.cause.message,
    };
  }
}

/**
 * Error thrown when a retry operation is aborted.
 */
export class RetryAbortedError extends RetryError {
  /** Number of attempts made before abortion */
  public readonly attempts: number;

  constructor(attempts: number, operationName?: string) {
    const opName = operationName ? ` "${operationName}"` : '';
    super(`Operation${opName} aborted after ${attempts} attempts`, 'RETRY_ABORTED');
    this.name = 'RetryAbortedError';
    this.attempts = attempts;
  }
}

/**
 * Error thrown when the operation itself is not retryable.
 */
export class NonRetryableError extends RetryError {
  /** The original error */
  public readonly cause: Error;

  constructor(cause: Error) {
    super(`Non-retryable error: ${cause.message}`, 'NON_RETRYABLE');
    this.name = 'NonRetryableError';
    this.cause = cause;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Sleep for a specified duration with abort signal support.
 *
 * @param ms - Duration to sleep in milliseconds
 * @param abortSignal - Optional abort signal for cancellation
 * @returns Promise that resolves after the delay or rejects if aborted
 */
export function sleep(ms: number, abortSignal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (abortSignal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const timeoutId = setTimeout(resolve, ms);

    if (abortSignal) {
      const abortHandler = () => {
        clearTimeout(timeoutId);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      abortSignal.addEventListener('abort', abortHandler, { once: true });
    }
  });
}

/**
 * Calculate the delay for a given attempt using exponential backoff.
 *
 * @param attempt - The current attempt number (0-based)
 * @param retryConfig - Retry configuration
 * @returns Delay in milliseconds
 */
export function calculateDelay(attempt: number, retryConfig: RetryConfig): number {
  // Exponential backoff: baseDelay * (multiplier ^ attempt)
  const exponentialDelay = retryConfig.baseDelayMs * Math.pow(retryConfig.multiplier, attempt);

  // Cap at maximum delay
  let delay = Math.min(exponentialDelay, retryConfig.maxDelayMs);

  // Add jitter if enabled
  if (retryConfig.jitter) {
    const jitter = delay * retryConfig.jitterFactor * Math.random();
    delay = delay + jitter;
  }

  return Math.floor(delay);
}

/**
 * Extract HTTP status code from various error formats.
 *
 * @param error - The error to extract status from
 * @returns HTTP status code or undefined
 */
export function extractStatusCode(error: HttpLikeError): number | undefined {
  return (
    error.status ??
    error.statusCode ??
    error.response?.status ??
    error.response?.statusCode
  );
}

/**
 * Determine if an error is retryable based on common patterns.
 *
 * This function checks:
 * - HTTP status codes (429, 5xx)
 * - Network error codes (ECONNRESET, ETIMEDOUT, etc.)
 * - Error messages containing retry-related keywords
 *
 * @param error - The error to check
 * @returns true if the error is retryable
 */
export function isRetryableError(error: Error): boolean {
  const httpError = error as HttpLikeError;

  // Check HTTP status codes
  const statusCode = extractStatusCode(httpError);
  if (statusCode !== undefined && RETRYABLE_STATUS_CODES.has(statusCode)) {
    return true;
  }

  // Check error codes
  if (httpError.code && RETRYABLE_ERROR_CODES.has(httpError.code)) {
    return true;
  }

  // Check error message for retry-related keywords
  const lowerMessage = error.message.toLowerCase();
  if (RETRYABLE_ERROR_MESSAGES.some((msg) => lowerMessage.includes(msg))) {
    return true;
  }

  // Check if status indicates permanent failure (4xx except 408, 429)
  if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
    return false;
  }

  // Default: treat unknown errors as potentially retryable
  return true;
}

/**
 * Extract retry-after header value from error if available.
 *
 * @param error - The error to extract retry-after from
 * @returns Retry-after value in milliseconds or undefined
 */
export function extractRetryAfter(error: HttpLikeError): number | undefined {
  const response = (error as { response?: { headers?: Record<string, string> } }).response;
  const retryAfter = response?.headers?.['retry-after'];

  if (!retryAfter) {
    return undefined;
  }

  // Check if it's a number (seconds)
  const seconds = parseInt(retryAfter, 10);
  if (!isNaN(seconds)) {
    return seconds * 1000;
  }

  // Check if it's a date
  const date = new Date(retryAfter);
  if (!isNaN(date.getTime())) {
    return Math.max(0, date.getTime() - Date.now());
  }

  return undefined;
}

// ============================================================================
// Main Retry Function
// ============================================================================

/**
 * Execute a function with exponential backoff retry logic.
 *
 * @template T - The return type of the operation
 * @param fn - The async function to execute
 * @param options - Retry options
 * @returns Promise resolving to RetryResult with value and statistics
 * @throws {RetriesExhaustedError} When all retries are exhausted
 * @throws {RetryAbortedError} When the operation is aborted
 * @throws {NonRetryableError} When shouldRetry returns false
 *
 * @example
 * ```ts
 * // Basic usage with defaults
 * const result = await retry(() => fetchData());
 *
 * // Custom configuration
 * const result = await retry(
 *   () => apiCall(),
 *   {
 *     maxRetries: 3,
 *     baseDelayMs: 1000,
 *     shouldRetry: (error) => error.status === 429,
 *     onRetry: (error, attempt) => console.log(`Retry ${attempt}`)
 *   }
 * );
 *
 * // With abort signal
 * const controller = new AbortController();
 * const result = await retry(
 *   () => longOperation(),
 *   { abortSignal: controller.signal }
 * );
 * ```
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const retryConfig: RetryConfig = {
    maxRetries: options.maxRetries ?? DEFAULT_RETRY_CONFIG.maxRetries,
    baseDelayMs: options.baseDelayMs ?? DEFAULT_RETRY_CONFIG.baseDelayMs,
    multiplier: options.multiplier ?? DEFAULT_RETRY_CONFIG.multiplier,
    maxDelayMs: options.maxDelayMs ?? DEFAULT_RETRY_CONFIG.maxDelayMs,
    jitter: options.jitter ?? DEFAULT_RETRY_CONFIG.jitter,
    jitterFactor: options.jitterFactor ?? DEFAULT_RETRY_CONFIG.jitterFactor,
  };

  const { abortSignal, shouldRetry, onRetry, onExhausted, operationName, getDelay } = options;

  const startTime = Date.now();
  const delays: number[] = [];
  let lastError: Error | null = null;

  // maxAttempts = initial attempt + retries
  const maxAttempts = retryConfig.maxRetries + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Check for abort before each attempt
    if (abortSignal?.aborted) {
      throw new RetryAbortedError(attempt - 1, operationName);
    }

    try {
      const value = await fn();

      return {
        value,
        attempts: attempt,
        totalTimeMs: Date.now() - startTime,
        delays,
        retried: attempt > 1,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if this is the last attempt
      if (attempt === maxAttempts) {
        break;
      }

      // Check if error is retryable
      const canRetry = shouldRetry
        ? await shouldRetry(lastError, attempt)
        : isRetryableError(lastError);

      if (!canRetry) {
        throw new NonRetryableError(lastError);
      }

      // Calculate delay (check for Retry-After header first)
      const retryAfterMs = extractRetryAfter(lastError as HttpLikeError);
      let delayMs: number;

      if (retryAfterMs !== undefined) {
        // Use Retry-After header if available, but cap at maxDelayMs
        delayMs = Math.min(retryAfterMs, retryConfig.maxDelayMs);
      } else if (getDelay) {
        // Use custom delay function
        delayMs = getDelay(attempt - 1, retryConfig);
      } else {
        // Use exponential backoff
        delayMs = calculateDelay(attempt - 1, retryConfig);
      }

      delays.push(delayMs);

      // Invoke onRetry callback
      if (onRetry) {
        await onRetry(lastError, attempt, delayMs);
      }

      // Wait before next attempt
      try {
        await sleep(delayMs, abortSignal);
      } catch (abortError) {
        if ((abortError as Error).name === 'AbortError') {
          throw new RetryAbortedError(attempt, operationName);
        }
        throw abortError;
      }
    }
  }

  // All retries exhausted
  const totalTimeMs = Date.now() - startTime;

  if (onExhausted) {
    await onExhausted(lastError!, maxAttempts);
  }

  throw new RetriesExhaustedError(lastError!, maxAttempts, totalTimeMs, operationName);
}

/**
 * Wrap a function to automatically retry on failure.
 *
 * Creates a new function that will retry the original function on failure
 * using the provided options.
 *
 * @template T - Arguments type
 * @template R - Return type
 * @param fn - The async function to wrap
 * @param options - Retry options
 * @returns Wrapped function that retries on failure
 *
 * @example
 * ```ts
 * const fetchWithRetry = withRetry(
 *   async (url: string) => fetch(url),
 *   { maxRetries: 3 }
 * );
 *
 * const response = await fetchWithRetry('https://api.example.com/data');
 * ```
 */
export function withRetry<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
  options: RetryOptions = {}
): (...args: T) => Promise<RetryResult<R>> {
  return (...args: T) => retry(() => fn(...args), options);
}

/**
 * Execute a function with a simple retry (no exponential backoff).
 *
 * Uses a fixed delay between retries. Useful when you don't want
 * the delay to increase exponentially.
 *
 * @template T - The return type of the operation
 * @param fn - The async function to execute
 * @param options - Retry options (baseDelayMs is used as fixed delay)
 * @returns Promise resolving to RetryResult
 */
export async function retryWithFixedDelay<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  return retry(fn, {
    ...options,
    multiplier: 1, // No exponential growth
    jitter: false, // No jitter for fixed delay
  });
}

/**
 * Execute a function with linear backoff.
 *
 * Delay increases linearly: baseDelay * attempt
 *
 * @template T - The return type of the operation
 * @param fn - The async function to execute
 * @param options - Retry options
 * @returns Promise resolving to RetryResult
 */
export async function retryWithLinearBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  return retry(fn, {
    ...options,
    getDelay: (attempt, config) => {
      const linearDelay = config.baseDelayMs * (attempt + 1);
      let delay = Math.min(linearDelay, config.maxDelayMs);

      if (config.jitter) {
        delay += delay * config.jitterFactor * Math.random();
      }

      return Math.floor(delay);
    },
  });
}

// ============================================================================
// Retry Tracker (for monitoring/metrics)
// ============================================================================

/**
 * Tracks retry statistics across multiple operations.
 *
 * Useful for monitoring retry patterns and identifying problematic operations.
 *
 * @example
 * ```ts
 * const tracker = new RetryTracker();
 *
 * // Track operations
 * await tracker.track(() => apiCall());
 *
 * // Get statistics
 * const stats = tracker.getStats();
 * console.log(`Success rate: ${stats.immediateSuccesses / stats.totalOperations}`);
 * ```
 */
export class RetryTracker {
  private stats: RetryStats = {
    totalOperations: 0,
    immediateSuccesses: 0,
    retriedSuccesses: 0,
    failures: 0,
    totalRetryAttempts: 0,
    averageRetries: 0,
  };

  /**
   * Execute and track a retry operation.
   *
   * @template T - The return type of the operation
   * @param fn - The async function to execute
   * @param options - Retry options
   * @returns Promise resolving to RetryResult
   */
  async track<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<RetryResult<T>> {
    this.stats.totalOperations++;

    try {
      const result = await retry(fn, options);

      if (result.attempts === 1) {
        this.stats.immediateSuccesses++;
      } else {
        this.stats.retriedSuccesses++;
        this.stats.totalRetryAttempts += result.attempts - 1;
      }

      this.updateAverageRetries();
      return result;
    } catch (error) {
      this.stats.failures++;

      if (error instanceof RetriesExhaustedError) {
        this.stats.totalRetryAttempts += error.attempts - 1;
        this.stats.lastError = error.cause;
      } else if (error instanceof Error) {
        this.stats.lastError = error;
      }

      this.updateAverageRetries();
      throw error;
    }
  }

  /**
   * Update the average retries calculation.
   */
  private updateAverageRetries(): void {
    const totalWithRetries = this.stats.retriedSuccesses + this.stats.failures;
    this.stats.averageRetries =
      totalWithRetries > 0 ? this.stats.totalRetryAttempts / totalWithRetries : 0;
  }

  /**
   * Get the current retry statistics.
   */
  getStats(): RetryStats {
    return { ...this.stats };
  }

  /**
   * Reset all statistics.
   */
  reset(): void {
    this.stats = {
      totalOperations: 0,
      immediateSuccesses: 0,
      retriedSuccesses: 0,
      failures: 0,
      totalRetryAttempts: 0,
      averageRetries: 0,
    };
  }

  /**
   * Get the success rate (operations that didn't fail after all retries).
   */
  getSuccessRate(): number {
    if (this.stats.totalOperations === 0) {
      return 1;
    }
    return (
      (this.stats.immediateSuccesses + this.stats.retriedSuccesses) /
      this.stats.totalOperations
    );
  }

  /**
   * Get the first-attempt success rate.
   */
  getFirstAttemptSuccessRate(): number {
    if (this.stats.totalOperations === 0) {
      return 1;
    }
    return this.stats.immediateSuccesses / this.stats.totalOperations;
  }
}

// ============================================================================
// Predefined Retry Strategies
// ============================================================================

/**
 * Create retry options for API rate limiting scenarios.
 *
 * Uses aggressive backoff with high jitter to handle rate limits.
 *
 * @param baseOptions - Additional options to merge
 * @returns RetryOptions configured for rate limiting
 */
export function createRateLimitRetryOptions(
  baseOptions: Partial<RetryOptions> = {}
): RetryOptions {
  return {
    maxRetries: 5,
    baseDelayMs: 1000,
    multiplier: 2,
    maxDelayMs: 120000, // 2 minutes max
    jitter: true,
    jitterFactor: 0.5, // High jitter to spread out retries
    shouldRetry: (error) => {
      const statusCode = extractStatusCode(error as HttpLikeError);
      return statusCode === 429 || statusCode === 503;
    },
    ...baseOptions,
  };
}

/**
 * Create retry options for network-related failures.
 *
 * Configured for transient network issues with moderate backoff.
 *
 * @param baseOptions - Additional options to merge
 * @returns RetryOptions configured for network failures
 */
export function createNetworkRetryOptions(
  baseOptions: Partial<RetryOptions> = {}
): RetryOptions {
  return {
    maxRetries: 3,
    baseDelayMs: 500,
    multiplier: 2,
    maxDelayMs: 10000,
    jitter: true,
    jitterFactor: 0.25,
    shouldRetry: (error) => {
      const httpError = error as HttpLikeError;
      if (httpError.code && RETRYABLE_ERROR_CODES.has(httpError.code)) {
        return true;
      }
      const statusCode = extractStatusCode(httpError);
      return statusCode !== undefined && statusCode >= 500;
    },
    ...baseOptions,
  };
}

/**
 * Create retry options for database operations.
 *
 * Configured for connection issues and deadlocks.
 *
 * @param baseOptions - Additional options to merge
 * @returns RetryOptions configured for database operations
 */
export function createDatabaseRetryOptions(
  baseOptions: Partial<RetryOptions> = {}
): RetryOptions {
  return {
    maxRetries: 3,
    baseDelayMs: 100,
    multiplier: 2,
    maxDelayMs: 5000,
    jitter: true,
    jitterFactor: 0.2,
    shouldRetry: (error) => {
      const message = error.message.toLowerCase();
      return (
        message.includes('deadlock') ||
        message.includes('connection') ||
        message.includes('timeout') ||
        message.includes('too many connections')
      );
    },
    ...baseOptions,
  };
}

/**
 * Create retry options for OAuth token refresh operations.
 *
 * Conservative retries to avoid hammering auth servers.
 *
 * @param baseOptions - Additional options to merge
 * @returns RetryOptions configured for OAuth operations
 */
export function createOAuthRetryOptions(
  baseOptions: Partial<RetryOptions> = {}
): RetryOptions {
  return {
    maxRetries: 2,
    baseDelayMs: 1000,
    multiplier: 2,
    maxDelayMs: 5000,
    jitter: true,
    jitterFactor: 0.1,
    shouldRetry: (error) => {
      const statusCode = extractStatusCode(error as HttpLikeError);
      // Don't retry 401 (invalid credentials) or 403 (forbidden)
      if (statusCode === 401 || statusCode === 403) {
        return false;
      }
      // Retry server errors and rate limits
      return (
        statusCode === 429 ||
        statusCode === 500 ||
        statusCode === 502 ||
        statusCode === 503 ||
        statusCode === 504
      );
    },
    ...baseOptions,
  };
}

// ============================================================================
// Singleton Tracker Instance
// ============================================================================

let globalRetryTracker: RetryTracker | null = null;

/**
 * Get the global retry tracker instance.
 */
export function getGlobalRetryTracker(): RetryTracker {
  if (!globalRetryTracker) {
    globalRetryTracker = new RetryTracker();
  }
  return globalRetryTracker;
}

/**
 * Reset the global retry tracker (for testing).
 */
export function resetGlobalRetryTracker(): void {
  globalRetryTracker = null;
}

// ============================================================================
// Module Exports
// ============================================================================

export default {
  // Main functions
  retry,
  withRetry,
  retryWithFixedDelay,
  retryWithLinearBackoff,

  // Utility functions
  sleep,
  calculateDelay,
  isRetryableError,
  extractStatusCode,
  extractRetryAfter,

  // Predefined strategies
  createRateLimitRetryOptions,
  createNetworkRetryOptions,
  createDatabaseRetryOptions,
  createOAuthRetryOptions,

  // Tracker
  RetryTracker,
  getGlobalRetryTracker,
  resetGlobalRetryTracker,

  // Errors
  RetryError,
  RetriesExhaustedError,
  RetryAbortedError,
  NonRetryableError,

  // Constants
  DEFAULT_RETRY_CONFIG,
  RETRYABLE_STATUS_CODES,
  RETRYABLE_ERROR_CODES,
  RETRYABLE_ERROR_MESSAGES,
};
