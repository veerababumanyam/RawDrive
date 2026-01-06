/**
 * Sync Service Client
 *
 * Provides API client for Live Camera Sync feature:
 * - Sync mapping CRUD operations
 * - Sync session management
 * - Real-time sync status via WebSocket
 */

import { apiClient, type ApiResponse } from './api';
import type {
  SyncMappingStatus,
  SyncSessionStatus,
  CreateSyncMappingRequest,
  UpdateSyncMappingRequest,
  StartSyncSessionRequest,
  SyncMappingStats,
} from '@rawdrive/shared-types';

// Base URL for sync service (routed through Traefik)
const SYNC_API_BASE = '/api/v1/sync';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncMappingResponse {
  mapping_id: string;
  workspace_id: string;
  gallery_id: string;
  gallery_name?: string;
  folder_path: string;
  display_name?: string;
  include_subfolders: boolean;
  include_patterns?: string[];
  exclude_patterns?: string[];
  status: SyncMappingStatus;
  total_files_synced: number;
  total_bytes_synced: number;
  last_sync_at?: string;
  last_error?: string;
  last_error_code?: string;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}

export interface SyncSessionResponse {
  session_id: string;
  mapping_id: string;
  workspace_id: string;
  user_id: string;
  status: SyncSessionStatus;
  started_at: string;
  ended_at?: string;
  files_detected: number;
  files_queued: number;
  files_uploading: number;
  files_completed: number;
  files_failed: number;
  files_skipped: number;
  bytes_uploaded: number;
  upload_speed_bps?: number;
  eta_seconds?: number;
  last_activity_at: string;
  last_error?: string;
  last_error_code?: string;
  client_id?: string;
  user_agent?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface StartSessionResponse {
  session: SyncSessionResponse;
  websocket_url: string;
  message: string;
}

export interface ListMappingsParams {
  status?: SyncMappingStatus;
  gallery_id?: string;
  page?: number;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Sync Mapping API
// ---------------------------------------------------------------------------

/**
 * Create a new sync mapping.
 */
export async function createSyncMapping(
  data: CreateSyncMappingRequest
): Promise<{ mapping: SyncMappingResponse }> {
  const response = await apiClient.post<{ mapping: SyncMappingResponse }>(`${SYNC_API_BASE}/mappings`, data);
  if (!response.data) throw new Error('Failed to create sync mapping');
  return response.data;
}

/**
 * Get a sync mapping by ID.
 */
export async function getSyncMapping(
  mappingId: string
): Promise<SyncMappingResponse> {
  const response = await apiClient.get<SyncMappingResponse>(`${SYNC_API_BASE}/mappings/${mappingId}`);
  if (!response.data) throw new Error('Sync mapping not found');
  return response.data;
}

/**
 * List sync mappings for the workspace.
 */
export async function listSyncMappings(
  params?: ListMappingsParams
): Promise<PaginatedResponse<SyncMappingResponse>> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set('status', params.status);
  if (params?.gallery_id) searchParams.set('gallery_id', params.gallery_id);
  if (params?.page) searchParams.set('page', params.page.toString());
  if (params?.limit) searchParams.set('limit', params.limit.toString());

  const queryString = searchParams.toString();
  const url = queryString
    ? `${SYNC_API_BASE}/mappings?${queryString}`
    : `${SYNC_API_BASE}/mappings`;

  const response = await apiClient.get<PaginatedResponse<SyncMappingResponse>>(url);
  if (!response.data) throw new Error('Failed to fetch sync mappings');
  return response.data;
}

/**
 * Update a sync mapping.
 */
export async function updateSyncMapping(
  mappingId: string,
  data: UpdateSyncMappingRequest
): Promise<SyncMappingResponse> {
  const response = await apiClient.patch<SyncMappingResponse>(`${SYNC_API_BASE}/mappings/${mappingId}`, data);
  if (!response.data) throw new Error('Failed to update sync mapping');
  return response.data;
}

/**
 * Delete a sync mapping.
 */
export async function deleteSyncMapping(mappingId: string): Promise<void> {
  await apiClient.delete(`${SYNC_API_BASE}/mappings/${mappingId}`);
}

/**
 * Pause a sync mapping.
 */
export async function pauseSyncMapping(
  mappingId: string
): Promise<SyncMappingResponse> {
  const response = await apiClient.post<SyncMappingResponse>(`${SYNC_API_BASE}/mappings/${mappingId}/pause`, {});
  if (!response.data) throw new Error('Failed to pause sync mapping');
  return response.data;
}

/**
 * Resume a paused sync mapping.
 */
export async function resumeSyncMapping(
  mappingId: string
): Promise<SyncMappingResponse> {
  const response = await apiClient.post<SyncMappingResponse>(`${SYNC_API_BASE}/mappings/${mappingId}/resume`, {});
  if (!response.data) throw new Error('Failed to resume sync mapping');
  return response.data;
}

/**
 * Get statistics for a sync mapping.
 */
export async function getSyncMappingStats(
  mappingId: string
): Promise<SyncMappingStats> {
  const response = await apiClient.get<SyncMappingStats>(`${SYNC_API_BASE}/mappings/${mappingId}/stats`);
  if (!response.data) throw new Error('Failed to get mapping stats');
  return response.data;
}

// ---------------------------------------------------------------------------
// Sync Session API
// ---------------------------------------------------------------------------

/**
 * Start a new sync session.
 */
export async function startSyncSession(
  data: StartSyncSessionRequest
): Promise<StartSessionResponse> {
  const response = await apiClient.post<StartSessionResponse>(`${SYNC_API_BASE}/sessions`, data);
  if (!response.data) throw new Error('Failed to start sync session');
  return response.data;
}

/**
 * Get a sync session by ID.
 */
export async function getSyncSession(
  sessionId: string
): Promise<SyncSessionResponse> {
  const response = await apiClient.get<SyncSessionResponse>(`${SYNC_API_BASE}/sessions/${sessionId}`);
  if (!response.data) throw new Error('Sync session not found');
  return response.data;
}

/**
 * List active sync sessions.
 */
export async function listActiveSessions(): Promise<SyncSessionResponse[]> {
  const response = await apiClient.get<SyncSessionResponse[]>(`${SYNC_API_BASE}/sessions`);
  return response.data ?? [];
}

/**
 * Pause a sync session.
 */
export async function pauseSyncSession(
  sessionId: string
): Promise<SyncSessionResponse> {
  const response = await apiClient.post<SyncSessionResponse>(`${SYNC_API_BASE}/sessions/${sessionId}/pause`, {});
  if (!response.data) throw new Error('Failed to pause sync session');
  return response.data;
}

/**
 * Resume a paused sync session.
 */
export async function resumeSyncSession(
  sessionId: string
): Promise<SyncSessionResponse> {
  const response = await apiClient.post<SyncSessionResponse>(`${SYNC_API_BASE}/sessions/${sessionId}/resume`, {});
  if (!response.data) throw new Error('Failed to resume sync session');
  return response.data;
}

/**
 * End a sync session.
 */
export async function endSyncSession(
  sessionId: string
): Promise<SyncSessionResponse> {
  const response = await apiClient.post<SyncSessionResponse>(`${SYNC_API_BASE}/sessions/${sessionId}/end`, {});
  if (!response.data) throw new Error('Failed to end sync session');
  return response.data;
}

// ---------------------------------------------------------------------------
// Sync Service Status
// ---------------------------------------------------------------------------

interface SyncServiceStatus {
  service: string;
  status: string;
  version: string;
  endpoints: Record<string, string>;
}

/**
 * Check sync service status.
 */
export async function getSyncServiceStatus(): Promise<SyncServiceStatus> {
  const response = await apiClient.get<SyncServiceStatus>(`${SYNC_API_BASE}/status`);
  if (!response.data) throw new Error('Failed to get sync service status');
  return response.data;
}

// ---------------------------------------------------------------------------
// WebSocket Connection
// ---------------------------------------------------------------------------

export interface SyncWebSocketOptions {
  sessionId: string;
  onStatusUpdate?: (status: SyncSessionResponse) => void;
  onProgress?: (progress: { files_completed: number; bytes_uploaded: number }) => void;
  onError?: (error: { code: string; message: string }) => void;
  onClose?: () => void;
}

/**
 * Create a WebSocket connection for real-time sync updates.
 */
export function createSyncWebSocket(options: SyncWebSocketOptions): WebSocket {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${window.location.host}${SYNC_API_BASE}/ws?session_id=${options.sessionId}`;

  const ws = new WebSocket(wsUrl, 'sync-v1');

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'status_update':
        case 'session_update':
          options.onStatusUpdate?.(message.payload);
          break;
        case 'progress':
          options.onProgress?.(message.payload);
          break;
        case 'error':
          options.onError?.(message.payload);
          break;
      }
    } catch (e) {
      console.error('Failed to parse sync WebSocket message:', e);
    }
  };

  ws.onclose = () => {
    options.onClose?.();
  };

  ws.onerror = (error) => {
    console.error('Sync WebSocket error:', error);
    options.onError?.({ code: 'WEBSOCKET_ERROR', message: 'WebSocket connection error' });
  };

  return ws;
}

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

/**
 * Format bytes to human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Format upload speed to human-readable string.
 */
export function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

/**
 * Format ETA seconds to human-readable string.
 */
export function formatEta(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

/**
 * Calculate sync progress percentage.
 */
export function calculateProgress(session: SyncSessionResponse): number {
  const total = session.files_detected || 0;
  if (total === 0) return 0;
  const completed = session.files_completed + session.files_failed + session.files_skipped;
  return Math.round((completed / total) * 100);
}
