/**
 * Photo Provider Interface and Types.
 *
 * Defines the contract for cloud storage provider adapters used in the
 * photo sync service. Each provider (Google Photos, Dropbox, OneDrive,
 * Amazon Photos, iCloud) must implement this interface to enable:
 * - OAuth authentication flow
 * - Photo enumeration and pagination
 * - Photo download with streaming support
 * - Incremental sync via change detection
 * - Token refresh and credential management
 *
 * The adapter pattern allows the sync service to work uniformly with
 * different providers while handling provider-specific API differences.
 *
 * @module providers/provider.interface
 */

import type { Readable } from 'node:stream';
import type { Provider } from '../types.js';

// ============================================================================
// Provider Configuration Types
// ============================================================================

/**
 * OAuth configuration for a provider.
 */
export interface OAuthConfig {
  /** OAuth client ID */
  clientId: string;
  /** OAuth client secret */
  clientSecret: string;
  /** OAuth redirect URI */
  redirectUri: string;
  /** OAuth scopes required for photo access */
  scopes: string[];
  /** OAuth authorization endpoint URL */
  authorizationUrl: string;
  /** OAuth token endpoint URL */
  tokenUrl: string;
  /** Optional: Token revocation endpoint URL */
  revokeUrl?: string;
  /** Optional: User info endpoint URL */
  userInfoUrl?: string;
}

/**
 * Provider-specific configuration options.
 */
export interface ProviderConfig {
  /** Provider identifier */
  provider: Provider;
  /** OAuth configuration */
  oauth: OAuthConfig;
  /** Base URL for provider API */
  apiBaseUrl: string;
  /** API version (if applicable) */
  apiVersion?: string;
  /** Maximum requests per minute (rate limiting) */
  maxRequestsPerMinute: number;
  /** Maximum concurrent downloads */
  maxConcurrentDownloads: number;
  /** Default page size for listing photos */
  defaultPageSize: number;
  /** Maximum page size supported by the API */
  maxPageSize: number;
  /** Supported photo formats */
  supportedFormats: string[];
  /** Whether the provider supports resumable downloads */
  supportsResumableDownloads: boolean;
  /** Whether the provider supports incremental sync */
  supportsIncrementalSync: boolean;
  /** Whether the provider supports albums/folders */
  supportsAlbums: boolean;
  /** Request timeout in milliseconds */
  requestTimeoutMs: number;
  /** Download timeout in milliseconds */
  downloadTimeoutMs: number;
}

// ============================================================================
// Authentication Types
// ============================================================================

/**
 * OAuth tokens returned from the provider.
 */
export interface OAuthTokens {
  /** Access token for API requests */
  accessToken: string;
  /** Refresh token for obtaining new access tokens */
  refreshToken?: string;
  /** Token type (usually 'Bearer') */
  tokenType: string;
  /** Access token expiration time in seconds from now */
  expiresIn: number;
  /** Refresh token expiration time in seconds from now (if provided) */
  refreshTokenExpiresIn?: number;
  /** OAuth scopes granted */
  scope?: string;
  /** ID token for OpenID Connect providers */
  idToken?: string;
}

/**
 * User account information from the provider.
 */
export interface ProviderAccountInfo {
  /** Provider-specific account ID */
  accountId: string;
  /** User's email address */
  email?: string;
  /** User's display name */
  displayName?: string;
  /** URL to user's profile picture */
  profilePictureUrl?: string;
  /** Account storage quota (in bytes) */
  quotaBytes?: number;
  /** Storage used (in bytes) */
  usedBytes?: number;
}

/**
 * State required for OAuth flow.
 */
export interface OAuthState {
  /** Random state parameter for CSRF protection */
  state: string;
  /** PKCE code verifier (for providers that support PKCE) */
  codeVerifier?: string;
  /** Original redirect URL after OAuth completion */
  redirectUrl: string;
  /** User ID initiating the OAuth flow */
  userId: string;
  /** Timestamp when the state was created */
  createdAt: Date;
}

/**
 * Parameters for exchanging OAuth authorization code.
 */
export interface OAuthExchangeParams {
  /** Authorization code from OAuth callback */
  code: string;
  /** State parameter for CSRF verification */
  state: string;
  /** PKCE code verifier (if used) */
  codeVerifier?: string;
}

// ============================================================================
// Photo Types
// ============================================================================

/**
 * Photo item returned from provider API.
 * Contains metadata about a photo in the cloud storage.
 */
export interface ProviderPhoto {
  /** Provider-specific unique photo ID */
  id: string;
  /** Original filename */
  filename: string;
  /** MIME type of the photo */
  mimeType: string;
  /** File size in bytes */
  sizeBytes: number;
  /** Photo width in pixels */
  width?: number;
  /** Photo height in pixels */
  height?: number;
  /** When the photo was taken (from EXIF or provider metadata) */
  takenAt?: Date;
  /** When the photo was created/uploaded to the provider */
  createdAt: Date;
  /** When the photo was last modified */
  modifiedAt: Date;
  /** URL to download the original photo */
  downloadUrl: string;
  /** URL to a thumbnail (if available) */
  thumbnailUrl?: string;
  /** Hash/checksum of the photo (provider-specific format) */
  hash?: string;
  /** Provider-specific metadata */
  metadata?: ProviderPhotoMetadata;
  /** Album/folder IDs containing this photo */
  albumIds?: string[];
  /** Description or caption */
  description?: string;
  /** Whether this is a video (for providers that mix media) */
  isVideo: boolean;
  /** Video duration in seconds (if video) */
  videoDuration?: number;
}

/**
 * Provider-specific photo metadata.
 * Different providers return different metadata formats.
 */
export interface ProviderPhotoMetadata {
  /** Camera make (from EXIF) */
  cameraMake?: string;
  /** Camera model (from EXIF) */
  cameraModel?: string;
  /** Focal length in mm */
  focalLength?: number;
  /** Aperture f-number */
  aperture?: number;
  /** ISO sensitivity */
  iso?: number;
  /** Exposure time in seconds */
  exposureTime?: number;
  /** GPS latitude */
  latitude?: number;
  /** GPS longitude */
  longitude?: number;
  /** GPS altitude in meters */
  altitude?: number;
  /** Image orientation (1-8 EXIF values) */
  orientation?: number;
  /** Provider-specific raw metadata */
  raw?: Record<string, unknown>;
}

/**
 * Result of listing photos from a provider.
 */
export interface PhotoListResult {
  /** List of photos in this page */
  photos: ProviderPhoto[];
  /** Cursor for the next page (null if no more pages) */
  nextPageToken?: string;
  /** Total count of photos (if known by provider) */
  totalCount?: number;
  /** Whether there are more photos to fetch */
  hasMore: boolean;
}

/**
 * Options for listing photos.
 */
export interface PhotoListOptions {
  /** Page token for pagination */
  pageToken?: string;
  /** Number of photos per page */
  pageSize?: number;
  /** Filter by album/folder ID */
  albumId?: string;
  /** Filter photos created/modified after this date */
  createdAfter?: Date;
  /** Filter photos created/modified before this date */
  createdBefore?: Date;
  /** Include videos in results */
  includeVideos?: boolean;
  /** Sort order */
  sortOrder?: 'newest' | 'oldest';
  /** Filter by MIME types */
  mimeTypes?: string[];
}

// ============================================================================
// Album/Folder Types
// ============================================================================

/**
 * Album or folder from the provider.
 */
export interface ProviderAlbum {
  /** Provider-specific album ID */
  id: string;
  /** Album name/title */
  name: string;
  /** Number of items in the album */
  itemCount?: number;
  /** Cover photo URL */
  coverPhotoUrl?: string;
  /** When the album was created */
  createdAt?: Date;
  /** When the album was last modified */
  modifiedAt?: Date;
  /** Whether this is a shared album */
  isShared?: boolean;
  /** Provider-specific album type */
  albumType?: string;
}

/**
 * Result of listing albums from a provider.
 */
export interface AlbumListResult {
  /** List of albums in this page */
  albums: ProviderAlbum[];
  /** Cursor for the next page */
  nextPageToken?: string;
  /** Whether there are more albums to fetch */
  hasMore: boolean;
}

// ============================================================================
// Sync Types
// ============================================================================

/**
 * Change detection result for incremental sync.
 */
export interface SyncChanges {
  /** New photos added since last sync */
  added: ProviderPhoto[];
  /** Photos that were modified */
  modified: ProviderPhoto[];
  /** IDs of photos that were deleted */
  deleted: string[];
  /** New sync token/cursor to store */
  syncToken: string;
  /** Whether there are more changes to fetch */
  hasMore: boolean;
  /** Timestamp of the oldest change in this batch */
  oldestChangeAt?: Date;
  /** Timestamp of the newest change in this batch */
  newestChangeAt?: Date;
}

/**
 * Options for fetching sync changes.
 */
export interface SyncChangesOptions {
  /** Previous sync token/cursor */
  syncToken?: string;
  /** Maximum number of changes to return */
  maxResults?: number;
  /** Include deleted items */
  includeDeleted?: boolean;
}

/**
 * Sync cursor/checkpoint for resumable syncs.
 */
export interface SyncCursor {
  /** Provider-specific sync token */
  token: string;
  /** Timestamp when this cursor was obtained */
  obtainedAt: Date;
  /** Provider-reported last change timestamp */
  lastChangeAt?: Date;
  /** Additional cursor data */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Download Types
// ============================================================================

/**
 * Options for downloading a photo.
 */
export interface DownloadOptions {
  /** Desired quality: 'original', 'high', 'medium', 'low' */
  quality?: 'original' | 'high' | 'medium' | 'low';
  /** Maximum width for resized download (if supported) */
  maxWidth?: number;
  /** Maximum height for resized download (if supported) */
  maxHeight?: number;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
  /** Range start for resumable downloads */
  rangeStart?: number;
  /** Range end for resumable downloads */
  rangeEnd?: number;
}

/**
 * Result of a photo download operation.
 */
export interface DownloadResult {
  /** Readable stream of photo data */
  stream: Readable;
  /** Content type of the downloaded file */
  contentType: string;
  /** Content length in bytes (if known) */
  contentLength?: number;
  /** Content range for partial downloads */
  contentRange?: string;
  /** ETag for caching/verification */
  etag?: string;
  /** Last modified timestamp */
  lastModified?: Date;
  /** Hash/checksum of the content */
  hash?: string;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Provider error codes.
 */
export enum ProviderErrorCode {
  /** Authentication failed or token invalid */
  AUTH_FAILED = 'AUTH_FAILED',
  /** Token expired, needs refresh */
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  /** Token refresh failed */
  REFRESH_FAILED = 'REFRESH_FAILED',
  /** Rate limit exceeded */
  RATE_LIMITED = 'RATE_LIMITED',
  /** Resource not found */
  NOT_FOUND = 'NOT_FOUND',
  /** Permission denied */
  FORBIDDEN = 'FORBIDDEN',
  /** Provider service unavailable */
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  /** Network error */
  NETWORK_ERROR = 'NETWORK_ERROR',
  /** Request timeout */
  TIMEOUT = 'TIMEOUT',
  /** Invalid request */
  INVALID_REQUEST = 'INVALID_REQUEST',
  /** Quota exceeded */
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  /** Unknown error */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Provider-specific error with structured details.
 */
export interface ProviderError {
  /** Error code */
  code: ProviderErrorCode;
  /** Human-readable error message */
  message: string;
  /** Provider identifier */
  provider: Provider;
  /** HTTP status code (if applicable) */
  statusCode?: number;
  /** Retry-After header value in seconds (for rate limits) */
  retryAfter?: number;
  /** Whether this error is retryable */
  retryable: boolean;
  /** Original error from the provider */
  originalError?: unknown;
  /** Request ID for debugging */
  requestId?: string;
}

/**
 * Custom error class for provider errors.
 */
export class PhotoProviderError extends Error {
  /** Error code */
  public readonly code: ProviderErrorCode;
  /** Provider identifier */
  public readonly provider: Provider;
  /** HTTP status code */
  public readonly statusCode?: number;
  /** Retry-After header value in seconds */
  public readonly retryAfter?: number;
  /** Whether this error is retryable */
  public readonly retryable: boolean;
  /** Original error */
  public readonly originalError?: unknown;
  /** Request ID */
  public readonly requestId?: string;

  constructor(error: ProviderError) {
    super(error.message);
    this.name = 'PhotoProviderError';
    this.code = error.code;
    this.provider = error.provider;
    this.statusCode = error.statusCode;
    this.retryAfter = error.retryAfter;
    this.retryable = error.retryable;
    this.originalError = error.originalError;
    this.requestId = error.requestId;
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert error to JSON-serializable object.
   */
  toJSON(): ProviderError {
    return {
      code: this.code,
      message: this.message,
      provider: this.provider,
      statusCode: this.statusCode,
      retryAfter: this.retryAfter,
      retryable: this.retryable,
      requestId: this.requestId,
    };
  }

  /**
   * Check if the error is an authentication error.
   */
  isAuthError(): boolean {
    return (
      this.code === ProviderErrorCode.AUTH_FAILED ||
      this.code === ProviderErrorCode.TOKEN_EXPIRED ||
      this.code === ProviderErrorCode.REFRESH_FAILED
    );
  }

  /**
   * Check if the error is a rate limit error.
   */
  isRateLimitError(): boolean {
    return this.code === ProviderErrorCode.RATE_LIMITED;
  }

  /**
   * Check if the error indicates the service is unavailable.
   */
  isServiceUnavailable(): boolean {
    return (
      this.code === ProviderErrorCode.SERVICE_UNAVAILABLE ||
      this.code === ProviderErrorCode.NETWORK_ERROR
    );
  }
}

// ============================================================================
// Provider Interface
// ============================================================================

/**
 * Photo Provider Interface.
 *
 * Defines the contract that all cloud storage provider adapters must implement.
 * This interface enables uniform interaction with different providers
 * (Google Photos, Dropbox, OneDrive, Amazon Photos, iCloud) while abstracting
 * away provider-specific API differences.
 *
 * @example
 * ```ts
 * class GooglePhotosProvider implements IPhotoProvider {
 *   // Implementation for Google Photos API
 * }
 *
 * // Usage in sync service
 * const provider = ProviderFactory.create(Provider.GOOGLE_PHOTOS, credentials);
 * const photos = await provider.listPhotos({ pageSize: 100 });
 * ```
 */
export interface IPhotoProvider {
  // ===========================================================================
  // Properties
  // ===========================================================================

  /**
   * Provider identifier.
   */
  readonly provider: Provider;

  /**
   * Provider configuration.
   */
  readonly config: ProviderConfig;

  // ===========================================================================
  // Authentication Methods
  // ===========================================================================

  /**
   * Generate the OAuth authorization URL for user consent.
   *
   * @param state - OAuth state object for CSRF protection
   * @returns Authorization URL to redirect the user to
   */
  getAuthorizationUrl(state: OAuthState): string;

  /**
   * Exchange an authorization code for access tokens.
   *
   * @param params - OAuth exchange parameters
   * @returns OAuth tokens
   * @throws {PhotoProviderError} If exchange fails
   */
  exchangeAuthorizationCode(params: OAuthExchangeParams): Promise<OAuthTokens>;

  /**
   * Refresh an expired access token.
   *
   * @param refreshToken - Refresh token to use
   * @returns New OAuth tokens
   * @throws {PhotoProviderError} If refresh fails
   */
  refreshAccessToken(refreshToken: string): Promise<OAuthTokens>;

  /**
   * Revoke OAuth tokens (disconnect provider).
   *
   * @param accessToken - Access token to revoke
   * @returns True if revocation was successful
   */
  revokeToken(accessToken: string): Promise<boolean>;

  /**
   * Get user account information from the provider.
   *
   * @param accessToken - Access token for authentication
   * @returns Provider account information
   * @throws {PhotoProviderError} If request fails
   */
  getAccountInfo(accessToken: string): Promise<ProviderAccountInfo>;

  /**
   * Validate that an access token is still valid.
   *
   * @param accessToken - Access token to validate
   * @returns True if the token is valid
   */
  validateToken(accessToken: string): Promise<boolean>;

  // ===========================================================================
  // Photo Listing Methods
  // ===========================================================================

  /**
   * List photos from the provider.
   *
   * @param accessToken - Access token for authentication
   * @param options - Listing options (pagination, filters)
   * @returns Photo list result with pagination info
   * @throws {PhotoProviderError} If listing fails
   */
  listPhotos(accessToken: string, options?: PhotoListOptions): Promise<PhotoListResult>;

  /**
   * Get a single photo by ID.
   *
   * @param accessToken - Access token for authentication
   * @param photoId - Provider-specific photo ID
   * @returns Photo details or null if not found
   * @throws {PhotoProviderError} If request fails
   */
  getPhoto(accessToken: string, photoId: string): Promise<ProviderPhoto | null>;

  /**
   * Get multiple photos by IDs.
   *
   * @param accessToken - Access token for authentication
   * @param photoIds - Array of photo IDs
   * @returns Map of photo ID to photo details (missing photos are omitted)
   * @throws {PhotoProviderError} If request fails
   */
  getPhotos(accessToken: string, photoIds: string[]): Promise<Map<string, ProviderPhoto>>;

  // ===========================================================================
  // Album Methods (Optional - depends on provider support)
  // ===========================================================================

  /**
   * List albums/folders from the provider.
   *
   * @param accessToken - Access token for authentication
   * @param pageToken - Pagination token
   * @returns Album list result
   * @throws {PhotoProviderError} If request fails
   */
  listAlbums?(accessToken: string, pageToken?: string): Promise<AlbumListResult>;

  /**
   * Get photos from a specific album.
   *
   * @param accessToken - Access token for authentication
   * @param albumId - Album ID
   * @param options - Listing options
   * @returns Photo list result
   * @throws {PhotoProviderError} If request fails
   */
  listAlbumPhotos?(
    accessToken: string,
    albumId: string,
    options?: PhotoListOptions
  ): Promise<PhotoListResult>;

  // ===========================================================================
  // Download Methods
  // ===========================================================================

  /**
   * Download a photo by ID.
   *
   * @param accessToken - Access token for authentication
   * @param photoId - Provider-specific photo ID
   * @param options - Download options (quality, range)
   * @returns Download result with readable stream
   * @throws {PhotoProviderError} If download fails
   */
  downloadPhoto(
    accessToken: string,
    photoId: string,
    options?: DownloadOptions
  ): Promise<DownloadResult>;

  /**
   * Download a photo from a URL.
   * Some providers return temporary download URLs that can be fetched directly.
   *
   * @param accessToken - Access token for authentication
   * @param downloadUrl - URL to download from
   * @param options - Download options
   * @returns Download result with readable stream
   * @throws {PhotoProviderError} If download fails
   */
  downloadFromUrl(
    accessToken: string,
    downloadUrl: string,
    options?: DownloadOptions
  ): Promise<DownloadResult>;

  // ===========================================================================
  // Sync Methods
  // ===========================================================================

  /**
   * Get changes since the last sync (for incremental sync).
   * Not all providers support this - check config.supportsIncrementalSync.
   *
   * @param accessToken - Access token for authentication
   * @param options - Sync options including previous token
   * @returns Sync changes (added, modified, deleted)
   * @throws {PhotoProviderError} If request fails
   */
  getChanges?(accessToken: string, options?: SyncChangesOptions): Promise<SyncChanges>;

  /**
   * Get an initial sync cursor/token for future incremental syncs.
   * Call this after completing a full sync.
   *
   * @param accessToken - Access token for authentication
   * @returns Initial sync cursor
   * @throws {PhotoProviderError} If request fails
   */
  getInitialSyncCursor?(accessToken: string): Promise<SyncCursor>;

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Test the connection to the provider.
   * Used for health checks and connectivity verification.
   *
   * @param accessToken - Access token for authentication
   * @returns True if connection is healthy
   */
  testConnection(accessToken: string): Promise<boolean>;

  /**
   * Get the total photo count for the user.
   * Not all providers support this efficiently.
   *
   * @param accessToken - Access token for authentication
   * @returns Total photo count or null if not supported
   */
  getTotalPhotoCount?(accessToken: string): Promise<number | null>;

  /**
   * Get storage quota information.
   *
   * @param accessToken - Access token for authentication
   * @returns Quota info with total and used bytes
   */
  getStorageQuota?(
    accessToken: string
  ): Promise<{ totalBytes: number; usedBytes: number } | null>;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a provider supports albums.
 */
export function supportsAlbums(
  provider: IPhotoProvider
): provider is IPhotoProvider & Required<Pick<IPhotoProvider, 'listAlbums' | 'listAlbumPhotos'>> {
  return provider.config.supportsAlbums &&
    typeof provider.listAlbums === 'function' &&
    typeof provider.listAlbumPhotos === 'function';
}

/**
 * Type guard to check if a provider supports incremental sync.
 */
export function supportsIncrementalSync(
  provider: IPhotoProvider
): provider is IPhotoProvider & Required<Pick<IPhotoProvider, 'getChanges' | 'getInitialSyncCursor'>> {
  return provider.config.supportsIncrementalSync &&
    typeof provider.getChanges === 'function' &&
    typeof provider.getInitialSyncCursor === 'function';
}

/**
 * Type guard to check if an error is a PhotoProviderError.
 */
export function isPhotoProviderError(error: unknown): error is PhotoProviderError {
  return error instanceof PhotoProviderError;
}

// ============================================================================
// Factory Types
// ============================================================================

/**
 * Context for creating a provider instance.
 */
export interface ProviderContext {
  /** User ID for logging and tracking */
  userId: string;
  /** Correlation ID for request tracing */
  correlationId?: string;
  /** Access token for authentication */
  accessToken: string;
  /** Refresh token (optional, for auto-refresh) */
  refreshToken?: string;
  /** Token expiration time */
  tokenExpiresAt?: Date;
}

/**
 * Factory function type for creating provider instances.
 */
export type ProviderFactory = (context: ProviderContext) => IPhotoProvider;

// ============================================================================
// Module Exports
// ============================================================================

export default {
  // Error class
  PhotoProviderError,

  // Error codes
  ProviderErrorCode,

  // Type guards
  supportsAlbums,
  supportsIncrementalSync,
  isPhotoProviderError,
};
