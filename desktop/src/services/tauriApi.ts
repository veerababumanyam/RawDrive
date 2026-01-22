/**
 * Tauri API wrapper for RawDrive Desktop Sync.
 * Feature: 029-pro-review-xmp-sync
 * Task: T069
 *
 * TypeScript wrapper for invoking Tauri commands.
 */

import { invoke } from '@tauri-apps/api/core';

// =============================================================================
// Types
// =============================================================================

/** Authentication status returned from backend */
export interface AuthStatus {
  authenticated: boolean;
  workspace_id: string | null;
  user_id: string | null;
  api_key_prefix: string | null;
  error: string | null;
}

/** Result of login attempt */
export interface LoginResult {
  success: boolean;
  workspace_id: string | null;
  user_id: string | null;
  permissions: string[];
  scoped_gallery_ids: string[];
  galleries_accessible: number;
  error: string | null;
}

/** Sync direction for folder mappings */
export type SyncDirection = 'local_to_cloud' | 'cloud_to_local' | 'bidirectional';

/** Folder mapping configuration */
export interface FolderMapping {
  id: string;
  local_path: string;
  gallery_id: string;
  gallery_title: string;
  enabled: boolean;
  direction: SyncDirection;
  last_sync_at: string | null;
  created_at: string;
}

/** Request to create a new folder mapping */
export interface CreateMappingRequest {
  local_path: string;
  gallery_id: string;
  gallery_title: string;
  direction?: SyncDirection;
}

/** Request to update an existing folder mapping */
export interface UpdateMappingRequest {
  id: string;
  local_path?: string;
  gallery_id?: string;
  gallery_title?: string;
  enabled?: boolean;
  direction?: SyncDirection;
}

/** Application settings */
export interface AppSettings {
  start_on_login: boolean;
  minimize_to_tray: boolean;
  show_notifications: boolean;
  sync_interval_seconds: number;
  max_concurrent_uploads: number;
  show_menubar_status: boolean;
}

/** Request to update application settings */
export interface UpdateSettingsRequest {
  start_on_login?: boolean;
  minimize_to_tray?: boolean;
  show_notifications?: boolean;
  sync_interval_seconds?: number;
  max_concurrent_uploads?: number;
  show_menubar_status?: boolean;
}

/** Network connectivity status */
export type NetworkStatus = 'Connected' | 'Disconnected' | 'Reconnecting';

/** Sync status for a single mapping */
export interface MappingSyncStatus {
  mapping_id: string;
  local_path: string;
  gallery_id: string;
  gallery_title: string;
  is_syncing: boolean;
  is_paused: boolean;
  files_pending: number;
  files_uploading: number;
  files_completed: number;
  files_failed: number;
  current_file: string | null;
  progress_percent: number;
  last_sync: string | null;
  last_error: string | null;
}

/** Overall sync status */
export interface SyncStatus {
  is_running: boolean;
  is_paused: boolean;
  total_pending: number;
  total_uploading: number;
  total_completed: number;
  total_failed: number;
  total_bytes: number;
  bytes_transferred: number;
  overall_progress: number;
  mappings: MappingSyncStatus[];
  network_status: NetworkStatus;
}

/** Queue statistics */
export interface QueueStats {
  pending: number;
  in_progress: number;
  completed: number;
  failed: number;
  total_bytes: number;
  bytes_transferred: number;
}

/** XMP metadata for sync */
export interface XmpMetadata {
  rating: number | null;
  flag: string | null;
  color_label: string | null;
  original_filename: string | null;
}

// =============================================================================
// Auth Commands
// =============================================================================

/**
 * Login with an API key.
 * @param apiKey - The API key to authenticate with
 * @returns Login result with workspace info and permissions
 */
export async function login(apiKey: string): Promise<LoginResult> {
  return invoke<LoginResult>('login', { apiKey });
}

/**
 * Logout and clear stored credentials.
 */
export async function logout(): Promise<void> {
  return invoke<void>('logout');
}

/**
 * Get current authentication status.
 * @returns Current auth status including workspace info
 */
export async function getAuthStatus(): Promise<AuthStatus> {
  return invoke<AuthStatus>('get_auth_status');
}

/**
 * Validate the stored API key against the server.
 * @returns Validation result with updated workspace info
 */
export async function validateStoredKey(): Promise<LoginResult> {
  return invoke<LoginResult>('validate_stored_key');
}

// =============================================================================
// Folder Mapping Commands
// =============================================================================

/**
 * Get all folder mappings.
 * @returns List of all configured folder mappings
 */
export async function getMappings(): Promise<FolderMapping[]> {
  return invoke<FolderMapping[]>('get_mappings');
}

/**
 * Get a specific folder mapping.
 * @param id - The mapping ID
 * @returns The folder mapping or null if not found
 */
export async function getMapping(id: string): Promise<FolderMapping | null> {
  return invoke<FolderMapping | null>('get_mapping', { id });
}

/**
 * Create a new folder mapping.
 * @param request - The mapping configuration
 * @returns The created folder mapping
 */
export async function createMapping(
  request: CreateMappingRequest
): Promise<FolderMapping> {
  return invoke<FolderMapping>('create_mapping', { request });
}

/**
 * Update an existing folder mapping.
 * @param request - The update request with ID and fields to update
 * @returns The updated folder mapping
 */
export async function updateMapping(
  request: UpdateMappingRequest
): Promise<FolderMapping> {
  return invoke<FolderMapping>('update_mapping', { request });
}

/**
 * Delete a folder mapping.
 * @param id - The mapping ID to delete
 */
export async function deleteMapping(id: string): Promise<void> {
  return invoke<void>('delete_mapping', { id });
}

/**
 * Toggle a mapping's enabled state.
 * @param id - The mapping ID to toggle
 * @returns The updated folder mapping
 */
export async function toggleMapping(id: string): Promise<FolderMapping> {
  return invoke<FolderMapping>('toggle_mapping', { id });
}

// =============================================================================
// Settings Commands
// =============================================================================

/**
 * Get application settings.
 * @returns Current application settings
 */
export async function getSettings(): Promise<AppSettings> {
  return invoke<AppSettings>('get_settings');
}

/**
 * Update application settings.
 * @param request - The settings to update
 * @returns Updated application settings
 */
export async function updateSettings(
  request: UpdateSettingsRequest
): Promise<AppSettings> {
  return invoke<AppSettings>('update_settings', { request });
}

// =============================================================================
// Sync Commands
// =============================================================================

/**
 * Start syncing all enabled mappings.
 * @returns Current sync status
 */
export async function startSync(): Promise<SyncStatus> {
  return invoke<SyncStatus>('start_sync');
}

/**
 * Stop all syncing.
 */
export async function stopSync(): Promise<void> {
  return invoke<void>('stop_sync');
}

/**
 * Pause syncing (keeps file watching but stops uploads).
 */
export async function pauseSync(): Promise<void> {
  return invoke<void>('pause_sync');
}

/**
 * Resume syncing after pause.
 */
export async function resumeSync(): Promise<void> {
  return invoke<void>('resume_sync');
}

/**
 * Get current sync status.
 * @returns Current sync status including all mapping statuses
 */
export async function getSyncStatus(): Promise<SyncStatus> {
  return invoke<SyncStatus>('get_sync_status');
}

/**
 * Get queue statistics.
 * @returns Current queue statistics
 */
export async function getQueueStats(): Promise<QueueStats> {
  return invoke<QueueStats>('get_queue_stats');
}

/**
 * Scan a mapping folder for files to sync.
 * @param mappingId - The mapping ID to scan
 * @returns Number of files found
 */
export async function scanMapping(mappingId: string): Promise<number> {
  return invoke<number>('scan_mapping', { mappingId });
}

/**
 * Retry all failed items in the queue.
 */
export async function retryFailed(): Promise<void> {
  return invoke<void>('retry_failed');
}

/**
 * Clear completed items from the queue.
 */
export async function clearCompleted(): Promise<void> {
  return invoke<void>('clear_completed');
}

/**
 * Check network connectivity.
 * @returns Current network status
 */
export async function checkNetwork(): Promise<NetworkStatus> {
  return invoke<NetworkStatus>('check_network');
}

/**
 * Read XMP metadata from a sidecar file.
 * @param path - Path to the XMP file
 * @returns Parsed XMP metadata
 */
export async function readXmpMetadata(path: string): Promise<XmpMetadata> {
  return invoke<XmpMetadata>('read_xmp_metadata', { path });
}

/**
 * Write XMP metadata to a sidecar file.
 * @param path - Path to the XMP file
 * @param metadata - Metadata to write
 */
export async function writeXmpMetadata(
  path: string,
  metadata: XmpMetadata
): Promise<void> {
  return invoke<void>('write_xmp_metadata', { path, metadata });
}

// =============================================================================
// Export all as namespace
// =============================================================================

export const tauriApi = {
  // Auth
  login,
  logout,
  getAuthStatus,
  validateStoredKey,
  // Mappings
  getMappings,
  getMapping,
  createMapping,
  updateMapping,
  deleteMapping,
  toggleMapping,
  // Settings
  getSettings,
  updateSettings,
  // Sync
  startSync,
  stopSync,
  pauseSync,
  resumeSync,
  getSyncStatus,
  getQueueStats,
  scanMapping,
  retryFailed,
  clearCompleted,
  checkNetwork,
  readXmpMetadata,
  writeXmpMetadata,
};

export default tauriApi;
