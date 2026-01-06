/**
 * Comprehensive TypeScript types for Live Camera Sync feature.
 *
 * This module provides shared types for:
 * - Sync mappings (folder-to-gallery mappings)
 * - Sync sessions (active sync sessions)
 * - Sync events (file upload events)
 * - File event processing
 * - Real-time sync status updates
 *
 * @module sync
 */

// ---------------------------------------------------------------------------
// Core Enums / Union Types
// ---------------------------------------------------------------------------

/**
 * Status of a sync mapping
 */
export const SyncMappingStatus = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  DISABLED: 'disabled',
  ERROR: 'error',
} as const;
export type SyncMappingStatus = typeof SyncMappingStatus[keyof typeof SyncMappingStatus];

/**
 * Status of a sync session
 */
export const SyncSessionStatus = {
  INITIALIZING: 'initializing',
  WATCHING: 'watching',
  SYNCING: 'syncing',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  ERROR: 'error',
  DISCONNECTED: 'disconnected',
} as const;
export type SyncSessionStatus = typeof SyncSessionStatus[keyof typeof SyncSessionStatus];

/**
 * State of a file in the sync queue
 */
export const SyncFileState = {
  DETECTED: 'detected',
  QUEUED: 'queued',
  UPLOADING: 'uploading',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
  DUPLICATE: 'duplicate',
} as const;
export type SyncFileState = typeof SyncFileState[keyof typeof SyncFileState];

/**
 * Type of file event detected by the watcher
 */
export const FileEventType = {
  CREATED: 'created',
  MODIFIED: 'modified',
  RENAMED: 'renamed',
  DELETED: 'deleted',
} as const;
export type FileEventType = typeof FileEventType[keyof typeof FileEventType];

/**
 * Sync event type for audit logging
 */
export const SyncEventType = {
  SESSION_STARTED: 'session_started',
  SESSION_PAUSED: 'session_paused',
  SESSION_RESUMED: 'session_resumed',
  SESSION_ENDED: 'session_ended',
  FILE_DETECTED: 'file_detected',
  FILE_QUEUED: 'file_queued',
  UPLOAD_STARTED: 'upload_started',
  UPLOAD_PROGRESS: 'upload_progress',
  UPLOAD_COMPLETED: 'upload_completed',
  UPLOAD_FAILED: 'upload_failed',
  DUPLICATE_DETECTED: 'duplicate_detected',
  ERROR_OCCURRED: 'error_occurred',
  QUOTA_WARNING: 'quota_warning',
  QUOTA_EXCEEDED: 'quota_exceeded',
  CONNECTION_LOST: 'connection_lost',
  CONNECTION_RESTORED: 'connection_restored',
} as const;
export type SyncEventType = typeof SyncEventType[keyof typeof SyncEventType];

/**
 * Sync error codes for programmatic handling
 */
export const SyncErrorCode = {
  FOLDER_NOT_FOUND: 'FOLDER_NOT_FOUND',
  FOLDER_ACCESS_DENIED: 'FOLDER_ACCESS_DENIED',
  GALLERY_NOT_FOUND: 'GALLERY_NOT_FOUND',
  GALLERY_ACCESS_DENIED: 'GALLERY_ACCESS_DENIED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  UPLOAD_FAILED: 'UPLOAD_FAILED',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  UNSUPPORTED_FILE_TYPE: 'UNSUPPORTED_FILE_TYPE',
  DUPLICATE_MAPPING: 'DUPLICATE_MAPPING',
  SESSION_LIMIT_REACHED: 'SESSION_LIMIT_REACHED',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
export type SyncErrorCode = typeof SyncErrorCode[keyof typeof SyncErrorCode];

// ---------------------------------------------------------------------------
// Sync Mapping Interfaces
// ---------------------------------------------------------------------------

/**
 * Sync mapping between a local folder and a cloud gallery
 */
export interface SyncMapping {
  /** Unique sync mapping identifier */
  mapping_id: string;
  /** Workspace ID */
  workspace_id: string;
  /** Target gallery ID */
  gallery_id: string;
  /** Gallery name (denormalized for display) */
  gallery_name?: string;
  /** Local folder path */
  folder_path: string;
  /** Display name for the mapping */
  display_name?: string;
  /** Whether to sync nested folders */
  include_subfolders: boolean;
  /** File patterns to include (glob patterns, e.g., "*.jpg,*.raw") */
  include_patterns?: string[];
  /** File patterns to exclude */
  exclude_patterns?: string[];
  /** Current mapping status */
  status: SyncMappingStatus;
  /** Total files synced through this mapping */
  total_files_synced: number;
  /** Total bytes synced */
  total_bytes_synced: number;
  /** Last sync activity timestamp (ISO datetime) */
  last_sync_at?: string;
  /** Last error message if status is ERROR */
  last_error?: string;
  /** Last error code */
  last_error_code?: SyncErrorCode;
  /** User who created the mapping */
  created_by_user_id: string;
  /** Creation timestamp */
  created_at: string;
  /** Last update timestamp */
  updated_at: string;
}

/**
 * Request to create a new sync mapping
 */
export interface CreateSyncMappingRequest {
  /** Target gallery ID */
  gallery_id: string;
  /** Local folder path */
  folder_path: string;
  /** Display name for the mapping */
  display_name?: string;
  /** Whether to sync nested folders (default: false) */
  include_subfolders?: boolean;
  /** File patterns to include (glob patterns) */
  include_patterns?: string[];
  /** File patterns to exclude */
  exclude_patterns?: string[];
}

/**
 * Request to update an existing sync mapping
 */
export interface UpdateSyncMappingRequest {
  /** Update display name */
  display_name?: string;
  /** Update subfolder setting */
  include_subfolders?: boolean;
  /** Update include patterns */
  include_patterns?: string[];
  /** Update exclude patterns */
  exclude_patterns?: string[];
  /** Update mapping status */
  status?: SyncMappingStatus;
}

/**
 * Response after creating a sync mapping
 */
export interface CreateSyncMappingResponse {
  /** The created mapping */
  mapping: SyncMapping;
  /** Confirmation message */
  message: string;
}

// ---------------------------------------------------------------------------
// Sync Session Interfaces
// ---------------------------------------------------------------------------

/**
 * Active sync session
 */
export interface SyncSession {
  /** Unique session identifier */
  session_id: string;
  /** Parent mapping ID */
  mapping_id: string;
  /** Workspace ID */
  workspace_id: string;
  /** User who started the session */
  user_id: string;
  /** Current session status */
  status: SyncSessionStatus;
  /** When the session started */
  started_at: string;
  /** When the session ended (if applicable) */
  ended_at?: string;
  /** Total files detected in this session */
  files_detected: number;
  /** Files currently in queue */
  files_queued: number;
  /** Files currently uploading */
  files_uploading: number;
  /** Files successfully synced */
  files_completed: number;
  /** Files that failed to sync */
  files_failed: number;
  /** Files skipped (duplicates, unsupported) */
  files_skipped: number;
  /** Total bytes uploaded in this session */
  bytes_uploaded: number;
  /** Current upload speed (bytes per second) */
  upload_speed_bps?: number;
  /** Estimated time remaining (seconds) */
  eta_seconds?: number;
  /** Last activity timestamp */
  last_activity_at: string;
  /** Last error message if status is ERROR */
  last_error?: string;
  /** Last error code */
  last_error_code?: SyncErrorCode;
  /** Client/browser identifier for this session */
  client_id?: string;
  /** User agent string */
  user_agent?: string;
}

/**
 * Request to start a new sync session
 */
export interface StartSyncSessionRequest {
  /** Mapping ID to start syncing */
  mapping_id: string;
  /** Optional client identifier */
  client_id?: string;
}

/**
 * Response after starting a sync session
 */
export interface StartSyncSessionResponse {
  /** The created session */
  session: SyncSession;
  /** WebSocket URL for real-time updates */
  websocket_url: string;
  /** Confirmation message */
  message: string;
}

/**
 * Real-time sync status update (sent via WebSocket)
 */
export interface SyncStatusUpdate {
  /** Session ID */
  session_id: string;
  /** Update type */
  type: 'status' | 'progress' | 'file' | 'error' | 'complete';
  /** Session status */
  status: SyncSessionStatus;
  /** Progress information */
  progress: SyncProgress;
  /** Current file being processed (if applicable) */
  current_file?: SyncFileInfo;
  /** Error information (if applicable) */
  error?: SyncError;
  /** Update timestamp */
  timestamp: string;
}

/**
 * Sync progress information
 */
export interface SyncProgress {
  /** Files detected */
  files_detected: number;
  /** Files in queue */
  files_queued: number;
  /** Files uploading */
  files_uploading: number;
  /** Files completed */
  files_completed: number;
  /** Files failed */
  files_failed: number;
  /** Files skipped */
  files_skipped: number;
  /** Bytes uploaded */
  bytes_uploaded: number;
  /** Total bytes to upload */
  bytes_total?: number;
  /** Upload progress percentage (0-100) */
  progress_percent?: number;
  /** Current upload speed (bytes per second) */
  upload_speed_bps?: number;
  /** Estimated time remaining (seconds) */
  eta_seconds?: number;
}

// ---------------------------------------------------------------------------
// Sync Event Interfaces
// ---------------------------------------------------------------------------

/**
 * Sync event record for audit logging
 */
export interface SyncEvent {
  /** Unique event identifier */
  event_id: string;
  /** Session ID */
  session_id: string;
  /** Mapping ID */
  mapping_id: string;
  /** Workspace ID */
  workspace_id: string;
  /** Event type */
  event_type: SyncEventType;
  /** File path (if applicable) */
  file_path?: string;
  /** File name (if applicable) */
  file_name?: string;
  /** File size in bytes (if applicable) */
  file_size?: number;
  /** Asset ID (if file was synced) */
  asset_id?: string;
  /** Error message (if applicable) */
  error_message?: string;
  /** Error code (if applicable) */
  error_code?: SyncErrorCode;
  /** Additional event data */
  event_data?: Record<string, unknown>;
  /** Event timestamp */
  created_at: string;
}

// ---------------------------------------------------------------------------
// File Event Interfaces
// ---------------------------------------------------------------------------

/**
 * File information in sync context
 */
export interface SyncFileInfo {
  /** Local file path */
  file_path: string;
  /** File name */
  file_name: string;
  /** File extension */
  file_extension: string;
  /** File size in bytes */
  file_size: number;
  /** MIME type */
  mime_type?: string;
  /** File modification time (ISO datetime) */
  modified_at: string;
  /** SHA256 hash for duplicate detection */
  file_hash?: string;
  /** Current file state in sync process */
  state: SyncFileState;
  /** Upload progress percentage (0-100) */
  upload_progress?: number;
  /** Bytes uploaded so far */
  bytes_uploaded?: number;
  /** Resulting asset ID (if completed) */
  asset_id?: string;
  /** Error message (if failed) */
  error?: string;
  /** Error code (if failed) */
  error_code?: SyncErrorCode;
  /** Number of retry attempts */
  retry_count?: number;
  /** When the file was first detected */
  detected_at?: string;
  /** When upload started */
  upload_started_at?: string;
  /** When upload completed */
  completed_at?: string;
}

/**
 * File event from the folder watcher (sent from frontend to backend)
 */
export interface FileEvent {
  /** Session ID */
  session_id: string;
  /** Mapping ID */
  mapping_id: string;
  /** Event type */
  event_type: FileEventType;
  /** File path */
  file_path: string;
  /** File name */
  file_name: string;
  /** File size in bytes */
  file_size: number;
  /** MIME type */
  mime_type?: string;
  /** File modification time (ISO datetime) */
  modified_at: string;
  /** SHA256 hash for duplicate detection */
  file_hash?: string;
  /** Previous file path (for rename events) */
  old_path?: string;
  /** Event timestamp */
  timestamp: string;
}

/**
 * Request to report a batch of file events
 */
export interface ReportFileEventsRequest {
  /** Session ID */
  session_id: string;
  /** File events */
  events: FileEvent[];
}

/**
 * Response after reporting file events
 */
export interface ReportFileEventsResponse {
  /** Number of events processed */
  processed: number;
  /** Number of events queued for upload */
  queued: number;
  /** Number of duplicates skipped */
  duplicates_skipped: number;
  /** Number of unsupported files skipped */
  unsupported_skipped: number;
  /** Files that need to be uploaded (with upload URLs) */
  files_to_upload: FileUploadInstruction[];
}

/**
 * Instructions for uploading a file
 */
export interface FileUploadInstruction {
  /** File path */
  file_path: string;
  /** TUS upload URL */
  upload_url: string;
  /** Upload session ID (for TUS) */
  upload_session_id: string;
  /** Expected file size */
  expected_size: number;
  /** Upload deadline (ISO datetime) */
  expires_at: string;
}

// ---------------------------------------------------------------------------
// Error Interfaces
// ---------------------------------------------------------------------------

/**
 * Sync error information
 */
export interface SyncError {
  /** Error code */
  code: SyncErrorCode;
  /** Human-readable error message */
  message: string;
  /** File path (if applicable) */
  file_path?: string;
  /** Additional error details */
  details?: Record<string, unknown>;
  /** Whether the error is recoverable */
  recoverable: boolean;
  /** Suggested action */
  suggested_action?: string;
  /** Error timestamp */
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Statistics & Metrics Interfaces
// ---------------------------------------------------------------------------

/**
 * Sync statistics for a mapping
 */
export interface SyncMappingStats {
  /** Mapping ID */
  mapping_id: string;
  /** Total files synced (all time) */
  total_files_synced: number;
  /** Total bytes synced (all time) */
  total_bytes_synced: number;
  /** Total sessions */
  total_sessions: number;
  /** Files synced today */
  files_synced_today: number;
  /** Bytes synced today */
  bytes_synced_today: number;
  /** Average file size */
  average_file_size?: number;
  /** Average upload speed (bytes per second) */
  average_upload_speed_bps?: number;
  /** Success rate percentage */
  success_rate_percent: number;
  /** Last sync timestamp */
  last_sync_at?: string;
  /** Most common file types */
  file_type_breakdown?: Record<string, number>;
}

/**
 * Sync statistics for a workspace
 */
export interface WorkspaceSyncStats {
  /** Workspace ID */
  workspace_id: string;
  /** Total active mappings */
  total_mappings: number;
  /** Total active sessions */
  active_sessions: number;
  /** Total files synced (all time) */
  total_files_synced: number;
  /** Total bytes synced (all time) */
  total_bytes_synced: number;
  /** Files synced this month */
  files_synced_this_month: number;
  /** Bytes synced this month */
  bytes_synced_this_month: number;
  /** Storage quota used (bytes) */
  storage_quota_used: number;
  /** Storage quota limit (bytes) */
  storage_quota_limit: number;
  /** Storage quota percentage used */
  storage_quota_percent: number;
}

// ---------------------------------------------------------------------------
// WebSocket Message Types
// ---------------------------------------------------------------------------

/**
 * WebSocket message types for sync communication
 */
export const SyncWebSocketMessageType = {
  // Client to server
  SUBSCRIBE: 'subscribe',
  UNSUBSCRIBE: 'unsubscribe',
  FILE_EVENT: 'file_event',
  FILE_EVENTS_BATCH: 'file_events_batch',
  UPLOAD_PROGRESS: 'upload_progress',
  UPLOAD_COMPLETE: 'upload_complete',
  UPLOAD_FAILED: 'upload_failed',
  PAUSE_SESSION: 'pause_session',
  RESUME_SESSION: 'resume_session',
  END_SESSION: 'end_session',
  HEARTBEAT: 'heartbeat',

  // Server to client
  SESSION_UPDATE: 'session_update',
  STATUS_UPDATE: 'status_update',
  UPLOAD_INSTRUCTION: 'upload_instruction',
  ERROR: 'error',
  QUOTA_WARNING: 'quota_warning',
  HEARTBEAT_ACK: 'heartbeat_ack',
} as const;
export type SyncWebSocketMessageType = typeof SyncWebSocketMessageType[keyof typeof SyncWebSocketMessageType];

/**
 * Base WebSocket message structure
 */
export interface SyncWebSocketMessage<T = unknown> {
  /** Message type */
  type: SyncWebSocketMessageType;
  /** Session ID (if applicable) */
  session_id?: string;
  /** Message payload */
  payload: T;
  /** Message timestamp */
  timestamp: string;
  /** Message ID for acknowledgment */
  message_id?: string;
}

// ---------------------------------------------------------------------------
// List/Query Interfaces
// ---------------------------------------------------------------------------

/**
 * Query parameters for listing sync mappings
 */
export interface ListSyncMappingsQuery {
  /** Filter by gallery ID */
  gallery_id?: string;
  /** Filter by status */
  status?: SyncMappingStatus;
  /** Page number (1-based) */
  page?: number;
  /** Items per page */
  limit?: number;
  /** Sort field */
  sort_by?: 'created_at' | 'updated_at' | 'last_sync_at' | 'display_name';
  /** Sort direction */
  sort_order?: 'asc' | 'desc';
}

/**
 * Query parameters for listing sync sessions
 */
export interface ListSyncSessionsQuery {
  /** Filter by mapping ID */
  mapping_id?: string;
  /** Filter by status */
  status?: SyncSessionStatus;
  /** Filter by start date (ISO datetime) */
  started_after?: string;
  /** Filter by end date (ISO datetime) */
  started_before?: string;
  /** Page number (1-based) */
  page?: number;
  /** Items per page */
  limit?: number;
}

/**
 * Query parameters for listing sync events
 */
export interface ListSyncEventsQuery {
  /** Filter by session ID */
  session_id?: string;
  /** Filter by mapping ID */
  mapping_id?: string;
  /** Filter by event type */
  event_type?: SyncEventType;
  /** Filter by start date (ISO datetime) */
  after?: string;
  /** Filter by end date (ISO datetime) */
  before?: string;
  /** Page number (1-based) */
  page?: number;
  /** Items per page */
  limit?: number;
}
