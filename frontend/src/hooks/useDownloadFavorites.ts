/**
 * useDownloadFavorites Hook
 *
 * Hook for managing favorites download with progress polling.
 *
 * Feature: 012-client-favorites (US4)
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { favoritesService, DownloadStatus } from '../services/favoritesService';

export type DownloadState = 'idle' | 'requesting' | 'processing' | 'completed' | 'failed';

export interface UseDownloadFavoritesResult {
  /** Current download state */
  state: DownloadState;
  /** Progress percentage (0-100) */
  progress: number;
  /** Download URL when completed */
  downloadUrl: string | null;
  /** File size in bytes when completed */
  fileSize: number | null;
  /** Error message if failed */
  error: string | null;
  /** Request a new download */
  requestDownload: (resolution?: 'web' | 'original') => Promise<void>;
  /** Reset the download state */
  reset: () => void;
  /** Whether a download is in progress */
  isDownloading: boolean;
}

// Download polling configuration
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 180; // 6 minutes max (180 * 2 seconds)
const DOWNLOAD_TIMEOUT_MINUTES = Math.floor(
  (MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 60000
);

export function useDownloadFavorites(
  galleryId: string,
  listId: string
): UseDownloadFavoritesResult {
  const [state, setState] = useState<DownloadState>('idle');
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);
  const downloadIdRef = useRef<string | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    pollCountRef.current = 0;
  }, []);

  const handleStatusUpdate = useCallback(
    (status: DownloadStatus) => {
      setProgress(status.progress);

      switch (status.status) {
        case 'pending':
        case 'processing':
          setState('processing');
          break;
        case 'completed':
          setState('completed');
          setDownloadUrl(status.download_url);
          setFileSize(status.file_size_bytes);
          stopPolling();
          break;
        case 'failed':
          setState('failed');
          setError(status.error_message || 'Download failed');
          stopPolling();
          break;
      }
    },
    [stopPolling]
  );

  const pollStatus = useCallback(async () => {
    if (!downloadIdRef.current) return;

    pollCountRef.current += 1;

    // Stop polling if max attempts reached
    if (pollCountRef.current >= MAX_POLL_ATTEMPTS) {
      setState('failed');
      setError('Download timed out. Please try again.');
      stopPolling();
      return;
    }

    try {
      const status = await favoritesService.getDownloadStatus(
        galleryId,
        downloadIdRef.current
      );
      handleStatusUpdate(status);
    } catch {
      // Network errors are expected during polling - silently retry
      // Polling will timeout after MAX_POLL_ATTEMPTS if errors persist
    }
  }, [galleryId, handleStatusUpdate, stopPolling]);

  const requestDownload = useCallback(
    async (resolution: 'web' | 'original' = 'web') => {
      // Reset state
      setState('requesting');
      setProgress(0);
      setDownloadUrl(null);
      setFileSize(null);
      setError(null);
      stopPolling();

      try {
        // Request the download
        const status = await favoritesService.requestDownload(
          galleryId,
          listId,
          resolution
        );

        downloadIdRef.current = status.download_id;
        handleStatusUpdate(status);

        // Start polling if not already completed
        if (status.status !== 'completed' && status.status !== 'failed') {
          pollIntervalRef.current = setInterval(pollStatus, POLL_INTERVAL_MS);
        }
      } catch (err) {
        setState('failed');
        setError(
          err instanceof Error ? err.message : 'Failed to request download'
        );
      }
    },
    [galleryId, listId, handleStatusUpdate, pollStatus, stopPolling]
  );

  const reset = useCallback(() => {
    stopPolling();
    setState('idle');
    setProgress(0);
    setDownloadUrl(null);
    setFileSize(null);
    setError(null);
    downloadIdRef.current = null;
  }, [stopPolling]);

  return {
    state,
    progress,
    downloadUrl,
    fileSize,
    error,
    requestDownload,
    reset,
    isDownloading: state === 'requesting' || state === 'processing',
  };
}

export default useDownloadFavorites;
