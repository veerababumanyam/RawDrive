/**
 * Base Photo Provider Abstract Class.
 *
 * Provides common functionality for all cloud storage provider adapters.
 * Concrete provider implementations (Google Photos, Dropbox, OneDrive, etc.)
 * should extend this class and implement the abstract methods.
 *
 * Features:
 * - OAuth token management with automatic refresh
 * - Built-in rate limiting per provider
 * - Circuit breaker for fault tolerance
 * - Retry logic with exponential backoff
 * - Request/response logging and metrics
 * - Common HTTP client utilities
 *
 * @module providers/base.provider
 */

import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { URL, URLSearchParams } from 'node:url';
import type { Provider } from '../types.js';
import {
  type IPhotoProvider,
  type ProviderConfig,
  type OAuthTokens,
  type ProviderAccountInfo,
  type OAuthState,
  type OAuthExchangeParams,
  type ProviderPhoto,
  type PhotoListResult,
  type PhotoListOptions,
  type AlbumListResult,
  type DownloadOptions,
  type DownloadResult,
  type SyncChanges,
  type SyncChangesOptions,
  type SyncCursor,
  type ProviderError,
  PhotoProviderError,
  ProviderErrorCode,
} from './provider.interface.js';
import {
  retry,
  type RetryOptions,
  createOAuthRetryOptions,
  createNetworkRetryOptions,
  isRetryableError,
} from '../utils/retry.js';
import {
  type ProviderType,
  getProviderRateLimiter,
  type ConsumeResult,
  RateLimitExceededError,
} from '../utils/rate-limiter.js';
import {
  CircuitBreaker,
  CircuitOpenError,
  type CircuitBreakerConfig,
  PROVIDER_CIRCUIT_CONFIGS,
} from '../utils/circuit-breaker.js';
import { config } from '../config/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * HTTP method types.
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';

/**
 * HTTP request options.
 */
export interface HttpRequestOptions {
  /** HTTP method */
  method?: HttpMethod;
  /** Request headers */
  headers?: Record<string, string>;
  /** Request body (will be JSON stringified if object) */
  body?: unknown;
  /** Query parameters */
  query?: Record<string, string | number | boolean | undefined>;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
  /** Whether to skip rate limiting for this request */
  skipRateLimit?: boolean;
  /** Whether to skip circuit breaker for this request */
  skipCircuitBreaker?: boolean;
  /** Whether to skip automatic retry for this request */
  skipRetry?: boolean;
  /** Custom retry options */
  retryOptions?: Partial<RetryOptions>;
  /** Whether this is a download request (affects response handling) */
  isDownload?: boolean;
  /** Range header for partial downloads */
  rangeStart?: number;
  /** Range header end for partial downloads */
  rangeEnd?: number;
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
}

/**
 * HTTP response structure.
 */
export interface HttpResponse<T = unknown> {
  /** Response status code */
  status: number;
  /** Response status text */
  statusText: string;
  /** Response headers */
  headers: Record<string, string>;
  /** Parsed response body */
  data: T;
  /** Raw response (for downloads) */
  raw?: Response;
  /** Request duration in milliseconds */
  durationMs: number;
}

/**
 * Token refresh callback type.
 */
export type TokenRefreshCallback = (
  newTokens: OAuthTokens
) => void | Promise<void>;

/**
 * Base provider options.
 */
export interface BaseProviderOptions {
  /** User ID for rate limiting and logging */
  userId: string;
  /** Correlation ID for request tracing */
  correlationId?: string;
  /** Callback when tokens are refreshed */
  onTokenRefresh?: TokenRefreshCallback;
  /** Custom circuit breaker configuration */
  circuitBreakerConfig?: Partial<CircuitBreakerConfig>;
  /** Whether to enable debug logging */
  debug?: boolean;
}

/**
 * Request context for logging and tracing.
 */
export interface RequestContext {
  /** Operation name */
  operation: string;
  /** Request start time */
  startTime: number;
  /** User ID */
  userId: string;
  /** Correlation ID */
  correlationId?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default request timeout in milliseconds.
 */
const DEFAULT_REQUEST_TIMEOUT = 30000;

/**
 * Default download timeout in milliseconds.
 */
const DEFAULT_DOWNLOAD_TIMEOUT = 300000; // 5 minutes

/**
 * Default page size for listing operations.
 */
const DEFAULT_PAGE_SIZE = 100;

/**
 * HTTP status codes that indicate authentication errors.
 */
const AUTH_ERROR_STATUS_CODES = new Set([401, 403]);

/**
 * HTTP status codes that indicate rate limiting.
 */
const RATE_LIMIT_STATUS_CODES = new Set([429]);

/**
 * HTTP status codes that indicate server errors.
 */
const SERVER_ERROR_STATUS_CODES = new Set([500, 502, 503, 504]);

// ============================================================================
// Base Provider Implementation
// ============================================================================

/**
 * Abstract base class for photo provider implementations.
 *
 * Provides common functionality including:
 * - HTTP client with automatic JSON handling
 * - OAuth token management and refresh
 * - Rate limiting integration
 * - Circuit breaker protection
 * - Retry logic with exponential backoff
 * - Error handling and normalization
 *
 * @abstract
 * @example
 * ```ts
 * class GooglePhotosProvider extends BasePhotoProvider {
 *   constructor(options: BaseProviderOptions) {
 *     super(Provider.GOOGLE_PHOTOS, GOOGLE_PHOTOS_CONFIG, options);
 *   }
 *
 *   // Implement abstract methods...
 * }
 * ```
 */
export abstract class BasePhotoProvider implements IPhotoProvider {
  // ===========================================================================
  // Properties
  // ===========================================================================

  /** Provider identifier */
  public readonly provider: Provider;

  /** Provider configuration */
  public readonly config: ProviderConfig;

  /** User ID for rate limiting */
  protected readonly userId: string;

  /** Correlation ID for tracing */
  protected readonly correlationId: string;

  /** Token refresh callback */
  protected readonly onTokenRefresh?: TokenRefreshCallback;

  /** Circuit breaker instance */
  protected readonly circuitBreaker: CircuitBreaker;

  /** Whether debug logging is enabled */
  protected readonly debug: boolean;

  /** Current access token (may be updated via refresh) */
  protected currentAccessToken: string | null = null;

  /** Current refresh token */
  protected currentRefreshToken: string | null = null;

  /** Token expiration time */
  protected tokenExpiresAt: Date | null = null;

  /** Rate limiter provider type mapping */
  private readonly rateLimiterProvider: ProviderType;

  // ===========================================================================
  // Constructor
  // ===========================================================================

  /**
   * Create a new base provider instance.
   *
   * @param providerType - The provider type identifier
   * @param providerConfig - Provider-specific configuration
   * @param options - Base provider options
   */
  constructor(
    providerType: Provider,
    providerConfig: ProviderConfig,
    options: BaseProviderOptions
  ) {
    this.provider = providerType;
    this.config = providerConfig;
    this.userId = options.userId;
    this.correlationId = options.correlationId || this.generateCorrelationId();
    this.onTokenRefresh = options.onTokenRefresh;
    this.debug = options.debug || config.isDevelopment;

    // Map provider to rate limiter provider type
    this.rateLimiterProvider = this.mapToRateLimiterProvider(providerType);

    // Initialize circuit breaker with provider-specific config
    const circuitConfig: CircuitBreakerConfig = {
      ...PROVIDER_CIRCUIT_CONFIGS[this.rateLimiterProvider],
      ...options.circuitBreakerConfig,
      name: `${providerType}-${this.userId}`,
    } as CircuitBreakerConfig;

    this.circuitBreaker = new CircuitBreaker(circuitConfig);
  }

  // ===========================================================================
  // Abstract Methods (must be implemented by subclasses)
  // ===========================================================================

  /**
   * Generate the OAuth authorization URL.
   * Provider-specific implementation required.
   */
  abstract getAuthorizationUrl(state: OAuthState): string;

  /**
   * Exchange authorization code for tokens.
   * Provider-specific implementation required.
   */
  abstract exchangeAuthorizationCode(
    params: OAuthExchangeParams
  ): Promise<OAuthTokens>;

  /**
   * Refresh the access token.
   * Provider-specific implementation required.
   */
  abstract refreshAccessToken(refreshToken: string): Promise<OAuthTokens>;

  /**
   * Revoke OAuth tokens.
   * Provider-specific implementation required.
   */
  abstract revokeToken(accessToken: string): Promise<boolean>;

  /**
   * Get user account information.
   * Provider-specific implementation required.
   */
  abstract getAccountInfo(accessToken: string): Promise<ProviderAccountInfo>;

  /**
   * Validate an access token.
   * Provider-specific implementation required.
   */
  abstract validateToken(accessToken: string): Promise<boolean>;

  /**
   * List photos from the provider.
   * Provider-specific implementation required.
   */
  abstract listPhotos(
    accessToken: string,
    options?: PhotoListOptions
  ): Promise<PhotoListResult>;

  /**
   * Get a single photo by ID.
   * Provider-specific implementation required.
   */
  abstract getPhoto(
    accessToken: string,
    photoId: string
  ): Promise<ProviderPhoto | null>;

  /**
   * Download a photo by ID.
   * Provider-specific implementation required.
   */
  abstract downloadPhoto(
    accessToken: string,
    photoId: string,
    options?: DownloadOptions
  ): Promise<DownloadResult>;

  /**
   * Download a photo from a URL.
   * Provider-specific implementation required.
   */
  abstract downloadFromUrl(
    accessToken: string,
    downloadUrl: string,
    options?: DownloadOptions
  ): Promise<DownloadResult>;

  /**
   * Test the connection to the provider.
   * Provider-specific implementation required.
   */
  abstract testConnection(accessToken: string): Promise<boolean>;

  // ===========================================================================
  // Optional Methods (can be overridden by subclasses)
  // ===========================================================================

  /**
   * Get multiple photos by IDs.
   * Default implementation fetches photos individually.
   * Override for batch API support.
   */
  async getPhotos(
    accessToken: string,
    photoIds: string[]
  ): Promise<Map<string, ProviderPhoto>> {
    const results = new Map<string, ProviderPhoto>();

    // Fetch photos in parallel with concurrency limit
    const concurrency = this.config.maxConcurrentDownloads;
    const chunks = this.chunkArray(photoIds, concurrency);

    for (const chunk of chunks) {
      const photos = await Promise.all(
        chunk.map(async (id) => {
          try {
            const photo = await this.getPhoto(accessToken, id);
            return photo ? { id, photo } : null;
          } catch (error) {
            this.logDebug('Failed to fetch photo', { photoId: id, error });
            return null;
          }
        })
      );

      for (const result of photos) {
        if (result) {
          results.set(result.id, result.photo);
        }
      }
    }

    return results;
  }

  /**
   * List albums from the provider.
   * Override if provider supports albums.
   */
  async listAlbums?(
    accessToken: string,
    pageToken?: string
  ): Promise<AlbumListResult>;

  /**
   * List photos from a specific album.
   * Override if provider supports albums.
   */
  async listAlbumPhotos?(
    accessToken: string,
    albumId: string,
    options?: PhotoListOptions
  ): Promise<PhotoListResult>;

  /**
   * Get changes since last sync.
   * Override if provider supports incremental sync.
   */
  async getChanges?(
    accessToken: string,
    options?: SyncChangesOptions
  ): Promise<SyncChanges>;

  /**
   * Get initial sync cursor.
   * Override if provider supports incremental sync.
   */
  async getInitialSyncCursor?(accessToken: string): Promise<SyncCursor>;

  /**
   * Get total photo count.
   * Override if provider supports this efficiently.
   */
  async getTotalPhotoCount?(accessToken: string): Promise<number | null>;

  /**
   * Get storage quota information.
   * Override if provider exposes this information.
   */
  async getStorageQuota?(
    accessToken: string
  ): Promise<{ totalBytes: number; usedBytes: number } | null>;

  // ===========================================================================
  // Protected HTTP Client Methods
  // ===========================================================================

  /**
   * Make an authenticated HTTP request to the provider API.
   *
   * @param endpoint - API endpoint (relative to apiBaseUrl)
   * @param accessToken - Access token for authentication
   * @param options - Request options
   * @returns HTTP response
   */
  protected async request<T>(
    endpoint: string,
    accessToken: string,
    options: HttpRequestOptions = {}
  ): Promise<HttpResponse<T>> {
    const {
      method = 'GET',
      headers = {},
      body,
      query,
      timeoutMs = DEFAULT_REQUEST_TIMEOUT,
      skipRateLimit = false,
      skipCircuitBreaker = false,
      skipRetry = false,
      retryOptions,
      isDownload = false,
      rangeStart,
      rangeEnd,
      abortSignal,
    } = options;

    // Build full URL
    const url = this.buildUrl(endpoint, query);

    // Create request context for logging
    const context: RequestContext = {
      operation: `${method} ${endpoint}`,
      startTime: Date.now(),
      userId: this.userId,
      correlationId: this.correlationId,
    };

    // Build request headers
    const requestHeaders: Record<string, string> = {
      'Authorization': `Bearer ${accessToken}`,
      'X-Correlation-ID': this.correlationId,
      ...headers,
    };

    // Add Content-Type for requests with body
    if (body && !requestHeaders['Content-Type']) {
      requestHeaders['Content-Type'] = 'application/json';
    }

    // Add Range header for partial downloads
    if (rangeStart !== undefined || rangeEnd !== undefined) {
      const start = rangeStart ?? 0;
      const end = rangeEnd !== undefined ? rangeEnd : '';
      requestHeaders['Range'] = `bytes=${start}-${end}`;
    }

    // Prepare request body
    const requestBody = body
      ? typeof body === 'string'
        ? body
        : JSON.stringify(body)
      : undefined;

    // Create the fetch function
    const fetchFn = async (): Promise<HttpResponse<T>> => {
      // Check rate limit
      if (!skipRateLimit) {
        await this.checkRateLimit();
      }

      const startTime = Date.now();

      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      // Combine with external abort signal
      if (abortSignal) {
        abortSignal.addEventListener('abort', () => controller.abort());
      }

      try {
        const response = await fetch(url, {
          method,
          headers: requestHeaders,
          body: requestBody,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const durationMs = Date.now() - startTime;

        // Log request completion
        this.logDebug('Request completed', {
          ...context,
          status: response.status,
          durationMs,
        });

        // Handle error responses
        if (!response.ok) {
          throw await this.handleErrorResponse(response, context);
        }

        // Parse response
        const responseHeaders = this.extractHeaders(response.headers);
        let data: T;

        if (isDownload) {
          // For downloads, return the response body as-is
          data = response as unknown as T;
        } else {
          // Parse JSON response
          const text = await response.text();
          data = text ? JSON.parse(text) : ({} as T);
        }

        return {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          data,
          raw: isDownload ? response : undefined,
          durationMs,
        };
      } catch (error) {
        clearTimeout(timeoutId);

        // Handle abort errors
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw this.createProviderError(
            ProviderErrorCode.TIMEOUT,
            `Request timed out after ${timeoutMs}ms`,
            { originalError: error }
          );
        }

        // Re-throw provider errors
        if (error instanceof PhotoProviderError) {
          throw error;
        }

        // Handle network errors
        throw this.createProviderError(
          ProviderErrorCode.NETWORK_ERROR,
          `Network error: ${(error as Error).message}`,
          { originalError: error }
        );
      }
    };

    // Wrap with circuit breaker if enabled
    const protectedFn = skipCircuitBreaker
      ? fetchFn
      : async () => {
          const result = await this.circuitBreaker.execute(fetchFn);
          return result.value;
        };

    // Wrap with retry logic if enabled
    if (!skipRetry) {
      const mergedRetryOptions: RetryOptions = {
        ...createNetworkRetryOptions(),
        ...retryOptions,
        operationName: context.operation,
        shouldRetry: (error) => this.shouldRetryRequest(error),
        onRetry: (error, attempt, delayMs) => {
          this.logDebug('Retrying request', {
            ...context,
            attempt,
            delayMs,
            error: (error as Error).message,
          });
        },
      };

      const result = await retry(protectedFn, mergedRetryOptions);
      return result.value;
    }

    return protectedFn();
  }

  /**
   * Make a request for OAuth token operations.
   * Uses different retry and error handling.
   */
  protected async oauthRequest<T>(
    url: string,
    body: Record<string, string>,
    options: HttpRequestOptions = {}
  ): Promise<HttpResponse<T>> {
    const {
      timeoutMs = DEFAULT_REQUEST_TIMEOUT,
      skipRetry = false,
      retryOptions,
    } = options;

    const context: RequestContext = {
      operation: 'OAuth Token Request',
      startTime: Date.now(),
      userId: this.userId,
      correlationId: this.correlationId,
    };

    const fetchFn = async (): Promise<HttpResponse<T>> => {
      const startTime = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
          },
          body: new URLSearchParams(body).toString(),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const durationMs = Date.now() - startTime;

        if (!response.ok) {
          throw await this.handleOAuthErrorResponse(response, context);
        }

        const data = (await response.json()) as T;

        return {
          status: response.status,
          statusText: response.statusText,
          headers: this.extractHeaders(response.headers),
          data,
          durationMs,
        };
      } catch (error) {
        clearTimeout(timeoutId);

        if (error instanceof PhotoProviderError) {
          throw error;
        }

        throw this.createProviderError(
          ProviderErrorCode.NETWORK_ERROR,
          `OAuth request failed: ${(error as Error).message}`,
          { originalError: error }
        );
      }
    };

    if (!skipRetry) {
      const mergedRetryOptions: RetryOptions = {
        ...createOAuthRetryOptions(),
        ...retryOptions,
        operationName: context.operation,
      };

      const result = await retry(fetchFn, mergedRetryOptions);
      return result.value;
    }

    return fetchFn();
  }

  /**
   * Download a file with streaming support.
   *
   * @param url - Download URL
   * @param accessToken - Access token for authentication
   * @param options - Download options
   * @returns Download result with readable stream
   */
  protected async downloadStream(
    url: string,
    accessToken: string,
    options: DownloadOptions = {}
  ): Promise<DownloadResult> {
    const {
      timeoutMs = DEFAULT_DOWNLOAD_TIMEOUT,
      rangeStart,
      rangeEnd,
    } = options;

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${accessToken}`,
    };

    // Add Range header for partial downloads
    if (rangeStart !== undefined || rangeEnd !== undefined) {
      const start = rangeStart ?? 0;
      const end = rangeEnd !== undefined ? rangeEnd : '';
      headers['Range'] = `bytes=${start}-${end}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok && response.status !== 206) {
        throw await this.handleErrorResponse(response, {
          operation: 'Download',
          startTime: Date.now(),
          userId: this.userId,
          correlationId: this.correlationId,
        });
      }

      // Convert web stream to Node.js Readable
      const stream = this.webStreamToReadable(response.body!);

      const responseHeaders = this.extractHeaders(response.headers);

      return {
        stream,
        contentType:
          responseHeaders['content-type'] || 'application/octet-stream',
        contentLength: responseHeaders['content-length']
          ? parseInt(responseHeaders['content-length'], 10)
          : undefined,
        contentRange: responseHeaders['content-range'],
        etag: responseHeaders['etag'],
        lastModified: responseHeaders['last-modified']
          ? new Date(responseHeaders['last-modified'])
          : undefined,
        hash: responseHeaders['x-goog-hash'] || responseHeaders['etag'],
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof PhotoProviderError) {
        throw error;
      }

      throw this.createProviderError(
        ProviderErrorCode.NETWORK_ERROR,
        `Download failed: ${(error as Error).message}`,
        { originalError: error }
      );
    }
  }

  // ===========================================================================
  // Token Management Methods
  // ===========================================================================

  /**
   * Set the current access token.
   *
   * @param accessToken - Access token
   * @param refreshToken - Refresh token
   * @param expiresAt - Token expiration time
   */
  public setTokens(
    accessToken: string,
    refreshToken?: string,
    expiresAt?: Date
  ): void {
    this.currentAccessToken = accessToken;
    if (refreshToken) {
      this.currentRefreshToken = refreshToken;
    }
    if (expiresAt) {
      this.tokenExpiresAt = expiresAt;
    }
  }

  /**
   * Check if the current token is expired or about to expire.
   *
   * @param bufferMs - Buffer time in milliseconds (default: 5 minutes)
   * @returns True if token is expired or about to expire
   */
  public isTokenExpired(bufferMs: number = 300000): boolean {
    if (!this.tokenExpiresAt) {
      return false; // Assume not expired if no expiration set
    }
    return Date.now() + bufferMs >= this.tokenExpiresAt.getTime();
  }

  /**
   * Ensure the access token is valid, refreshing if necessary.
   *
   * @returns Valid access token
   */
  protected async ensureValidToken(): Promise<string> {
    if (!this.currentAccessToken) {
      throw this.createProviderError(
        ProviderErrorCode.AUTH_FAILED,
        'No access token available'
      );
    }

    if (this.isTokenExpired() && this.currentRefreshToken) {
      await this.performTokenRefresh();
    }

    return this.currentAccessToken;
  }

  /**
   * Perform token refresh and notify callback.
   */
  protected async performTokenRefresh(): Promise<void> {
    if (!this.currentRefreshToken) {
      throw this.createProviderError(
        ProviderErrorCode.REFRESH_FAILED,
        'No refresh token available'
      );
    }

    try {
      const newTokens = await this.refreshAccessToken(this.currentRefreshToken);

      this.currentAccessToken = newTokens.accessToken;
      if (newTokens.refreshToken) {
        this.currentRefreshToken = newTokens.refreshToken;
      }
      this.tokenExpiresAt = new Date(Date.now() + newTokens.expiresIn * 1000);

      // Notify callback
      if (this.onTokenRefresh) {
        await this.onTokenRefresh(newTokens);
      }

      this.logDebug('Token refreshed successfully');
    } catch (error) {
      throw this.createProviderError(
        ProviderErrorCode.REFRESH_FAILED,
        `Token refresh failed: ${(error as Error).message}`,
        { originalError: error }
      );
    }
  }

  // ===========================================================================
  // Rate Limiting Methods
  // ===========================================================================

  /**
   * Check rate limit before making a request.
   *
   * @throws {PhotoProviderError} If rate limit is exceeded
   */
  protected async checkRateLimit(): Promise<void> {
    const rateLimiter = getProviderRateLimiter();
    const result = await rateLimiter.consume(
      this.rateLimiterProvider,
      this.userId
    );

    if (!result.allowed) {
      throw this.createProviderError(
        ProviderErrorCode.RATE_LIMITED,
        `Rate limit exceeded. Retry after ${result.retryAfterMs}ms`,
        { retryAfter: Math.ceil(result.retryAfterMs / 1000) }
      );
    }
  }

  /**
   * Wait for rate limit tokens to become available.
   *
   * @param timeoutMs - Maximum time to wait
   * @returns Rate limit consume result
   */
  protected async waitForRateLimit(
    timeoutMs: number = 30000
  ): Promise<ConsumeResult> {
    const rateLimiter = getProviderRateLimiter();
    return rateLimiter.consumeOrWait(this.rateLimiterProvider, this.userId, {
      waitTimeoutMs: timeoutMs,
    });
  }

  // ===========================================================================
  // Error Handling Methods
  // ===========================================================================

  /**
   * Create a provider error.
   *
   * @param code - Error code
   * @param message - Error message
   * @param options - Additional error options
   * @returns Provider error
   */
  protected createProviderError(
    code: ProviderErrorCode,
    message: string,
    options: {
      statusCode?: number;
      retryAfter?: number;
      originalError?: unknown;
      requestId?: string;
    } = {}
  ): PhotoProviderError {
    const error: ProviderError = {
      code,
      message,
      provider: this.provider,
      statusCode: options.statusCode,
      retryAfter: options.retryAfter,
      retryable: this.isRetryableErrorCode(code),
      originalError: options.originalError,
      requestId: options.requestId,
    };

    return new PhotoProviderError(error);
  }

  /**
   * Handle HTTP error response and create appropriate error.
   *
   * @param response - HTTP response
   * @param context - Request context
   * @returns Provider error
   */
  protected async handleErrorResponse(
    response: Response,
    context: RequestContext
  ): Promise<PhotoProviderError> {
    const status = response.status;
    let body: unknown;

    try {
      body = await response.json();
    } catch {
      body = await response.text().catch(() => 'Unknown error');
    }

    const requestId =
      response.headers.get('x-request-id') ||
      response.headers.get('request-id') ||
      undefined;

    // Determine error code based on status
    let code: ProviderErrorCode;
    let message = `HTTP ${status}: ${response.statusText}`;

    if (AUTH_ERROR_STATUS_CODES.has(status)) {
      code = status === 401 ? ProviderErrorCode.TOKEN_EXPIRED : ProviderErrorCode.FORBIDDEN;
      message = `Authentication error: ${this.extractErrorMessage(body)}`;
    } else if (RATE_LIMIT_STATUS_CODES.has(status)) {
      code = ProviderErrorCode.RATE_LIMITED;
      message = 'Rate limit exceeded';
    } else if (status === 404) {
      code = ProviderErrorCode.NOT_FOUND;
      message = 'Resource not found';
    } else if (SERVER_ERROR_STATUS_CODES.has(status)) {
      code = ProviderErrorCode.SERVICE_UNAVAILABLE;
      message = `Server error: ${this.extractErrorMessage(body)}`;
    } else if (status >= 400 && status < 500) {
      code = ProviderErrorCode.INVALID_REQUEST;
      message = `Invalid request: ${this.extractErrorMessage(body)}`;
    } else {
      code = ProviderErrorCode.UNKNOWN;
      message = `Unknown error: ${this.extractErrorMessage(body)}`;
    }

    // Extract Retry-After header
    const retryAfterHeader = response.headers.get('retry-after');
    let retryAfter: number | undefined;
    if (retryAfterHeader) {
      const seconds = parseInt(retryAfterHeader, 10);
      if (!isNaN(seconds)) {
        retryAfter = seconds;
      }
    }

    this.logDebug('Request failed', {
      ...context,
      status,
      code,
      message,
      body,
    });

    return this.createProviderError(code, message, {
      statusCode: status,
      retryAfter,
      requestId,
    });
  }

  /**
   * Handle OAuth error response.
   */
  protected async handleOAuthErrorResponse(
    response: Response,
    context: RequestContext
  ): Promise<PhotoProviderError> {
    const status = response.status;
    let body: { error?: string; error_description?: string };

    try {
      body = (await response.json()) as {
        error?: string;
        error_description?: string;
      };
    } catch {
      body = { error: 'unknown', error_description: 'Unknown OAuth error' };
    }

    const errorCode = body.error || 'unknown';
    const errorDescription = body.error_description || 'OAuth error';

    let code: ProviderErrorCode;
    if (
      errorCode === 'invalid_grant' ||
      errorCode === 'invalid_token' ||
      status === 401
    ) {
      code = ProviderErrorCode.REFRESH_FAILED;
    } else if (errorCode === 'access_denied' || status === 403) {
      code = ProviderErrorCode.FORBIDDEN;
    } else if (RATE_LIMIT_STATUS_CODES.has(status)) {
      code = ProviderErrorCode.RATE_LIMITED;
    } else {
      code = ProviderErrorCode.AUTH_FAILED;
    }

    this.logDebug('OAuth request failed', {
      ...context,
      status,
      errorCode,
      errorDescription,
    });

    return this.createProviderError(code, errorDescription, {
      statusCode: status,
    });
  }

  /**
   * Extract error message from response body.
   */
  protected extractErrorMessage(body: unknown): string {
    if (typeof body === 'string') {
      return body;
    }
    if (body && typeof body === 'object') {
      const obj = body as Record<string, unknown>;
      return (
        (obj.error_description as string) ||
        (obj.error as string) ||
        (obj.message as string) ||
        JSON.stringify(body)
      );
    }
    return 'Unknown error';
  }

  /**
   * Determine if an error is retryable.
   */
  protected shouldRetryRequest(error: Error): boolean {
    if (error instanceof PhotoProviderError) {
      return error.retryable;
    }
    if (error instanceof CircuitOpenError) {
      return false; // Don't retry if circuit is open
    }
    if (error instanceof RateLimitExceededError) {
      return true; // Rate limits are retryable
    }
    return isRetryableError(error);
  }

  /**
   * Check if an error code is retryable.
   */
  protected isRetryableErrorCode(code: ProviderErrorCode): boolean {
    return [
      ProviderErrorCode.RATE_LIMITED,
      ProviderErrorCode.SERVICE_UNAVAILABLE,
      ProviderErrorCode.NETWORK_ERROR,
      ProviderErrorCode.TIMEOUT,
    ].includes(code);
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Build a full URL with query parameters.
   */
  protected buildUrl(
    endpoint: string,
    query?: Record<string, string | number | boolean | undefined>
  ): string {
    // Handle absolute URLs
    const baseUrl = endpoint.startsWith('http')
      ? endpoint
      : `${this.config.apiBaseUrl}${endpoint}`;

    const url = new URL(baseUrl);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    return url.toString();
  }

  /**
   * Build OAuth authorization URL with standard parameters.
   */
  protected buildAuthorizationUrl(
    state: OAuthState,
    additionalParams?: Record<string, string>
  ): string {
    const params = new URLSearchParams({
      client_id: this.config.oauth.clientId,
      redirect_uri: this.config.oauth.redirectUri,
      response_type: 'code',
      scope: this.config.oauth.scopes.join(' '),
      state: state.state,
      access_type: 'offline', // Request refresh token
      prompt: 'consent', // Force consent to get refresh token
      ...additionalParams,
    });

    // Add PKCE code challenge if available
    if (state.codeVerifier) {
      params.set('code_challenge', this.generateCodeChallenge(state.codeVerifier));
      params.set('code_challenge_method', 'S256');
    }

    return `${this.config.oauth.authorizationUrl}?${params.toString()}`;
  }

  /**
   * Generate PKCE code challenge from verifier.
   */
  protected generateCodeChallenge(verifier: string): string {
    return createHash('sha256').update(verifier).digest('base64url');
  }

  /**
   * Generate a PKCE code verifier.
   */
  protected generateCodeVerifier(): string {
    return randomBytes(32).toString('base64url');
  }

  /**
   * Generate a correlation ID.
   */
  protected generateCorrelationId(): string {
    return randomUUID();
  }

  /**
   * Extract headers from Response.headers to plain object.
   */
  protected extractHeaders(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => {
      result[key.toLowerCase()] = value;
    });
    return result;
  }

  /**
   * Convert web ReadableStream to Node.js Readable.
   */
  protected webStreamToReadable(
    webStream: ReadableStream<Uint8Array>
  ): Readable {
    const reader = webStream.getReader();

    return new Readable({
      async read() {
        try {
          const { done, value } = await reader.read();
          if (done) {
            this.push(null);
          } else {
            this.push(Buffer.from(value));
          }
        } catch (error) {
          this.destroy(error as Error);
        }
      },
    });
  }

  /**
   * Map provider type to rate limiter provider type.
   */
  protected mapToRateLimiterProvider(provider: Provider): ProviderType {
    const mapping: Record<Provider, ProviderType> = {
      [Provider.GOOGLE_PHOTOS]: 'google',
      [Provider.DROPBOX]: 'dropbox',
      [Provider.ONEDRIVE]: 'onedrive',
      [Provider.AMAZON_PHOTOS]: 'amazon',
      [Provider.ICLOUD]: 'icloud',
    };
    return mapping[provider] || 'default';
  }

  /**
   * Split array into chunks.
   */
  protected chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Get default page size for listing operations.
   */
  protected getPageSize(requestedSize?: number): number {
    if (requestedSize) {
      return Math.min(requestedSize, this.config.maxPageSize);
    }
    return this.config.defaultPageSize || DEFAULT_PAGE_SIZE;
  }

  /**
   * Log debug message if debug mode is enabled.
   */
  protected logDebug(message: string, data?: Record<string, unknown>): void {
    if (this.debug) {
      console.log(`[${this.provider}] ${message}`, {
        userId: this.userId,
        correlationId: this.correlationId,
        ...data,
      });
    }
  }

  /**
   * Log error message.
   */
  protected logError(message: string, error?: unknown): void {
    console.error(`[${this.provider}] ${message}`, {
      userId: this.userId,
      correlationId: this.correlationId,
      error: error instanceof Error ? error.message : error,
    });
  }

  // ===========================================================================
  // Circuit Breaker Access
  // ===========================================================================

  /**
   * Get the circuit breaker instance.
   */
  public getCircuitBreaker(): CircuitBreaker {
    return this.circuitBreaker;
  }

  /**
   * Check if the provider is healthy (circuit not open).
   */
  public isHealthy(): boolean {
    return !this.circuitBreaker.isOpen();
  }

  /**
   * Get circuit breaker statistics.
   */
  public getCircuitStats() {
    return this.circuitBreaker.getStats();
  }
}

// ============================================================================
// Module Exports
// ============================================================================

export default BasePhotoProvider;
