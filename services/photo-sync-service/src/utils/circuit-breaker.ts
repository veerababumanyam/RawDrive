/**
 * Circuit Breaker Utility for Provider Resilience.
 *
 * Implements the circuit breaker pattern to prevent cascading failures when
 * communicating with cloud storage providers (Google Photos, Dropbox, OneDrive, etc.).
 *
 * The circuit breaker has three states:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Circuit is tripped, requests fail immediately
 * - HALF_OPEN: Testing if the service has recovered
 *
 * State Transitions:
 * - CLOSED -> OPEN: When failure count exceeds threshold
 * - OPEN -> HALF_OPEN: After recovery timeout expires
 * - HALF_OPEN -> CLOSED: When test requests succeed
 * - HALF_OPEN -> OPEN: When test requests fail
 *
 * Features:
 * - Configurable failure threshold and recovery timeout
 * - Half-open state for gradual recovery testing
 * - Per-provider circuit breakers
 * - Event callbacks for state changes
 * - Statistics and monitoring support
 * - Support for both sync and async operations
 *
 * @module utils/circuit-breaker
 */

import { config } from '../config/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Circuit breaker states.
 */
export enum CircuitState {
  /** Circuit is closed, requests pass through normally */
  CLOSED = 'CLOSED',
  /** Circuit is open, requests fail immediately */
  OPEN = 'OPEN',
  /** Circuit is testing recovery with limited requests */
  HALF_OPEN = 'HALF_OPEN',
}

/**
 * Provider type for circuit breakers.
 */
export type ProviderType = 'google' | 'dropbox' | 'onedrive' | 'amazon' | 'icloud' | 'default';

/**
 * Circuit breaker configuration.
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening the circuit */
  failureThreshold: number;
  /** Time in milliseconds before attempting recovery (OPEN -> HALF_OPEN) */
  recoveryTimeoutMs: number;
  /** Number of successful requests required in HALF_OPEN state to close circuit */
  halfOpenRequests: number;
  /** Time window in milliseconds for counting failures (sliding window) */
  failureWindowMs: number;
  /** Whether to count timeout errors as failures */
  countTimeouts: boolean;
  /** Optional name for the circuit breaker (for logging) */
  name?: string;
}

/**
 * Result of executing a function through the circuit breaker.
 */
export interface CircuitBreakerResult<T> {
  /** The result value if successful */
  value: T;
  /** Current state of the circuit */
  state: CircuitState;
  /** Time elapsed in milliseconds */
  elapsedMs: number;
  /** Whether the circuit was half-open during execution */
  wasHalfOpen: boolean;
}

/**
 * Circuit breaker statistics.
 */
export interface CircuitBreakerStats {
  /** Current state of the circuit */
  state: CircuitState;
  /** Total number of requests */
  totalRequests: number;
  /** Number of successful requests */
  successfulRequests: number;
  /** Number of failed requests */
  failedRequests: number;
  /** Number of requests rejected due to open circuit */
  rejectedRequests: number;
  /** Current failure count in the window */
  currentFailureCount: number;
  /** Number of consecutive successes in half-open state */
  halfOpenSuccesses: number;
  /** Time the circuit was last opened (null if never opened) */
  lastOpenedAt: number | null;
  /** Time the circuit was last closed (null if never closed) */
  lastClosedAt: number | null;
  /** Time until recovery attempt (ms, 0 if not open) */
  timeUntilRecoveryMs: number;
  /** Failure rate (0-1) */
  failureRate: number;
}

/**
 * Event types for circuit breaker state changes.
 */
export type CircuitBreakerEventType =
  | 'state_change'
  | 'failure'
  | 'success'
  | 'rejected'
  | 'recovery_start'
  | 'recovery_success'
  | 'recovery_failure';

/**
 * Event payload for circuit breaker events.
 */
export interface CircuitBreakerEvent {
  /** Type of event */
  type: CircuitBreakerEventType;
  /** Name of the circuit breaker */
  name: string;
  /** Previous state (for state_change events) */
  previousState?: CircuitState;
  /** New state */
  state: CircuitState;
  /** Associated error (for failure events) */
  error?: Error;
  /** Timestamp of the event */
  timestamp: number;
}

/**
 * Event listener callback type.
 */
export type CircuitBreakerEventListener = (event: CircuitBreakerEvent) => void | Promise<void>;

/**
 * Options for executing a function through the circuit breaker.
 */
export interface ExecuteOptions {
  /** Custom timeout for this execution in milliseconds */
  timeoutMs?: number;
  /** Whether this request is a health check (doesn't affect circuit state) */
  isHealthCheck?: boolean;
}

/**
 * Failure record for sliding window.
 */
interface FailureRecord {
  timestamp: number;
  error: Error;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default circuit breaker configuration.
 */
export const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: config.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
  recoveryTimeoutMs: config.CIRCUIT_BREAKER_RECOVERY_TIMEOUT_MS,
  halfOpenRequests: config.CIRCUIT_BREAKER_HALF_OPEN_REQUESTS,
  failureWindowMs: 60000, // 1 minute sliding window
  countTimeouts: true,
};

/**
 * Provider-specific circuit breaker configurations.
 * Different providers may have different resilience requirements.
 */
export const PROVIDER_CIRCUIT_CONFIGS: Record<ProviderType, Partial<CircuitBreakerConfig>> = {
  google: {
    failureThreshold: 5,
    recoveryTimeoutMs: 30000,
    halfOpenRequests: 3,
    name: 'google-photos',
  },
  dropbox: {
    failureThreshold: 5,
    recoveryTimeoutMs: 30000,
    halfOpenRequests: 3,
    name: 'dropbox',
  },
  onedrive: {
    failureThreshold: 5,
    recoveryTimeoutMs: 30000,
    halfOpenRequests: 3,
    name: 'onedrive',
  },
  amazon: {
    // Amazon has stricter rate limits, more conservative circuit breaker
    failureThreshold: 3,
    recoveryTimeoutMs: 60000,
    halfOpenRequests: 2,
    name: 'amazon-photos',
  },
  icloud: {
    // iCloud CloudKit can be less reliable
    failureThreshold: 3,
    recoveryTimeoutMs: 60000,
    halfOpenRequests: 2,
    name: 'icloud',
  },
  default: {
    name: 'default',
  },
};

// ============================================================================
// Errors
// ============================================================================

/**
 * Base circuit breaker error.
 */
export class CircuitBreakerError extends Error {
  /** Machine-readable error code */
  public readonly code: string;

  constructor(message: string, code: string = 'CIRCUIT_BREAKER_ERROR') {
    super(message);
    this.name = 'CircuitBreakerError';
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
 * Error thrown when the circuit is open and requests are rejected.
 */
export class CircuitOpenError extends CircuitBreakerError {
  /** Name of the circuit breaker */
  public readonly circuitName: string;
  /** Time in milliseconds until recovery attempt */
  public readonly retryAfterMs: number;
  /** Time when the circuit was opened */
  public readonly openedAt: number;

  constructor(circuitName: string, retryAfterMs: number, openedAt: number) {
    super(
      `Circuit "${circuitName}" is OPEN. Retry after ${retryAfterMs}ms`,
      'CIRCUIT_OPEN'
    );
    this.name = 'CircuitOpenError';
    this.circuitName = circuitName;
    this.retryAfterMs = retryAfterMs;
    this.openedAt = openedAt;
  }

  toJSON(): {
    error: string;
    code: string;
    message: string;
    circuitName: string;
    retryAfterMs: number;
    openedAt: number;
  } {
    return {
      ...super.toJSON(),
      circuitName: this.circuitName,
      retryAfterMs: this.retryAfterMs,
      openedAt: this.openedAt,
    };
  }
}

/**
 * Error thrown when execution times out.
 */
export class CircuitTimeoutError extends CircuitBreakerError {
  /** Name of the circuit breaker */
  public readonly circuitName: string;
  /** Timeout duration in milliseconds */
  public readonly timeoutMs: number;

  constructor(circuitName: string, timeoutMs: number) {
    super(
      `Circuit "${circuitName}" execution timed out after ${timeoutMs}ms`,
      'CIRCUIT_TIMEOUT'
    );
    this.name = 'CircuitTimeoutError';
    this.circuitName = circuitName;
    this.timeoutMs = timeoutMs;
  }
}

// ============================================================================
// Circuit Breaker Implementation
// ============================================================================

/**
 * Circuit Breaker implementation with state management.
 *
 * Provides fault tolerance for external service calls by tracking failures
 * and preventing further calls when a threshold is exceeded.
 *
 * @example
 * ```ts
 * const breaker = new CircuitBreaker({
 *   failureThreshold: 5,
 *   recoveryTimeoutMs: 30000,
 *   halfOpenRequests: 3,
 *   name: 'google-photos'
 * });
 *
 * // Execute a function through the circuit breaker
 * const result = await breaker.execute(() => fetchPhotos());
 *
 * // Check circuit state
 * if (breaker.isOpen()) {
 *   console.log('Circuit is open, skipping request');
 * }
 * ```
 */
export class CircuitBreaker {
  private readonly config: CircuitBreakerConfig;
  private state: CircuitState = CircuitState.CLOSED;
  private failures: FailureRecord[] = [];
  private halfOpenSuccessCount: number = 0;
  private halfOpenPending: number = 0;
  private openedAt: number | null = null;
  private closedAt: number | null = null;
  private eventListeners: Set<CircuitBreakerEventListener> = new Set();

  // Statistics
  private totalRequests: number = 0;
  private successfulRequests: number = 0;
  private failedRequests: number = 0;
  private rejectedRequests: number = 0;

  constructor(circuitBreakerConfig: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...circuitBreakerConfig };
    this.closedAt = Date.now();
  }

  /**
   * Get the circuit breaker name.
   */
  get name(): string {
    return this.config.name || 'unnamed';
  }

  /**
   * Get the current state of the circuit.
   */
  getState(): CircuitState {
    // Check if we should transition from OPEN to HALF_OPEN
    if (this.state === CircuitState.OPEN && this.shouldAttemptRecovery()) {
      this.transitionTo(CircuitState.HALF_OPEN);
    }
    return this.state;
  }

  /**
   * Check if the circuit is open.
   */
  isOpen(): boolean {
    return this.getState() === CircuitState.OPEN;
  }

  /**
   * Check if the circuit is closed.
   */
  isClosed(): boolean {
    return this.getState() === CircuitState.CLOSED;
  }

  /**
   * Check if the circuit is half-open.
   */
  isHalfOpen(): boolean {
    return this.getState() === CircuitState.HALF_OPEN;
  }

  /**
   * Check if recovery should be attempted.
   */
  private shouldAttemptRecovery(): boolean {
    if (this.openedAt === null) return false;
    return Date.now() - this.openedAt >= this.config.recoveryTimeoutMs;
  }

  /**
   * Get time until recovery attempt in milliseconds.
   */
  private getTimeUntilRecovery(): number {
    if (this.state !== CircuitState.OPEN || this.openedAt === null) {
      return 0;
    }
    const elapsed = Date.now() - this.openedAt;
    return Math.max(0, this.config.recoveryTimeoutMs - elapsed);
  }

  /**
   * Transition to a new state.
   */
  private transitionTo(newState: CircuitState): void {
    const previousState = this.state;
    if (previousState === newState) return;

    this.state = newState;
    const now = Date.now();

    switch (newState) {
      case CircuitState.OPEN:
        this.openedAt = now;
        this.halfOpenSuccessCount = 0;
        this.halfOpenPending = 0;
        break;
      case CircuitState.HALF_OPEN:
        this.halfOpenSuccessCount = 0;
        this.halfOpenPending = 0;
        this.emitEvent({
          type: 'recovery_start',
          name: this.name,
          previousState,
          state: newState,
          timestamp: now,
        });
        break;
      case CircuitState.CLOSED:
        this.closedAt = now;
        this.failures = [];
        this.halfOpenSuccessCount = 0;
        this.halfOpenPending = 0;
        break;
    }

    this.emitEvent({
      type: 'state_change',
      name: this.name,
      previousState,
      state: newState,
      timestamp: now,
    });
  }

  /**
   * Clean up old failures outside the sliding window.
   */
  private cleanupFailures(): void {
    const cutoff = Date.now() - this.config.failureWindowMs;
    this.failures = this.failures.filter((f) => f.timestamp > cutoff);
  }

  /**
   * Record a failure.
   */
  private recordFailure(error: Error): void {
    const now = Date.now();

    this.cleanupFailures();
    this.failures.push({ timestamp: now, error });
    this.failedRequests++;

    this.emitEvent({
      type: 'failure',
      name: this.name,
      state: this.state,
      error,
      timestamp: now,
    });

    // Check if we should open the circuit
    if (this.state === CircuitState.CLOSED) {
      if (this.failures.length >= this.config.failureThreshold) {
        this.transitionTo(CircuitState.OPEN);
      }
    } else if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open state reopens the circuit
      this.halfOpenPending = Math.max(0, this.halfOpenPending - 1);
      this.emitEvent({
        type: 'recovery_failure',
        name: this.name,
        state: CircuitState.HALF_OPEN,
        error,
        timestamp: now,
      });
      this.transitionTo(CircuitState.OPEN);
    }
  }

  /**
   * Record a success.
   */
  private recordSuccess(): void {
    const now = Date.now();
    this.successfulRequests++;

    this.emitEvent({
      type: 'success',
      name: this.name,
      state: this.state,
      timestamp: now,
    });

    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenPending = Math.max(0, this.halfOpenPending - 1);
      this.halfOpenSuccessCount++;

      // Check if we can close the circuit
      if (this.halfOpenSuccessCount >= this.config.halfOpenRequests) {
        this.emitEvent({
          type: 'recovery_success',
          name: this.name,
          state: CircuitState.HALF_OPEN,
          timestamp: now,
        });
        this.transitionTo(CircuitState.CLOSED);
      }
    }
  }

  /**
   * Check if a request should be allowed.
   */
  private canExecute(): boolean {
    const currentState = this.getState();

    if (currentState === CircuitState.CLOSED) {
      return true;
    }

    if (currentState === CircuitState.OPEN) {
      return false;
    }

    // HALF_OPEN state: allow limited requests for testing
    // Limit concurrent half-open requests to prevent overwhelming the service
    if (this.halfOpenPending < this.config.halfOpenRequests) {
      return true;
    }

    return false;
  }

  /**
   * Execute a function through the circuit breaker.
   *
   * @template T - The return type of the function
   * @param fn - The async function to execute
   * @param options - Execution options
   * @returns Promise resolving to CircuitBreakerResult
   * @throws {CircuitOpenError} When the circuit is open
   * @throws {CircuitTimeoutError} When execution times out
   */
  async execute<T>(
    fn: () => Promise<T>,
    options: ExecuteOptions = {}
  ): Promise<CircuitBreakerResult<T>> {
    const { timeoutMs, isHealthCheck = false } = options;
    const startTime = Date.now();

    this.totalRequests++;

    // Check if we can execute
    if (!this.canExecute()) {
      this.rejectedRequests++;
      this.emitEvent({
        type: 'rejected',
        name: this.name,
        state: this.state,
        timestamp: startTime,
      });

      throw new CircuitOpenError(
        this.name,
        this.getTimeUntilRecovery(),
        this.openedAt!
      );
    }

    const wasHalfOpen = this.state === CircuitState.HALF_OPEN;
    if (wasHalfOpen && !isHealthCheck) {
      this.halfOpenPending++;
    }

    try {
      let result: T;

      if (timeoutMs) {
        result = await this.executeWithTimeout(fn, timeoutMs);
      } else {
        result = await fn();
      }

      if (!isHealthCheck) {
        this.recordSuccess();
      }

      return {
        value: result,
        state: this.state,
        elapsedMs: Date.now() - startTime,
        wasHalfOpen,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // Check if it's a timeout error
      if (err instanceof CircuitTimeoutError) {
        if (this.config.countTimeouts && !isHealthCheck) {
          this.recordFailure(err);
        } else if (wasHalfOpen && !isHealthCheck) {
          this.halfOpenPending = Math.max(0, this.halfOpenPending - 1);
        }
      } else if (!isHealthCheck) {
        this.recordFailure(err);
      } else if (wasHalfOpen && !isHealthCheck) {
        this.halfOpenPending = Math.max(0, this.halfOpenPending - 1);
      }

      throw err;
    }
  }

  /**
   * Execute a function with timeout.
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new CircuitTimeoutError(this.name, timeoutMs));
      }, timeoutMs);

      fn()
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Manually open the circuit.
   * Useful for proactive circuit opening based on external signals.
   */
  open(): void {
    if (this.state !== CircuitState.OPEN) {
      this.transitionTo(CircuitState.OPEN);
    }
  }

  /**
   * Manually close the circuit.
   * Use with caution - typically let the circuit recover naturally.
   */
  close(): void {
    if (this.state !== CircuitState.CLOSED) {
      this.transitionTo(CircuitState.CLOSED);
    }
  }

  /**
   * Manually reset the circuit to closed state and clear all statistics.
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = [];
    this.halfOpenSuccessCount = 0;
    this.halfOpenPending = 0;
    this.openedAt = null;
    this.closedAt = Date.now();
    this.totalRequests = 0;
    this.successfulRequests = 0;
    this.failedRequests = 0;
    this.rejectedRequests = 0;
  }

  /**
   * Get current statistics.
   */
  getStats(): CircuitBreakerStats {
    this.cleanupFailures();

    const totalCompleted = this.successfulRequests + this.failedRequests;
    const failureRate = totalCompleted > 0 ? this.failedRequests / totalCompleted : 0;

    return {
      state: this.getState(),
      totalRequests: this.totalRequests,
      successfulRequests: this.successfulRequests,
      failedRequests: this.failedRequests,
      rejectedRequests: this.rejectedRequests,
      currentFailureCount: this.failures.length,
      halfOpenSuccesses: this.halfOpenSuccessCount,
      lastOpenedAt: this.openedAt,
      lastClosedAt: this.closedAt,
      timeUntilRecoveryMs: this.getTimeUntilRecovery(),
      failureRate,
    };
  }

  /**
   * Get the configuration.
   */
  getConfig(): CircuitBreakerConfig {
    return { ...this.config };
  }

  /**
   * Add an event listener.
   */
  addEventListener(listener: CircuitBreakerEventListener): void {
    this.eventListeners.add(listener);
  }

  /**
   * Remove an event listener.
   */
  removeEventListener(listener: CircuitBreakerEventListener): void {
    this.eventListeners.delete(listener);
  }

  /**
   * Emit an event to all listeners.
   */
  private emitEvent(event: CircuitBreakerEvent): void {
    for (const listener of this.eventListeners) {
      try {
        const result = listener(event);
        // Handle async listeners without blocking
        if (result instanceof Promise) {
          result.catch((err) => {
            console.error('[CircuitBreaker] Event listener error:', err);
          });
        }
      } catch (err) {
        console.error('[CircuitBreaker] Event listener error:', err);
      }
    }
  }
}

// ============================================================================
// Provider Circuit Breaker Manager
// ============================================================================

/**
 * Manages circuit breakers for multiple providers.
 *
 * Provides a centralized way to manage circuit breakers for all cloud storage
 * providers with provider-specific configurations.
 *
 * @example
 * ```ts
 * const manager = new ProviderCircuitBreakerManager();
 *
 * // Execute through a provider's circuit breaker
 * const result = await manager.execute('google', () => fetchGooglePhotos());
 *
 * // Check provider health
 * if (manager.isProviderHealthy('google')) {
 *   // Provider is available
 * }
 * ```
 */
export class ProviderCircuitBreakerManager {
  private readonly breakers: Map<string, CircuitBreaker> = new Map();
  private readonly globalListeners: Set<CircuitBreakerEventListener> = new Set();

  constructor() {
    this.initializeBreakers();
  }

  /**
   * Initialize circuit breakers for all providers.
   */
  private initializeBreakers(): void {
    for (const [provider, providerConfig] of Object.entries(PROVIDER_CIRCUIT_CONFIGS)) {
      const circuitConfig: CircuitBreakerConfig = {
        ...DEFAULT_CONFIG,
        ...providerConfig,
        name: providerConfig.name || provider,
      };

      const breaker = new CircuitBreaker(circuitConfig);

      // Add global listener forwarding
      breaker.addEventListener((event) => {
        this.forwardEvent(provider as ProviderType, event);
      });

      this.breakers.set(provider, breaker);
    }
  }

  /**
   * Forward events to global listeners.
   */
  private forwardEvent(provider: ProviderType, event: CircuitBreakerEvent): void {
    for (const listener of this.globalListeners) {
      try {
        const result = listener({ ...event, name: `${provider}:${event.name}` });
        if (result instanceof Promise) {
          result.catch((err) => {
            console.error('[ProviderCircuitBreakerManager] Event listener error:', err);
          });
        }
      } catch (err) {
        console.error('[ProviderCircuitBreakerManager] Event listener error:', err);
      }
    }
  }

  /**
   * Get the circuit breaker for a provider.
   */
  getBreaker(provider: ProviderType): CircuitBreaker {
    const breaker = this.breakers.get(provider) || this.breakers.get('default');
    if (!breaker) {
      throw new CircuitBreakerError(`No circuit breaker for provider: ${provider}`);
    }
    return breaker;
  }

  /**
   * Get or create a circuit breaker for a user-provider combination.
   */
  getBreakerForUser(provider: ProviderType, userId: string): CircuitBreaker {
    const key = `${provider}:${userId}`;
    let breaker = this.breakers.get(key);

    if (!breaker) {
      const providerConfig = PROVIDER_CIRCUIT_CONFIGS[provider] || PROVIDER_CIRCUIT_CONFIGS.default;
      const circuitConfig: CircuitBreakerConfig = {
        ...DEFAULT_CONFIG,
        ...providerConfig,
        name: key,
      };

      breaker = new CircuitBreaker(circuitConfig);

      // Add global listener forwarding
      breaker.addEventListener((event) => {
        this.forwardEvent(provider, event);
      });

      this.breakers.set(key, breaker);
    }

    return breaker;
  }

  /**
   * Execute a function through a provider's circuit breaker.
   */
  async execute<T>(
    provider: ProviderType,
    fn: () => Promise<T>,
    options: ExecuteOptions = {}
  ): Promise<CircuitBreakerResult<T>> {
    return this.getBreaker(provider).execute(fn, options);
  }

  /**
   * Execute a function through a user-specific circuit breaker.
   */
  async executeForUser<T>(
    provider: ProviderType,
    userId: string,
    fn: () => Promise<T>,
    options: ExecuteOptions = {}
  ): Promise<CircuitBreakerResult<T>> {
    return this.getBreakerForUser(provider, userId).execute(fn, options);
  }

  /**
   * Check if a provider is healthy (circuit is not open).
   */
  isProviderHealthy(provider: ProviderType): boolean {
    return !this.getBreaker(provider).isOpen();
  }

  /**
   * Check if a user's provider circuit is healthy.
   */
  isUserProviderHealthy(provider: ProviderType, userId: string): boolean {
    return !this.getBreakerForUser(provider, userId).isOpen();
  }

  /**
   * Get the state of a provider's circuit.
   */
  getProviderState(provider: ProviderType): CircuitState {
    return this.getBreaker(provider).getState();
  }

  /**
   * Get statistics for a provider.
   */
  getProviderStats(provider: ProviderType): CircuitBreakerStats {
    return this.getBreaker(provider).getStats();
  }

  /**
   * Get statistics for all providers.
   */
  getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    for (const [name, breaker] of this.breakers) {
      stats[name] = breaker.getStats();
    }
    return stats;
  }

  /**
   * Get a summary of unhealthy providers.
   */
  getUnhealthyProviders(): string[] {
    const unhealthy: string[] = [];
    for (const [name, breaker] of this.breakers) {
      if (breaker.isOpen()) {
        unhealthy.push(name);
      }
    }
    return unhealthy;
  }

  /**
   * Reset a provider's circuit breaker.
   */
  resetProvider(provider: ProviderType): void {
    this.getBreaker(provider).reset();
  }

  /**
   * Reset all circuit breakers.
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Add a global event listener for all circuit breakers.
   */
  addGlobalListener(listener: CircuitBreakerEventListener): void {
    this.globalListeners.add(listener);
  }

  /**
   * Remove a global event listener.
   */
  removeGlobalListener(listener: CircuitBreakerEventListener): void {
    this.globalListeners.delete(listener);
  }

  /**
   * Clear all user-specific circuit breakers (keeps provider-level breakers).
   */
  clearUserBreakers(): void {
    const providerNames = Object.keys(PROVIDER_CIRCUIT_CONFIGS);
    for (const [key, breaker] of this.breakers) {
      if (!providerNames.includes(key)) {
        breaker.reset();
        this.breakers.delete(key);
      }
    }
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a circuit breaker with custom configuration.
 */
export function createCircuitBreaker(
  config: Partial<CircuitBreakerConfig> = {}
): CircuitBreaker {
  return new CircuitBreaker(config);
}

/**
 * Create a circuit breaker for a specific provider.
 */
export function createProviderCircuitBreaker(provider: ProviderType): CircuitBreaker {
  const providerConfig = PROVIDER_CIRCUIT_CONFIGS[provider] || PROVIDER_CIRCUIT_CONFIGS.default;
  return new CircuitBreaker({
    ...DEFAULT_CONFIG,
    ...providerConfig,
  });
}

/**
 * Wrap a function with circuit breaker protection.
 *
 * @template T - Arguments type
 * @template R - Return type
 * @param fn - The async function to wrap
 * @param breaker - The circuit breaker to use
 * @returns Wrapped function that uses the circuit breaker
 *
 * @example
 * ```ts
 * const breaker = new CircuitBreaker({ name: 'api' });
 * const protectedFetch = withCircuitBreaker(
 *   async (url: string) => fetch(url),
 *   breaker
 * );
 *
 * const response = await protectedFetch('https://api.example.com');
 * ```
 */
export function withCircuitBreaker<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
  breaker: CircuitBreaker,
  options: ExecuteOptions = {}
): (...args: T) => Promise<CircuitBreakerResult<R>> {
  return (...args: T) => breaker.execute(() => fn(...args), options);
}

/**
 * Check if an error indicates the circuit should be opened.
 * This can be used to manually determine if a specific error should trip the circuit.
 */
export function shouldOpenCircuit(error: Error): boolean {
  const errorMessage = error.message.toLowerCase();

  // Network errors
  if (
    errorMessage.includes('network') ||
    errorMessage.includes('econnrefused') ||
    errorMessage.includes('econnreset') ||
    errorMessage.includes('etimedout') ||
    errorMessage.includes('ehostunreach')
  ) {
    return true;
  }

  // Service unavailable
  if (
    errorMessage.includes('service unavailable') ||
    errorMessage.includes('temporarily unavailable')
  ) {
    return true;
  }

  // HTTP error codes (extracted from error)
  const httpError = error as { status?: number; statusCode?: number };
  const status = httpError.status ?? httpError.statusCode;
  if (status !== undefined && status >= 500 && status < 600) {
    return true;
  }

  return false;
}

/**
 * Check if an error is a circuit breaker error.
 */
export function isCircuitBreakerError(error: unknown): error is CircuitBreakerError {
  return error instanceof CircuitBreakerError;
}

/**
 * Check if an error is a circuit open error.
 */
export function isCircuitOpenError(error: unknown): error is CircuitOpenError {
  return error instanceof CircuitOpenError;
}

// ============================================================================
// Singleton Instance
// ============================================================================

let providerCircuitBreakerManager: ProviderCircuitBreakerManager | null = null;

/**
 * Get the singleton provider circuit breaker manager.
 */
export function getProviderCircuitBreakerManager(): ProviderCircuitBreakerManager {
  if (!providerCircuitBreakerManager) {
    providerCircuitBreakerManager = new ProviderCircuitBreakerManager();
  }
  return providerCircuitBreakerManager;
}

/**
 * Reset the singleton instance (for testing).
 */
export function resetProviderCircuitBreakerManager(): void {
  if (providerCircuitBreakerManager) {
    providerCircuitBreakerManager.resetAll();
  }
  providerCircuitBreakerManager = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Execute a function through a provider's circuit breaker using the singleton manager.
 */
export async function executeWithCircuitBreaker<T>(
  provider: ProviderType,
  fn: () => Promise<T>,
  options: ExecuteOptions = {}
): Promise<CircuitBreakerResult<T>> {
  return getProviderCircuitBreakerManager().execute(provider, fn, options);
}

/**
 * Execute a function for a specific user through their circuit breaker.
 */
export async function executeWithUserCircuitBreaker<T>(
  provider: ProviderType,
  userId: string,
  fn: () => Promise<T>,
  options: ExecuteOptions = {}
): Promise<CircuitBreakerResult<T>> {
  return getProviderCircuitBreakerManager().executeForUser(provider, userId, fn, options);
}

/**
 * Check if a provider is currently healthy.
 */
export function isProviderHealthy(provider: ProviderType): boolean {
  return getProviderCircuitBreakerManager().isProviderHealthy(provider);
}

/**
 * Get the current state of a provider's circuit.
 */
export function getProviderCircuitState(provider: ProviderType): CircuitState {
  return getProviderCircuitBreakerManager().getProviderState(provider);
}

/**
 * Get statistics for a provider's circuit breaker.
 */
export function getProviderCircuitStats(provider: ProviderType): CircuitBreakerStats {
  return getProviderCircuitBreakerManager().getProviderStats(provider);
}

/**
 * Get all unhealthy providers.
 */
export function getUnhealthyProviders(): string[] {
  return getProviderCircuitBreakerManager().getUnhealthyProviders();
}

// ============================================================================
// Module Exports
// ============================================================================

export default {
  // Classes
  CircuitBreaker,
  ProviderCircuitBreakerManager,

  // Errors
  CircuitBreakerError,
  CircuitOpenError,
  CircuitTimeoutError,

  // Enums
  CircuitState,

  // Singleton
  getProviderCircuitBreakerManager,
  resetProviderCircuitBreakerManager,

  // Convenience functions
  executeWithCircuitBreaker,
  executeWithUserCircuitBreaker,
  isProviderHealthy,
  getProviderCircuitState,
  getProviderCircuitStats,
  getUnhealthyProviders,

  // Utility functions
  createCircuitBreaker,
  createProviderCircuitBreaker,
  withCircuitBreaker,
  shouldOpenCircuit,
  isCircuitBreakerError,
  isCircuitOpenError,

  // Constants
  DEFAULT_CONFIG,
  PROVIDER_CIRCUIT_CONFIGS,
};
