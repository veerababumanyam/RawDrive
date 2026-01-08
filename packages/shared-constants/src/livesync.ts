/**
 * LiveSync Constants for Live Camera Sync Feature
 *
 * This module provides shared constants for:
 * - LiveSync status and state values (re-exported from shared-types for convenience)
 * - Rate limits for livesync operations
 * - Timing and retry configuration
 * - Queue and batch limits
 * - WebSocket configuration
 *
 * @module livesync
 */

import { STORAGE } from './storage';

// ---------------------------------------------------------------------------
// Re-export status enums from shared-types for convenience
// (These are defined in shared-types to colocate with their TypeScript types)
// ---------------------------------------------------------------------------

export {
  SyncMappingStatus,
  SyncSessionStatus,
  SyncFileState,
  FileEventType,
  SyncEventType,
  SyncErrorCode,
  SyncWebSocketMessageType,
} from '@rawdrive/shared-types';

// ---------------------------------------------------------------------------
// Sync Rate Limits
// ---------------------------------------------------------------------------

/**
 * Rate limits for sync operations
 */
export const SYNC_RATE_LIMITS = {
  /** Maximum sync status update requests per minute */
  STATUS_UPDATES_PER_MINUTE: 50,

  /** Maximum file events per minute per session */
  FILE_EVENTS_PER_MINUTE: 200,

  /** Maximum WebSocket messages per second per connection */
  WS_MESSAGES_PER_SECOND: 10,

  /** Maximum concurrent uploads per session */
  MAX_CONCURRENT_UPLOADS: 5,

  /** Maximum file detection events per second (burst mode handling) */
  MAX_FILE_DETECTIONS_PER_SECOND: 20,
} as const;

// ---------------------------------------------------------------------------
// Sync Timing Configuration
// ---------------------------------------------------------------------------

/**
 * Timing constants for sync operations (in milliseconds)
 */
export const SYNC_TIMING = {
  /** File stability wait time - wait for file to stop changing before upload (ms) */
  FILE_STABILITY_DELAY_MS: 2000,

  /** Minimum debounce time for batching file events (ms) */
  FILE_EVENT_DEBOUNCE_MS: 500,

  /** Maximum wait time before processing a file batch (ms) */
  FILE_BATCH_MAX_WAIT_MS: 5000,

  /** WebSocket heartbeat interval (ms) */
  WS_HEARTBEAT_INTERVAL_MS: 30000,

  /** WebSocket heartbeat timeout - disconnect if no response (ms) */
  WS_HEARTBEAT_TIMEOUT_MS: 10000,

  /** WebSocket reconnect base delay (ms) - uses exponential backoff */
  WS_RECONNECT_BASE_DELAY_MS: 1000,

  /** WebSocket maximum reconnect delay (ms) */
  WS_RECONNECT_MAX_DELAY_MS: 30000,

  /** Status update broadcast interval (ms) */
  STATUS_BROADCAST_INTERVAL_MS: 1000,

  /** Upload timeout for individual chunks (ms) */
  UPLOAD_CHUNK_TIMEOUT_MS: 60000,

  /** Upload timeout for entire file - extended for large RAW files (ms) */
  UPLOAD_FILE_TIMEOUT_MS: 300000, // 5 minutes

  /** Session idle timeout - end session if no activity (ms) */
  SESSION_IDLE_TIMEOUT_MS: 1800000, // 30 minutes

  /** Network reconnection detection poll interval (ms) */
  NETWORK_POLL_INTERVAL_MS: 5000,
} as const;

// ---------------------------------------------------------------------------
// Sync Retry Configuration
// ---------------------------------------------------------------------------

/**
 * Retry configuration for sync operations
 */
export const SYNC_RETRY = {
  /** Maximum retry attempts for failed uploads */
  MAX_UPLOAD_RETRIES: 3,

  /** Maximum retry attempts for failed API calls */
  MAX_API_RETRIES: 3,

  /** Maximum retry attempts for WebSocket reconnection */
  MAX_WS_RECONNECT_ATTEMPTS: 10,

  /** Base delay for retry backoff (ms) */
  RETRY_BASE_DELAY_MS: 1000,

  /** Maximum delay for retry backoff (ms) */
  RETRY_MAX_DELAY_MS: 30000,

  /** Backoff multiplier for exponential backoff */
  RETRY_BACKOFF_MULTIPLIER: 2,

  /** Jitter factor for retry delays (0-1) */
  RETRY_JITTER_FACTOR: 0.1,
} as const;

// ---------------------------------------------------------------------------
// Sync Queue & Batch Limits
// ---------------------------------------------------------------------------

/**
 * Queue and batch size limits for sync operations
 */
export const SYNC_QUEUE_LIMITS = {
  /** Maximum files in the upload queue per session */
  MAX_QUEUE_SIZE: 1000,

  /** Maximum file events in a single batch report */
  MAX_BATCH_SIZE: 50,

  /** Maximum files to process in a single tick */
  MAX_PROCESS_PER_TICK: 10,

  /** Queue depth threshold to trigger backpressure warning */
  BACKPRESSURE_THRESHOLD: 100,

  /** Queue depth threshold to pause file detection */
  PAUSE_DETECTION_THRESHOLD: 500,

  /** Minimum queue depth to resume file detection after pause */
  RESUME_DETECTION_THRESHOLD: 250,
} as const;

// ---------------------------------------------------------------------------
// Sync File Size Limits
// ---------------------------------------------------------------------------

/**
 * File size limits specific to sync operations
 */
export const SYNC_FILE_LIMITS = {
  /** Maximum individual file size for sync (200MB for large RAW files) */
  MAX_FILE_SIZE: 200 * STORAGE.MB,

  /** Minimum file size to consider valid (skip 0-byte files) */
  MIN_FILE_SIZE: 1,

  /** TUS chunk size for resumable uploads (10MB) */
  UPLOAD_CHUNK_SIZE: 10 * STORAGE.MB,

  /** Threshold for "large file" warning (50MB) */
  LARGE_FILE_THRESHOLD: 50 * STORAGE.MB,

  /** Maximum total upload size per session (10GB) */
  MAX_SESSION_UPLOAD_SIZE: 10 * STORAGE.GB,
} as const;

// ---------------------------------------------------------------------------
// Sync Session Limits
// ---------------------------------------------------------------------------

/**
 * Limits for sync sessions
 */
export const SYNC_SESSION_LIMITS = {
  /** Maximum concurrent sync sessions per workspace */
  MAX_SESSIONS_PER_WORKSPACE: 10,

  /** Maximum concurrent sync sessions per user */
  MAX_SESSIONS_PER_USER: 5,

  /** Maximum sync mappings per workspace */
  MAX_MAPPINGS_PER_WORKSPACE: 50,

  /** Maximum sync mappings per gallery */
  MAX_MAPPINGS_PER_GALLERY: 5,

  /** Maximum WebSocket connections per sync session */
  MAX_WS_CONNECTIONS_PER_SESSION: 3,

  /** Maximum total WebSocket connections per workspace */
  MAX_WS_CONNECTIONS_PER_WORKSPACE: 100,
} as const;

// ---------------------------------------------------------------------------
// Sync WebSocket Configuration
// ---------------------------------------------------------------------------

/**
 * WebSocket configuration for sync real-time communication
 */
export const LIVESYNC_WEBSOCKET = {
  /** WebSocket path for livesync events */
  PATH: '/api/v1/livesync/ws',

  /** WebSocket subprotocol */
  SUBPROTOCOL: 'livesync-v1',

  /** Maximum message size (bytes) */
  MAX_MESSAGE_SIZE: 64 * 1024, // 64KB

  /** Connection timeout (ms) */
  CONNECTION_TIMEOUT_MS: 10000,

  /** Ping interval (ms) */
  PING_INTERVAL_MS: 30000,

  /** Pong timeout (ms) */
  PONG_TIMEOUT_MS: 10000,
} as const;

/** @deprecated Use LIVESYNC_WEBSOCKET instead */
export const SYNC_WEBSOCKET = LIVESYNC_WEBSOCKET;

// ---------------------------------------------------------------------------
// Sync Error Messages
// ---------------------------------------------------------------------------

/**
 * Human-readable error messages for sync error codes
 */
export const SYNC_ERROR_MESSAGES = {
  FOLDER_NOT_FOUND: 'The specified folder does not exist or cannot be accessed.',
  FOLDER_ACCESS_DENIED: 'Permission denied to access the specified folder.',
  GALLERY_NOT_FOUND: 'The target gallery does not exist or has been deleted.',
  GALLERY_ACCESS_DENIED: 'You do not have permission to upload to this gallery.',
  QUOTA_EXCEEDED: 'Storage quota exceeded. Please upgrade your plan or free up space.',
  NETWORK_ERROR: 'Network connection lost. Sync will resume when connection is restored.',
  UPLOAD_FAILED: 'File upload failed. Will retry automatically.',
  FILE_TOO_LARGE: 'File exceeds the maximum allowed size of 200MB.',
  UNSUPPORTED_FILE_TYPE: 'This file type is not supported for sync.',
  DUPLICATE_MAPPING: 'A sync mapping already exists for this folder and gallery combination.',
  SESSION_LIMIT_REACHED: 'Maximum number of concurrent sync sessions reached.',
  RATE_LIMITED: 'Too many requests. Please wait before retrying.',
  INTERNAL_ERROR: 'An unexpected error occurred. Please try again later.',
} as const;

// ---------------------------------------------------------------------------
// Sync File Patterns
// ---------------------------------------------------------------------------

/**
 * Default file patterns for sync operations
 */
export const SYNC_FILE_PATTERNS = {
  /** Default include patterns for image files */
  DEFAULT_INCLUDE_PATTERNS: [
    '*.jpg',
    '*.jpeg',
    '*.png',
    '*.heic',
    '*.heif',
    '*.cr2',
    '*.cr3',
    '*.nef',
    '*.arw',
    '*.raf',
    '*.orf',
    '*.rw2',
    '*.dng',
    '*.pef',
    '*.rwl',
    '*.srw',
    '*.tiff',
    '*.tif',
  ],

  /** Default exclude patterns (system/temp files) */
  DEFAULT_EXCLUDE_PATTERNS: [
    '.*',           // Hidden files
    '_*',           // Temp files often prefixed with underscore
    '~*',           // Backup files
    '*.tmp',        // Temporary files
    '*.temp',       // Temporary files
    '*.partial',    // Partial downloads
    'Thumbs.db',    // Windows thumbnail cache
    '.DS_Store',    // macOS metadata
    '*.xmp',        // Sidecar files (sync separately if needed)
  ],

  /** Patterns for RAW sidecar files */
  SIDECAR_PATTERNS: [
    '*.xmp',
    '*.pp3',  // RawTherapee
    '*.dop',  // DxO
  ],
} as const;

// ---------------------------------------------------------------------------
// Sync API Paths
// ---------------------------------------------------------------------------

/**
 * API path constants for sync endpoints
 */
export const LIVESYNC_API_PATHS = {
  /** Base path for livesync service */
  BASE: '/api/v1/livesync',

  /** LiveSync mappings endpoints */
  MAPPINGS: '/api/v1/livesync/mappings',

  /** LiveSync sessions endpoints */
  SESSIONS: '/api/v1/livesync/sessions',

  /** LiveSync events endpoints */
  EVENTS: '/api/v1/livesync/events',

  /** File events reporting endpoint */
  FILE_EVENTS: '/api/v1/livesync/file-events',

  /** LiveSync statistics endpoint */
  STATS: '/api/v1/livesync/stats',

  /** WebSocket endpoint */
  WEBSOCKET: '/api/v1/livesync/ws',
} as const;

/** @deprecated Use LIVESYNC_API_PATHS instead */
export const SYNC_API_PATHS = LIVESYNC_API_PATHS;

// ---------------------------------------------------------------------------
// Sync Quota Thresholds
// ---------------------------------------------------------------------------

/**
 * Storage quota thresholds for sync warnings
 */
export const LIVESYNC_QUOTA_THRESHOLDS = {
  /** Warning threshold (percentage of quota used) */
  WARNING_PERCENT: 80,

  /** Critical threshold (percentage of quota used) */
  CRITICAL_PERCENT: 95,

  /** Pause livesync threshold (percentage of quota used) */
  PAUSE_SYNC_PERCENT: 99,
} as const;

/** @deprecated Use LIVESYNC_QUOTA_THRESHOLDS instead */
export const SYNC_QUOTA_THRESHOLDS = LIVESYNC_QUOTA_THRESHOLDS;

// ---------------------------------------------------------------------------
// LIVESYNC_ Aliases for Primary Constants (keeping SYNC_ for backwards compat)
// ---------------------------------------------------------------------------

/** LiveSync rate limits */
export const LIVESYNC_RATE_LIMITS = SYNC_RATE_LIMITS;
/** LiveSync timing configuration */
export const LIVESYNC_TIMING = SYNC_TIMING;
/** LiveSync retry configuration */
export const LIVESYNC_RETRY = SYNC_RETRY;
/** LiveSync queue limits */
export const LIVESYNC_QUEUE_LIMITS = SYNC_QUEUE_LIMITS;
/** LiveSync file limits */
export const LIVESYNC_FILE_LIMITS = SYNC_FILE_LIMITS;
/** LiveSync session limits */
export const LIVESYNC_SESSION_LIMITS = SYNC_SESSION_LIMITS;
/** LiveSync error messages */
export const LIVESYNC_ERROR_MESSAGES = SYNC_ERROR_MESSAGES;
/** LiveSync file patterns */
export const LIVESYNC_FILE_PATTERNS = SYNC_FILE_PATTERNS;

// ---------------------------------------------------------------------------
// Consolidated LiveSync Constants Export
// ---------------------------------------------------------------------------

/**
 * Consolidated livesync constants export for convenience
 */
export const LIVESYNC = {
  RATE_LIMITS: LIVESYNC_RATE_LIMITS,
  TIMING: LIVESYNC_TIMING,
  RETRY: LIVESYNC_RETRY,
  QUEUE_LIMITS: LIVESYNC_QUEUE_LIMITS,
  FILE_LIMITS: LIVESYNC_FILE_LIMITS,
  SESSION_LIMITS: LIVESYNC_SESSION_LIMITS,
  WEBSOCKET: LIVESYNC_WEBSOCKET,
  ERROR_MESSAGES: LIVESYNC_ERROR_MESSAGES,
  FILE_PATTERNS: LIVESYNC_FILE_PATTERNS,
  API_PATHS: LIVESYNC_API_PATHS,
  QUOTA_THRESHOLDS: LIVESYNC_QUOTA_THRESHOLDS,
} as const;

/** @deprecated Use LIVESYNC instead */
export const SYNC = LIVESYNC;
