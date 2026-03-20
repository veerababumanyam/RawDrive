/**
 * useGalleryDownload Hook
 * Orchestrates single and batch download requests with SSE progress tracking.
 * Connects to gallery-service download API endpoints.
 */
import { useState, useCallback, useRef } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DownloadStatus = 'idle' | 'preparing' | 'downloading' | 'complete' | 'error';

export interface BatchDownloadOptions {
  assetIds?: string[];
  size: string;
  includeFavorites?: boolean;
  includeSelections?: boolean;
}

export interface UseGalleryDownloadResult {
  /** Download a single photo */
  downloadSingle: (assetId: string, size: string, format: string) => Promise<void>;
  /** Download a batch of photos as ZIP */
  downloadBatch: (options: BatchDownloadOptions) => Promise<void>;
  /** Current download progress (0-100) */
  progress: number;
  /** Current download status */
  status: DownloadStatus;
  /** Error message if any */
  error: string | null;
  /** Cancel the current batch download */
  cancelDownload: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Hook for managing gallery downloads (single + batch with SSE progress).
 *
 * @param galleryToken - The magic-link token for the public gallery
 * @param galleryServiceUrl - Base URL of the gallery service (e.g. http://localhost:8004)
 */
export function useGalleryDownload(
  galleryToken: string,
  galleryServiceUrl: string,
): UseGalleryDownloadResult {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<DownloadStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const baseUrl = `${galleryServiceUrl}/api/v1/public/galleries/${galleryToken}`;

  /**
   * Download a single photo. POSTs to /downloads/single and opens the
   * returned URL in a new tab.
   */
  const downloadSingle = useCallback(
    async (assetId: string, size: string, format: string) => {
      setStatus('downloading');
      setError(null);

      try {
        const resp = await fetch(`${baseUrl}/downloads/single`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ asset_id: assetId, size, format }),
        });

        if (!resp.ok) {
          throw new Error(`Download failed: ${resp.status}`);
        }

        const data = await resp.json();
        if (data.download_url) {
          window.open(data.download_url, '_blank');
        }
        setStatus('complete');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Download failed';
        setError(message);
        setStatus('error');
      }
    },
    [baseUrl],
  );

  /**
   * Download a batch of photos as ZIP. POSTs to /downloads/batch, then
   * opens an SSE stream to track progress. Auto-triggers download when
   * the ZIP is ready.
   */
  const downloadBatch = useCallback(
    async (options: BatchDownloadOptions) => {
      setStatus('preparing');
      setProgress(0);
      setError(null);

      try {
        const resp = await fetch(`${baseUrl}/downloads/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            asset_ids: options.assetIds,
            size: options.size,
            include_favorites: options.includeFavorites,
            include_selections: options.includeSelections,
          }),
        });

        if (!resp.ok) {
          throw new Error(`Batch download request failed: ${resp.status}`);
        }

        const data = await resp.json();
        const jobId = data.job_id;

        // Open SSE stream for progress
        const sseUrl = `${baseUrl}/downloads/job/${jobId}/stream`;
        const es = new EventSource(sseUrl);
        eventSourceRef.current = es;

        es.onmessage = (event: MessageEvent) => {
          try {
            const payload = JSON.parse(event.data);
            setProgress(payload.progress ?? 0);

            if (payload.status === 'processing') {
              setStatus('downloading');
            } else if (payload.status === 'complete') {
              setStatus('complete');
              setProgress(100);
              if (payload.download_url) {
                window.open(payload.download_url, '_blank');
              }
              es.close();
              eventSourceRef.current = null;
            } else if (payload.status === 'failed') {
              setStatus('error');
              setError(payload.error || 'Batch download failed');
              es.close();
              eventSourceRef.current = null;
            }
          } catch {
            // Ignore parse errors from SSE
          }
        };

        es.onerror = () => {
          setStatus('error');
          setError('Connection to download server lost');
          es.close();
          eventSourceRef.current = null;
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Batch download failed';
        setError(message);
        setStatus('error');
      }
    },
    [baseUrl],
  );

  /**
   * Cancel the current batch download by closing the SSE connection
   * and resetting state.
   */
  const cancelDownload = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setStatus('idle');
    setProgress(0);
    setError(null);
  }, []);

  return {
    downloadSingle,
    downloadBatch,
    progress,
    status,
    error,
    cancelDownload,
  };
}
