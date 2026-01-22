/**
 * useXmpSync Hook
 * State management for XMP sidecar export/import operations
 * Feature: 029-pro-review-xmp-sync
 * Task: T040
 */

import { useState, useCallback, useEffect } from 'react';
import {
  xmpSyncService,
  XmpExportRequest,
  XmpExportPreview,
  XmpSyncStatus,
  XmpImportRequest,
  XmpImportPreview,
  XmpImportResult,
} from '../services/xmpSyncService';

export interface UseXmpSyncProps {
  workspaceId: string;
  galleryId: string;
  /** Auto-fetch status on mount */
  autoFetchStatus?: boolean;
}

export interface UseXmpSyncReturn {
  // Status
  status: XmpSyncStatus | null;
  isLoadingStatus: boolean;
  refreshStatus: () => Promise<void>;

  // Export
  exportPreview: XmpExportPreview | null;
  isExporting: boolean;
  exportProgress: number;
  exportError: string | null;
  previewExport: (request?: XmpExportRequest) => Promise<XmpExportPreview>;
  downloadExport: (request?: XmpExportRequest, filename?: string) => Promise<void>;
  clearExportError: () => void;

  // Import
  importPreview: XmpImportPreview | null;
  importResult: XmpImportResult | null;
  isImporting: boolean;
  importProgress: number;
  importError: string | null;
  previewImport: (file: File, options?: XmpImportRequest) => Promise<XmpImportPreview>;
  executeImport: (file: File, options?: XmpImportRequest) => Promise<XmpImportResult>;
  clearImportError: () => void;
  clearImportResult: () => void;

  // Utilities
  formatFileSize: (bytes: number) => string;
  formatDate: (date: string | null) => string;
}

/**
 * Hook for managing XMP sync operations
 */
export function useXmpSync({
  workspaceId,
  galleryId,
  autoFetchStatus = true,
}: UseXmpSyncProps): UseXmpSyncReturn {
  // Status state
  const [status, setStatus] = useState<XmpSyncStatus | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);

  // Export state
  const [exportPreview, setExportPreview] = useState<XmpExportPreview | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);

  // Import state
  const [importPreview, setImportPreview] = useState<XmpImportPreview | null>(null);
  const [importResult, setImportResult] = useState<XmpImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importError, setImportError] = useState<string | null>(null);

  // Fetch status
  const refreshStatus = useCallback(async () => {
    if (!workspaceId || !galleryId) return;

    try {
      setIsLoadingStatus(true);
      const result = await xmpSyncService.getSyncStatus(workspaceId, galleryId);
      setStatus(result);
    } catch (err) {
      console.error('Failed to fetch XMP sync status:', err);
    } finally {
      setIsLoadingStatus(false);
    }
  }, [workspaceId, galleryId]);

  // Auto-fetch status on mount
  useEffect(() => {
    if (autoFetchStatus) {
      refreshStatus();
    }
  }, [autoFetchStatus, refreshStatus]);

  // Preview export
  const previewExport = useCallback(
    async (request: XmpExportRequest = {}): Promise<XmpExportPreview> => {
      setExportError(null);
      try {
        const preview = await xmpSyncService.previewExport(workspaceId, galleryId, request);
        setExportPreview(preview);
        return preview;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to preview export';
        setExportError(message);
        throw err;
      }
    },
    [workspaceId, galleryId]
  );

  // Download export
  const downloadExport = useCallback(
    async (request: XmpExportRequest = {}, filename?: string): Promise<void> => {
      setIsExporting(true);
      setExportProgress(0);
      setExportError(null);

      try {
        await xmpSyncService.downloadExport(
          workspaceId,
          galleryId,
          request,
          filename,
          (progress) => setExportProgress(progress)
        );
        setExportProgress(100);

        // Refresh status after successful export
        await refreshStatus();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Export failed';
        setExportError(message);
        throw err;
      } finally {
        setIsExporting(false);
      }
    },
    [workspaceId, galleryId, refreshStatus]
  );

  // Clear export error
  const clearExportError = useCallback(() => {
    setExportError(null);
  }, []);

  // Preview import
  const previewImportFn = useCallback(
    async (file: File, options: XmpImportRequest = {}): Promise<XmpImportPreview> => {
      setImportError(null);
      try {
        const preview = await xmpSyncService.previewImport(
          workspaceId,
          galleryId,
          file,
          options
        );
        setImportPreview(preview);
        return preview;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to preview import';
        setImportError(message);
        throw err;
      }
    },
    [workspaceId, galleryId]
  );

  // Execute import
  const executeImport = useCallback(
    async (file: File, options: XmpImportRequest = {}): Promise<XmpImportResult> => {
      setIsImporting(true);
      setImportProgress(0);
      setImportError(null);

      try {
        const result = await xmpSyncService.importXmp(
          workspaceId,
          galleryId,
          file,
          options,
          (progress) => setImportProgress(progress)
        );
        setImportResult(result);
        setImportProgress(100);

        // Refresh status after successful import
        await refreshStatus();

        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Import failed';
        setImportError(message);
        throw err;
      } finally {
        setIsImporting(false);
      }
    },
    [workspaceId, galleryId, refreshStatus]
  );

  // Clear import error
  const clearImportError = useCallback(() => {
    setImportError(null);
  }, []);

  // Clear import result
  const clearImportResult = useCallback(() => {
    setImportResult(null);
    setImportPreview(null);
  }, []);

  return {
    // Status
    status,
    isLoadingStatus,
    refreshStatus,

    // Export
    exportPreview,
    isExporting,
    exportProgress,
    exportError,
    previewExport,
    downloadExport,
    clearExportError,

    // Import
    importPreview,
    importResult,
    isImporting,
    importProgress,
    importError,
    previewImport: previewImportFn,
    executeImport,
    clearImportError,
    clearImportResult,

    // Utilities
    formatFileSize: xmpSyncService.formatFileSize,
    formatDate: xmpSyncService.formatDate,
  };
}

export default useXmpSync;
