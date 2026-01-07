/**
 * Gallery Export Service
 *
 * Frontend service for multi-format gallery exports:
 * - ZIP archives with configurable resolution
 * - Print-ready PDF albums with layouts
 * - Animated slideshows (MP4/WebM)
 * - Cloud sync to Google Photos/Amazon Photos/Dropbox
 * - Batch export scheduling
 */

import { apiClient } from './api';
import type {
  GalleryExport,
  GalleryExportSummary,
  ExportFormat,
  ExportStatus,
  ZipExportConfig,
  PDFExportConfig,
  SlideshowExportConfig,
  CloudSyncConfig,
  CreateExportRequest,
  CreateExportResponse,
  ListExportsQuery,
  ListExportsResponse,
  CloudProviderConnection,
  ExportStats,
} from '@rawdrive/shared-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateGalleryExportParams {
  workspaceId: string;
  galleryId: string;
  format: ExportFormat;
  config: ZipExportConfig | PDFExportConfig | SlideshowExportConfig | CloudSyncConfig;
  subGalleryIds?: string[];
  assetIds?: string[];
  scheduledAt?: Date;
}

export interface ListGalleryExportsParams {
  workspaceId: string;
  galleryId?: string;
  format?: ExportFormat;
  status?: ExportStatus;
  page?: number;
  limit?: number;
}

export interface BatchExportParams {
  workspaceId: string;
  galleryIds: string[];
  format: ExportFormat;
  config: ZipExportConfig | PDFExportConfig | SlideshowExportConfig | CloudSyncConfig;
  scheduledAt?: Date;
}

// ---------------------------------------------------------------------------
// Service Functions
// ---------------------------------------------------------------------------

/**
 * Create a new gallery export job
 */
export async function createExport(params: CreateGalleryExportParams): Promise<GalleryExport> {
  const { workspaceId, galleryId, format, config, subGalleryIds, assetIds, scheduledAt } = params;

  const response = await apiClient.post<{ export: GalleryExport }>(
    `/api/v1/workspaces/${workspaceId}/gallery-exports/galleries/${galleryId}`,
    {
      format,
      config,
      subGalleryIds,
      assetIds,
      scheduledAt: scheduledAt?.toISOString(),
    }
  );

  if (!response.data) throw new Error(response.error?.message || 'Failed to create export');
  return response.data.export;
}

/**
 * Get export by ID
 */
export async function getExport(
  workspaceId: string,
  exportId: string
): Promise<GalleryExport> {
  const response = await apiClient.get<{ export: GalleryExport }>(
    `/api/v1/workspaces/${workspaceId}/gallery-exports/${exportId}`
  );
  if (!response.data) throw new Error(response.error?.message || 'Failed to get export');
  return response.data.export;
}

/**
 * List exports for a gallery or workspace
 */
export async function listExports(params: ListGalleryExportsParams): Promise<ListExportsResponse> {
  const { workspaceId, galleryId, format, status, page = 1, limit = 20 } = params;

  const queryParams = new URLSearchParams();
  if (format) queryParams.append('format', format);
  if (status) queryParams.append('status', status);
  queryParams.append('page', String(page));
  queryParams.append('limit', String(limit));

  const path = galleryId
    ? `/api/v1/workspaces/${workspaceId}/gallery-exports/galleries/${galleryId}`
    : `/api/v1/workspaces/${workspaceId}/gallery-exports`;

  const response = await apiClient.get<ListExportsResponse>(`${path}?${queryParams.toString()}`);
  if (!response.data) throw new Error(response.error?.message || 'Failed to list exports');
  return response.data;
}

/**
 * Cancel a pending or processing export
 */
export async function cancelExport(
  workspaceId: string,
  exportId: string,
  reason?: string
): Promise<GalleryExport> {
  const response = await apiClient.post<{ export: GalleryExport }>(
    `/api/v1/workspaces/${workspaceId}/gallery-exports/${exportId}/cancel`,
    { reason }
  );
  if (!response.data) throw new Error(response.error?.message || 'Failed to cancel export');
  return response.data.export;
}

/**
 * Retry a failed export
 */
export async function retryExport(
  workspaceId: string,
  exportId: string,
  modifiedConfig?: Partial<ZipExportConfig | PDFExportConfig | SlideshowExportConfig | CloudSyncConfig>
): Promise<GalleryExport> {
  const response = await apiClient.post<{ export: GalleryExport }>(
    `/api/v1/workspaces/${workspaceId}/gallery-exports/${exportId}/retry`,
    { modifiedConfig }
  );
  if (!response.data) throw new Error(response.error?.message || 'Failed to retry export');
  return response.data.export;
}

/**
 * Create batch exports for multiple galleries
 */
export async function createBatchExport(params: BatchExportParams): Promise<{
  exports: GalleryExport[];
  totalQueued: number;
}> {
  const { workspaceId, galleryIds, format, config, scheduledAt } = params;

  const response = await apiClient.post<{
    exports: GalleryExport[];
    totalQueued: number;
  }>(`/api/v1/workspaces/${workspaceId}/gallery-exports/batch`, {
    galleryIds,
    format,
    config,
    scheduledAt: scheduledAt?.toISOString(),
  });

  if (!response.data) throw new Error(response.error?.message || 'Failed to create batch export');
  return response.data;
}

/**
 * Get export statistics for a workspace
 */
export async function getExportStats(workspaceId: string): Promise<ExportStats> {
  const response = await apiClient.get<ExportStats>(
    `/api/v1/workspaces/${workspaceId}/gallery-exports/stats`
  );
  if (!response.data) throw new Error(response.error?.message || 'Failed to get export stats');
  return response.data;
}

// ---------------------------------------------------------------------------
// Cloud Provider Functions
// ---------------------------------------------------------------------------

/**
 * List connected cloud providers
 */
export async function listCloudConnections(
  workspaceId: string
): Promise<CloudProviderConnection[]> {
  const response = await apiClient.get<{ connections: CloudProviderConnection[] }>(
    `/api/v1/workspaces/${workspaceId}/gallery-exports/cloud/connections`
  );
  if (!response.data) throw new Error(response.error?.message || 'Failed to list cloud connections');
  return response.data.connections;
}

/**
 * Initiate OAuth flow to connect a cloud provider
 */
export async function connectCloudProvider(
  workspaceId: string,
  provider: 'google_photos' | 'amazon_photos' | 'dropbox',
  redirectUri: string
): Promise<{ authUrl: string; state: string }> {
  const response = await apiClient.post<{ authUrl: string; state: string }>(
    `/api/v1/workspaces/${workspaceId}/gallery-exports/cloud/connect`,
    { provider, redirectUri }
  );
  if (!response.data) throw new Error(response.error?.message || 'Failed to connect cloud provider');
  return response.data;
}

/**
 * Handle OAuth callback from cloud provider
 */
export async function cloudProviderCallback(
  workspaceId: string,
  provider: string,
  code: string,
  state: string
): Promise<CloudProviderConnection> {
  const response = await apiClient.post<{ connection: CloudProviderConnection }>(
    `/api/v1/workspaces/${workspaceId}/gallery-exports/cloud/callback`,
    { provider, code, state }
  );
  if (!response.data) throw new Error(response.error?.message || 'Failed to handle cloud provider callback');
  return response.data.connection;
}

/**
 * Disconnect a cloud provider
 */
export async function disconnectCloudProvider(
  workspaceId: string,
  provider: string
): Promise<void> {
  await apiClient.delete(
    `/api/v1/workspaces/${workspaceId}/gallery-exports/cloud/connections/${provider}`
  );
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Get default configuration for a format
 */
export function getDefaultConfig(format: ExportFormat): ZipExportConfig | PDFExportConfig | SlideshowExportConfig | CloudSyncConfig {
  switch (format) {
    case 'zip':
      return {
        resolution: 'original',
        includeMetadata: false,
        preserveOriginalFilenames: true,
        flattenStructure: false,
        includeSubGalleryFolders: true,
      } as ZipExportConfig;

    case 'pdf_album':
      return {
        layoutStyle: 'classic',
        pageSize: 'a4',
        orientation: 'portrait',
        includeTitle: true,
        includeCover: true,
        includeTableOfContents: false,
        includePageNumbers: true,
        includeExifData: false,
        includeDateTaken: false,
        photoBorder: false,
        photoBorderWidth: 2,
        backgroundColor: '#ffffff',
        fontFamily: 'Helvetica',
        quality: 'print',
      } as PDFExportConfig;

    case 'slideshow_mp4':
    case 'slideshow_webm':
      return {
        transition: 'fade',
        transitionDuration: 500,
        displayDuration: 3000,
        quality: '1080p',
        aspectRatio: '16:9',
        includeAudio: false,
        audioFadeIn: true,
        audioFadeOut: true,
        loopAudio: true,
        includeTitleSlide: true,
        includeEndSlide: true,
        backgroundColor: '#000000',
      } as SlideshowExportConfig;

    case 'cloud_google_photos':
    case 'cloud_amazon_photos':
    case 'cloud_dropbox':
      return {
        createAlbum: true,
        resolution: 'high',
        syncSubGalleries: true,
        overwriteExisting: false,
      } as CloudSyncConfig;

    default:
      return {
        resolution: 'original',
        includeMetadata: false,
        preserveOriginalFilenames: true,
        flattenStructure: false,
        includeSubGalleryFolders: true,
      } as ZipExportConfig;
  }
}

/**
 * Get human-readable format name
 */
export function getFormatDisplayName(format: ExportFormat): string {
  const names: Record<ExportFormat, string> = {
    zip: 'ZIP Archive',
    pdf_album: 'PDF Album',
    slideshow_mp4: 'Slideshow (MP4)',
    slideshow_webm: 'Slideshow (WebM)',
    cloud_google_photos: 'Google Photos',
    cloud_amazon_photos: 'Amazon Photos',
    cloud_dropbox: 'Dropbox',
  };
  return names[format] || format;
}

/**
 * Get status badge color class
 */
export function getStatusColor(status: ExportStatus): string {
  const colors: Record<ExportStatus, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    queued: 'bg-blue-100 text-blue-800',
    processing: 'bg-blue-100 text-blue-800',
    uploading: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    cancelled: 'bg-gray-100 text-gray-800',
    expired: 'bg-gray-100 text-gray-500',
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number | undefined | null): string {
  if (!bytes) return '-';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unitIndex = 0;
  let size = bytes;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

/**
 * Check if export is in a terminal state
 */
export function isExportComplete(status: ExportStatus): boolean {
  return ['completed', 'failed', 'cancelled', 'expired'].includes(status);
}

/**
 * Check if export can be cancelled
 */
export function canCancelExport(status: ExportStatus): boolean {
  return ['pending', 'queued', 'processing'].includes(status);
}

/**
 * Check if export can be retried
 */
export function canRetryExport(status: ExportStatus): boolean {
  return status === 'failed';
}

// ---------------------------------------------------------------------------
// Export Service Object
// ---------------------------------------------------------------------------

export const galleryExportService = {
  createExport,
  getExport,
  listExports,
  cancelExport,
  retryExport,
  createBatchExport,
  getExportStats,
  listCloudConnections,
  connectCloudProvider,
  cloudProviderCallback,
  disconnectCloudProvider,
  getDefaultConfig,
  getFormatDisplayName,
  getStatusColor,
  formatFileSize,
  isExportComplete,
  canCancelExport,
  canRetryExport,
};

export default galleryExportService;
