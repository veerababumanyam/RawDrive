/**
 * XMP Sync Service
 * API client for XMP sidecar file export/import operations
 * Feature: 029-pro-review-xmp-sync
 * Task: T039
 */

import apiClient from './api';

// Gallery service base URL (routes through Traefik to gallery-service on port 8004)
const GALLERY_SERVICE_BASE = '/api/v1/galleries';

// XMP Export request parameters
export interface XmpExportRequest {
  asset_ids?: string[];
  sub_gallery_id?: string;
  include_picks_only?: boolean;
  include_rated_only?: boolean;
  min_rating?: number;
  include_rawdrive_metadata?: boolean;
}

// XMP Export preview response
export interface XmpExportPreview {
  total_assets: number;
  sample_files: string[];
  estimated_size_bytes: number;
}

// XMP Sync status response
export interface XmpSyncStatus {
  gallery_id: string;
  last_export_at: string | null;
  last_import_at: string | null;
  total_assets: number;
  assets_with_xmp: number;
  pending_changes: number;
}

// XMP Import request parameters
export interface XmpImportRequest {
  match_by_rawdrive_id?: boolean;
  overwrite_existing?: boolean;
}

// XMP Import change preview item
export interface XmpImportChangePreview {
  filename: string;
  rating?: number | null;
  flag?: string | null;
  color_label?: string | null;
}

// XMP Import preview response
export interface XmpImportPreview {
  total_files: number;
  matched_count: number;
  unmatched_count: number;
  unmatched_files: string[];
  changes_preview: XmpImportChangePreview[];
}

// XMP Import error detail
export interface XmpImportErrorDetail {
  filename: string;
  error: string;
}

// XMP Import result response
export interface XmpImportResult {
  total_processed: number;
  successfully_imported: number;
  skipped: number;
  failed: number;
  errors?: XmpImportErrorDetail[] | null;
}

export class XmpSyncService {
  /**
   * Get XMP sync status for a gallery
   * Shows last export/import timestamps and pending changes
   */
  async getSyncStatus(
    workspaceId: string,
    galleryId: string
  ): Promise<XmpSyncStatus> {
    const endpoint = `${GALLERY_SERVICE_BASE}/${galleryId}/xmp/status`;
    const response = await apiClient.get<XmpSyncStatus>(endpoint, {
      headers: { 'X-Workspace-ID': workspaceId },
    });
    if (response.error) {
      throw new Error(response.error.message || 'Failed to get XMP sync status');
    }
    return response.data!;
  }

  /**
   * Preview XMP export operation
   * Returns count, sample filenames, and estimated size without generating files
   */
  async previewExport(
    workspaceId: string,
    galleryId: string,
    request: XmpExportRequest = {}
  ): Promise<XmpExportPreview> {
    const endpoint = `${GALLERY_SERVICE_BASE}/${galleryId}/xmp/export/preview`;
    const response = await apiClient.post<XmpExportPreview>(endpoint, request, {
      headers: { 'X-Workspace-ID': workspaceId },
    });
    if (response.error) {
      throw new Error(response.error.message || 'Failed to preview XMP export');
    }
    return response.data!;
  }

  /**
   * Export XMP files as a ZIP archive
   * Downloads the ZIP file directly to the browser
   */
  async exportXmp(
    workspaceId: string,
    galleryId: string,
    request: XmpExportRequest = {},
    onProgress?: (progress: number) => void
  ): Promise<Blob> {
    const endpoint = `${GALLERY_SERVICE_BASE}/${galleryId}/xmp/export`;

    // Use fetch for binary response with progress tracking
    const token = localStorage.getItem('access_token');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Workspace-ID': workspaceId,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Export failed: ${response.statusText}`);
    }

    // Get content length for progress tracking
    const contentLength = response.headers.get('Content-Length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;

    if (!response.body) {
      // Fallback for browsers without ReadableStream support
      return response.blob();
    }

    // Stream with progress tracking
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    let done = false;

    while (!done) {
      const result = await reader.read();
      done = result.done;
      if (result.value) {
        chunks.push(result.value);
        received += result.value.length;

        if (onProgress && total > 0) {
          onProgress((received / total) * 100);
        }
      }
    }

    // Combine chunks into a single blob
    return new Blob(chunks as BlobPart[], { type: 'application/zip' });
  }

  /**
   * Trigger download of exported XMP ZIP file
   */
  async downloadExport(
    workspaceId: string,
    galleryId: string,
    request: XmpExportRequest = {},
    filename?: string,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    const blob = await this.exportXmp(workspaceId, galleryId, request, onProgress);

    // Create download link
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || `xmp_export_${galleryId}_${Date.now()}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  /**
   * Preview XMP import operation
   * Returns what changes will be applied without actually applying them
   */
  async previewImport(
    workspaceId: string,
    galleryId: string,
    file: File,
    options: XmpImportRequest = {}
  ): Promise<XmpImportPreview> {
    const formData = new FormData();
    formData.append('file', file);

    // Add options as query params
    const params = new URLSearchParams();
    if (options.match_by_rawdrive_id !== undefined) {
      params.append('match_by_rawdrive_id', String(options.match_by_rawdrive_id));
    }

    const query = params.toString();
    const endpoint = `${GALLERY_SERVICE_BASE}/${galleryId}/xmp/import/preview${query ? `?${query}` : ''}`;

    const token = localStorage.getItem('access_token');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'X-Workspace-ID': workspaceId,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Import preview failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Import XMP files from a ZIP archive
   */
  async importXmp(
    workspaceId: string,
    galleryId: string,
    file: File,
    options: XmpImportRequest = {},
    onProgress?: (progress: number) => void
  ): Promise<XmpImportResult> {
    const formData = new FormData();
    formData.append('file', file);

    // Add options as query params
    const params = new URLSearchParams();
    if (options.match_by_rawdrive_id !== undefined) {
      params.append('match_by_rawdrive_id', String(options.match_by_rawdrive_id));
    }
    if (options.overwrite_existing !== undefined) {
      params.append('overwrite_existing', String(options.overwrite_existing));
    }

    const query = params.toString();
    const endpoint = `${GALLERY_SERVICE_BASE}/${galleryId}/xmp/import${query ? `?${query}` : ''}`;

    const token = localStorage.getItem('access_token');

    // Use XMLHttpRequest for upload progress tracking
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          onProgress((event.loaded / event.total) * 100);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const result = JSON.parse(xhr.responseText);
            resolve(result);
          } catch {
            reject(new Error('Invalid response from server'));
          }
        } else {
          try {
            const errorData = JSON.parse(xhr.responseText);
            reject(new Error(errorData.detail || `Import failed: ${xhr.statusText}`));
          } catch {
            reject(new Error(`Import failed: ${xhr.statusText}`));
          }
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Network error during import'));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('Import was aborted'));
      });

      xhr.open('POST', endpoint);
      xhr.setRequestHeader('X-Workspace-ID', workspaceId);
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }
      xhr.send(formData);
    });
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  /**
   * Format date for display
   */
  formatDate(dateString: string | null): string {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}

// Export singleton instance
export const xmpSyncService = new XmpSyncService();
export default xmpSyncService;
