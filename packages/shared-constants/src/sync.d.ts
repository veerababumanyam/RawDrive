/**
 * Sync Constants for Live Camera Sync Feature
 *
 * This module provides shared constants for:
 * - Sync status and state values (re-exported from shared-types for convenience)
 * - Rate limits for sync operations
 * - Timing and retry configuration
 * - Queue and batch limits
 * - WebSocket configuration
 *
 * @module sync
 */
export { SyncMappingStatus, SyncSessionStatus, SyncFileState, FileEventType, SyncEventType, SyncErrorCode, SyncWebSocketMessageType, } from '@rawdrive/shared-types';
/**
 * Rate limits for sync operations
 */
export declare const SYNC_RATE_LIMITS: {
    /** Maximum sync status update requests per minute */
    readonly STATUS_UPDATES_PER_MINUTE: 50;
    /** Maximum file events per minute per session */
    readonly FILE_EVENTS_PER_MINUTE: 200;
    /** Maximum WebSocket messages per second per connection */
    readonly WS_MESSAGES_PER_SECOND: 10;
    /** Maximum concurrent uploads per session */
    readonly MAX_CONCURRENT_UPLOADS: 5;
    /** Maximum file detection events per second (burst mode handling) */
    readonly MAX_FILE_DETECTIONS_PER_SECOND: 20;
};
/**
 * Timing constants for sync operations (in milliseconds)
 */
export declare const SYNC_TIMING: {
    /** File stability wait time - wait for file to stop changing before upload (ms) */
    readonly FILE_STABILITY_DELAY_MS: 2000;
    /** Minimum debounce time for batching file events (ms) */
    readonly FILE_EVENT_DEBOUNCE_MS: 500;
    /** Maximum wait time before processing a file batch (ms) */
    readonly FILE_BATCH_MAX_WAIT_MS: 5000;
    /** WebSocket heartbeat interval (ms) */
    readonly WS_HEARTBEAT_INTERVAL_MS: 30000;
    /** WebSocket heartbeat timeout - disconnect if no response (ms) */
    readonly WS_HEARTBEAT_TIMEOUT_MS: 10000;
    /** WebSocket reconnect base delay (ms) - uses exponential backoff */
    readonly WS_RECONNECT_BASE_DELAY_MS: 1000;
    /** WebSocket maximum reconnect delay (ms) */
    readonly WS_RECONNECT_MAX_DELAY_MS: 30000;
    /** Status update broadcast interval (ms) */
    readonly STATUS_BROADCAST_INTERVAL_MS: 1000;
    /** Upload timeout for individual chunks (ms) */
    readonly UPLOAD_CHUNK_TIMEOUT_MS: 60000;
    /** Upload timeout for entire file - extended for large RAW files (ms) */
    readonly UPLOAD_FILE_TIMEOUT_MS: 300000;
    /** Session idle timeout - end session if no activity (ms) */
    readonly SESSION_IDLE_TIMEOUT_MS: 1800000;
    /** Network reconnection detection poll interval (ms) */
    readonly NETWORK_POLL_INTERVAL_MS: 5000;
};
/**
 * Retry configuration for sync operations
 */
export declare const SYNC_RETRY: {
    /** Maximum retry attempts for failed uploads */
    readonly MAX_UPLOAD_RETRIES: 3;
    /** Maximum retry attempts for failed API calls */
    readonly MAX_API_RETRIES: 3;
    /** Maximum retry attempts for WebSocket reconnection */
    readonly MAX_WS_RECONNECT_ATTEMPTS: 10;
    /** Base delay for retry backoff (ms) */
    readonly RETRY_BASE_DELAY_MS: 1000;
    /** Maximum delay for retry backoff (ms) */
    readonly RETRY_MAX_DELAY_MS: 30000;
    /** Backoff multiplier for exponential backoff */
    readonly RETRY_BACKOFF_MULTIPLIER: 2;
    /** Jitter factor for retry delays (0-1) */
    readonly RETRY_JITTER_FACTOR: 0.1;
};
/**
 * Queue and batch size limits for sync operations
 */
export declare const SYNC_QUEUE_LIMITS: {
    /** Maximum files in the upload queue per session */
    readonly MAX_QUEUE_SIZE: 1000;
    /** Maximum file events in a single batch report */
    readonly MAX_BATCH_SIZE: 50;
    /** Maximum files to process in a single tick */
    readonly MAX_PROCESS_PER_TICK: 10;
    /** Queue depth threshold to trigger backpressure warning */
    readonly BACKPRESSURE_THRESHOLD: 100;
    /** Queue depth threshold to pause file detection */
    readonly PAUSE_DETECTION_THRESHOLD: 500;
    /** Minimum queue depth to resume file detection after pause */
    readonly RESUME_DETECTION_THRESHOLD: 250;
};
/**
 * File size limits specific to sync operations
 */
export declare const SYNC_FILE_LIMITS: {
    /** Maximum individual file size for sync (200MB for large RAW files) */
    readonly MAX_FILE_SIZE: number;
    /** Minimum file size to consider valid (skip 0-byte files) */
    readonly MIN_FILE_SIZE: 1;
    /** TUS chunk size for resumable uploads (10MB) */
    readonly UPLOAD_CHUNK_SIZE: number;
    /** Threshold for "large file" warning (50MB) */
    readonly LARGE_FILE_THRESHOLD: number;
    /** Maximum total upload size per session (10GB) */
    readonly MAX_SESSION_UPLOAD_SIZE: number;
};
/**
 * Limits for sync sessions
 */
export declare const SYNC_SESSION_LIMITS: {
    /** Maximum concurrent sync sessions per workspace */
    readonly MAX_SESSIONS_PER_WORKSPACE: 10;
    /** Maximum concurrent sync sessions per user */
    readonly MAX_SESSIONS_PER_USER: 5;
    /** Maximum sync mappings per workspace */
    readonly MAX_MAPPINGS_PER_WORKSPACE: 50;
    /** Maximum sync mappings per gallery */
    readonly MAX_MAPPINGS_PER_GALLERY: 5;
    /** Maximum WebSocket connections per sync session */
    readonly MAX_WS_CONNECTIONS_PER_SESSION: 3;
    /** Maximum total WebSocket connections per workspace */
    readonly MAX_WS_CONNECTIONS_PER_WORKSPACE: 100;
};
/**
 * WebSocket configuration for sync real-time communication
 */
export declare const SYNC_WEBSOCKET: {
    /** WebSocket path for sync events */
    readonly PATH: "/api/v1/sync/ws";
    /** WebSocket subprotocol */
    readonly SUBPROTOCOL: "sync-v1";
    /** Maximum message size (bytes) */
    readonly MAX_MESSAGE_SIZE: number;
    /** Connection timeout (ms) */
    readonly CONNECTION_TIMEOUT_MS: 10000;
    /** Ping interval (ms) */
    readonly PING_INTERVAL_MS: 30000;
    /** Pong timeout (ms) */
    readonly PONG_TIMEOUT_MS: 10000;
};
/**
 * Human-readable error messages for sync error codes
 */
export declare const SYNC_ERROR_MESSAGES: {
    readonly FOLDER_NOT_FOUND: "The specified folder does not exist or cannot be accessed.";
    readonly FOLDER_ACCESS_DENIED: "Permission denied to access the specified folder.";
    readonly GALLERY_NOT_FOUND: "The target gallery does not exist or has been deleted.";
    readonly GALLERY_ACCESS_DENIED: "You do not have permission to upload to this gallery.";
    readonly QUOTA_EXCEEDED: "Storage quota exceeded. Please upgrade your plan or free up space.";
    readonly NETWORK_ERROR: "Network connection lost. Sync will resume when connection is restored.";
    readonly UPLOAD_FAILED: "File upload failed. Will retry automatically.";
    readonly FILE_TOO_LARGE: "File exceeds the maximum allowed size of 200MB.";
    readonly UNSUPPORTED_FILE_TYPE: "This file type is not supported for sync.";
    readonly DUPLICATE_MAPPING: "A sync mapping already exists for this folder and gallery combination.";
    readonly SESSION_LIMIT_REACHED: "Maximum number of concurrent sync sessions reached.";
    readonly RATE_LIMITED: "Too many requests. Please wait before retrying.";
    readonly INTERNAL_ERROR: "An unexpected error occurred. Please try again later.";
};
/**
 * Default file patterns for sync operations
 */
export declare const SYNC_FILE_PATTERNS: {
    /** Default include patterns for image files */
    readonly DEFAULT_INCLUDE_PATTERNS: readonly ["*.jpg", "*.jpeg", "*.png", "*.heic", "*.heif", "*.cr2", "*.cr3", "*.nef", "*.arw", "*.raf", "*.orf", "*.rw2", "*.dng", "*.pef", "*.rwl", "*.srw", "*.tiff", "*.tif"];
    /** Default exclude patterns (system/temp files) */
    readonly DEFAULT_EXCLUDE_PATTERNS: readonly [".*", "_*", "~*", "*.tmp", "*.temp", "*.partial", "Thumbs.db", ".DS_Store", "*.xmp"];
    /** Patterns for RAW sidecar files */
    readonly SIDECAR_PATTERNS: readonly ["*.xmp", "*.pp3", "*.dop"];
};
/**
 * API path constants for sync endpoints
 */
export declare const SYNC_API_PATHS: {
    /** Base path for sync service */
    readonly BASE: "/api/v1/sync";
    /** Sync mappings endpoints */
    readonly MAPPINGS: "/api/v1/sync/mappings";
    /** Sync sessions endpoints */
    readonly SESSIONS: "/api/v1/sync/sessions";
    /** Sync events endpoints */
    readonly EVENTS: "/api/v1/sync/events";
    /** File events reporting endpoint */
    readonly FILE_EVENTS: "/api/v1/sync/file-events";
    /** Sync statistics endpoint */
    readonly STATS: "/api/v1/sync/stats";
    /** WebSocket endpoint */
    readonly WEBSOCKET: "/api/v1/sync/ws";
};
/**
 * Storage quota thresholds for sync warnings
 */
export declare const SYNC_QUOTA_THRESHOLDS: {
    /** Warning threshold (percentage of quota used) */
    readonly WARNING_PERCENT: 80;
    /** Critical threshold (percentage of quota used) */
    readonly CRITICAL_PERCENT: 95;
    /** Pause sync threshold (percentage of quota used) */
    readonly PAUSE_SYNC_PERCENT: 99;
};
/**
 * Consolidated sync constants export for convenience
 */
export declare const SYNC: {
    readonly RATE_LIMITS: {
        /** Maximum sync status update requests per minute */
        readonly STATUS_UPDATES_PER_MINUTE: 50;
        /** Maximum file events per minute per session */
        readonly FILE_EVENTS_PER_MINUTE: 200;
        /** Maximum WebSocket messages per second per connection */
        readonly WS_MESSAGES_PER_SECOND: 10;
        /** Maximum concurrent uploads per session */
        readonly MAX_CONCURRENT_UPLOADS: 5;
        /** Maximum file detection events per second (burst mode handling) */
        readonly MAX_FILE_DETECTIONS_PER_SECOND: 20;
    };
    readonly TIMING: {
        /** File stability wait time - wait for file to stop changing before upload (ms) */
        readonly FILE_STABILITY_DELAY_MS: 2000;
        /** Minimum debounce time for batching file events (ms) */
        readonly FILE_EVENT_DEBOUNCE_MS: 500;
        /** Maximum wait time before processing a file batch (ms) */
        readonly FILE_BATCH_MAX_WAIT_MS: 5000;
        /** WebSocket heartbeat interval (ms) */
        readonly WS_HEARTBEAT_INTERVAL_MS: 30000;
        /** WebSocket heartbeat timeout - disconnect if no response (ms) */
        readonly WS_HEARTBEAT_TIMEOUT_MS: 10000;
        /** WebSocket reconnect base delay (ms) - uses exponential backoff */
        readonly WS_RECONNECT_BASE_DELAY_MS: 1000;
        /** WebSocket maximum reconnect delay (ms) */
        readonly WS_RECONNECT_MAX_DELAY_MS: 30000;
        /** Status update broadcast interval (ms) */
        readonly STATUS_BROADCAST_INTERVAL_MS: 1000;
        /** Upload timeout for individual chunks (ms) */
        readonly UPLOAD_CHUNK_TIMEOUT_MS: 60000;
        /** Upload timeout for entire file - extended for large RAW files (ms) */
        readonly UPLOAD_FILE_TIMEOUT_MS: 300000;
        /** Session idle timeout - end session if no activity (ms) */
        readonly SESSION_IDLE_TIMEOUT_MS: 1800000;
        /** Network reconnection detection poll interval (ms) */
        readonly NETWORK_POLL_INTERVAL_MS: 5000;
    };
    readonly RETRY: {
        /** Maximum retry attempts for failed uploads */
        readonly MAX_UPLOAD_RETRIES: 3;
        /** Maximum retry attempts for failed API calls */
        readonly MAX_API_RETRIES: 3;
        /** Maximum retry attempts for WebSocket reconnection */
        readonly MAX_WS_RECONNECT_ATTEMPTS: 10;
        /** Base delay for retry backoff (ms) */
        readonly RETRY_BASE_DELAY_MS: 1000;
        /** Maximum delay for retry backoff (ms) */
        readonly RETRY_MAX_DELAY_MS: 30000;
        /** Backoff multiplier for exponential backoff */
        readonly RETRY_BACKOFF_MULTIPLIER: 2;
        /** Jitter factor for retry delays (0-1) */
        readonly RETRY_JITTER_FACTOR: 0.1;
    };
    readonly QUEUE_LIMITS: {
        /** Maximum files in the upload queue per session */
        readonly MAX_QUEUE_SIZE: 1000;
        /** Maximum file events in a single batch report */
        readonly MAX_BATCH_SIZE: 50;
        /** Maximum files to process in a single tick */
        readonly MAX_PROCESS_PER_TICK: 10;
        /** Queue depth threshold to trigger backpressure warning */
        readonly BACKPRESSURE_THRESHOLD: 100;
        /** Queue depth threshold to pause file detection */
        readonly PAUSE_DETECTION_THRESHOLD: 500;
        /** Minimum queue depth to resume file detection after pause */
        readonly RESUME_DETECTION_THRESHOLD: 250;
    };
    readonly FILE_LIMITS: {
        /** Maximum individual file size for sync (200MB for large RAW files) */
        readonly MAX_FILE_SIZE: number;
        /** Minimum file size to consider valid (skip 0-byte files) */
        readonly MIN_FILE_SIZE: 1;
        /** TUS chunk size for resumable uploads (10MB) */
        readonly UPLOAD_CHUNK_SIZE: number;
        /** Threshold for "large file" warning (50MB) */
        readonly LARGE_FILE_THRESHOLD: number;
        /** Maximum total upload size per session (10GB) */
        readonly MAX_SESSION_UPLOAD_SIZE: number;
    };
    readonly SESSION_LIMITS: {
        /** Maximum concurrent sync sessions per workspace */
        readonly MAX_SESSIONS_PER_WORKSPACE: 10;
        /** Maximum concurrent sync sessions per user */
        readonly MAX_SESSIONS_PER_USER: 5;
        /** Maximum sync mappings per workspace */
        readonly MAX_MAPPINGS_PER_WORKSPACE: 50;
        /** Maximum sync mappings per gallery */
        readonly MAX_MAPPINGS_PER_GALLERY: 5;
        /** Maximum WebSocket connections per sync session */
        readonly MAX_WS_CONNECTIONS_PER_SESSION: 3;
        /** Maximum total WebSocket connections per workspace */
        readonly MAX_WS_CONNECTIONS_PER_WORKSPACE: 100;
    };
    readonly WEBSOCKET: {
        /** WebSocket path for sync events */
        readonly PATH: "/api/v1/sync/ws";
        /** WebSocket subprotocol */
        readonly SUBPROTOCOL: "sync-v1";
        /** Maximum message size (bytes) */
        readonly MAX_MESSAGE_SIZE: number;
        /** Connection timeout (ms) */
        readonly CONNECTION_TIMEOUT_MS: 10000;
        /** Ping interval (ms) */
        readonly PING_INTERVAL_MS: 30000;
        /** Pong timeout (ms) */
        readonly PONG_TIMEOUT_MS: 10000;
    };
    readonly ERROR_MESSAGES: {
        readonly FOLDER_NOT_FOUND: "The specified folder does not exist or cannot be accessed.";
        readonly FOLDER_ACCESS_DENIED: "Permission denied to access the specified folder.";
        readonly GALLERY_NOT_FOUND: "The target gallery does not exist or has been deleted.";
        readonly GALLERY_ACCESS_DENIED: "You do not have permission to upload to this gallery.";
        readonly QUOTA_EXCEEDED: "Storage quota exceeded. Please upgrade your plan or free up space.";
        readonly NETWORK_ERROR: "Network connection lost. Sync will resume when connection is restored.";
        readonly UPLOAD_FAILED: "File upload failed. Will retry automatically.";
        readonly FILE_TOO_LARGE: "File exceeds the maximum allowed size of 200MB.";
        readonly UNSUPPORTED_FILE_TYPE: "This file type is not supported for sync.";
        readonly DUPLICATE_MAPPING: "A sync mapping already exists for this folder and gallery combination.";
        readonly SESSION_LIMIT_REACHED: "Maximum number of concurrent sync sessions reached.";
        readonly RATE_LIMITED: "Too many requests. Please wait before retrying.";
        readonly INTERNAL_ERROR: "An unexpected error occurred. Please try again later.";
    };
    readonly FILE_PATTERNS: {
        /** Default include patterns for image files */
        readonly DEFAULT_INCLUDE_PATTERNS: readonly ["*.jpg", "*.jpeg", "*.png", "*.heic", "*.heif", "*.cr2", "*.cr3", "*.nef", "*.arw", "*.raf", "*.orf", "*.rw2", "*.dng", "*.pef", "*.rwl", "*.srw", "*.tiff", "*.tif"];
        /** Default exclude patterns (system/temp files) */
        readonly DEFAULT_EXCLUDE_PATTERNS: readonly [".*", "_*", "~*", "*.tmp", "*.temp", "*.partial", "Thumbs.db", ".DS_Store", "*.xmp"];
        /** Patterns for RAW sidecar files */
        readonly SIDECAR_PATTERNS: readonly ["*.xmp", "*.pp3", "*.dop"];
    };
    readonly API_PATHS: {
        /** Base path for sync service */
        readonly BASE: "/api/v1/sync";
        /** Sync mappings endpoints */
        readonly MAPPINGS: "/api/v1/sync/mappings";
        /** Sync sessions endpoints */
        readonly SESSIONS: "/api/v1/sync/sessions";
        /** Sync events endpoints */
        readonly EVENTS: "/api/v1/sync/events";
        /** File events reporting endpoint */
        readonly FILE_EVENTS: "/api/v1/sync/file-events";
        /** Sync statistics endpoint */
        readonly STATS: "/api/v1/sync/stats";
        /** WebSocket endpoint */
        readonly WEBSOCKET: "/api/v1/sync/ws";
    };
    readonly QUOTA_THRESHOLDS: {
        /** Warning threshold (percentage of quota used) */
        readonly WARNING_PERCENT: 80;
        /** Critical threshold (percentage of quota used) */
        readonly CRITICAL_PERCENT: 95;
        /** Pause sync threshold (percentage of quota used) */
        readonly PAUSE_SYNC_PERCENT: 99;
    };
};
//# sourceMappingURL=sync.d.ts.map