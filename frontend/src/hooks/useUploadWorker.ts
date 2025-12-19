/**
 * useUploadWorker Hook
 * React hook for managing uploads via Web Worker
 * Handles worker lifecycle, message passing, and state management
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { UploadWorkerMessage, UploadWorkerResponse } from '../workers/uploadWorker';

export interface UploadWorkerState {
  uploadId: string;
  status: 'queued' | 'uploading' | 'paused' | 'completed' | 'error' | 'cancelled';
  uploaded: number;
  total: number;
  percentage: number;
  fileName?: string;
  error?: string;
}

export interface UseUploadWorkerReturn {
  /** Start an upload */
  startUpload: (
    uploadId: string,
    workspaceId: string,
    galleryId: string,
    file: File,
    options?: {
      subGalleryId?: string | null;
      chunkSize?: number;
    }
  ) => void;
  /** Pause an upload */
  pauseUpload: (uploadId: string) => void;
  /** Resume an upload */
  resumeUpload: (uploadId: string) => void;
  /** Cancel an upload */
  cancelUpload: (uploadId: string) => void;
  /** Get upload status */
  getStatus: (uploadId: string) => void;
  /** Restore uploads from localStorage */
  restoreUploads: () => void;
  /** Active uploads */
  uploads: Map<string, UploadWorkerState>;
  /** Worker ready state */
  isReady: boolean;
}

/**
 * Hook for managing uploads via Web Worker
 */
export function useUploadWorker(
  callbacks?: {
    onProgress?: (uploadId: string, uploaded: number, total: number, percentage: number) => void;
    onComplete?: (uploadId: string, assetId: string) => void;
    onError?: (uploadId: string, error: Error) => void;
  }
): UseUploadWorkerReturn {
  const workerRef = useRef<Worker | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [uploads, setUploads] = useState<Map<string, UploadWorkerState>>(new Map());

  // Initialize worker
  useEffect(() => {
    try {
      // Create worker instance
      const worker = new Worker(
        new URL('../workers/uploadWorker.ts', import.meta.url),
        { type: 'module' }
      );

      // Handle worker messages
      worker.onmessage = (event: MessageEvent<UploadWorkerResponse>) => {
        const { type, uploadId, payload } = event.data;

        if (type === 'progress' && uploadId && payload) {
          setUploads((prev) => {
            const updated = new Map(prev);
            updated.set(uploadId, {
              uploadId,
              status: 'uploading',
              uploaded: payload.uploaded || 0,
              total: payload.total || 0,
              percentage: payload.percentage || 0,
            });
            return updated;
          });

          callbacks?.onProgress?.(
            uploadId,
            payload.uploaded || 0,
            payload.total || 0,
            payload.percentage || 0
          );
        } else if (type === 'complete' && uploadId && payload) {
          setUploads((prev) => {
            const updated = new Map(prev);
            updated.set(uploadId, {
              uploadId,
              status: 'completed',
              uploaded: updated.get(uploadId)?.total || 0,
              total: updated.get(uploadId)?.total || 0,
              percentage: 100,
            });
            return updated;
          });

          callbacks?.onComplete?.(uploadId, payload.assetId || '');
        } else if (type === 'error' && uploadId && payload) {
          setUploads((prev) => {
            const updated = new Map(prev);
            updated.set(uploadId, {
              uploadId,
              status: 'error',
              uploaded: updated.get(uploadId)?.uploaded || 0,
              total: updated.get(uploadId)?.total || 0,
              percentage: updated.get(uploadId)?.percentage || 0,
              error: payload.error,
            });
            return updated;
          });

          if (payload.error) {
            callbacks?.onError?.(uploadId, new Error(payload.error));
          }
        } else if (type === 'status' && uploadId && payload) {
          setUploads((prev) => {
            const updated = new Map(prev);
            const existing = updated.get(uploadId);
            updated.set(uploadId, {
              uploadId,
              status: payload.status || existing?.status || 'queued',
              uploaded: payload.uploaded || existing?.uploaded || 0,
              total: payload.total || existing?.total || 0,
              percentage: payload.percentage || existing?.percentage || 0,
            });
            return updated;
          });
        }
      };

      // Handle worker errors
      worker.onerror = (error) => {
        console.error('Upload worker error:', error);
        setIsReady(false);
      };

      workerRef.current = worker;
      setIsReady(true);

      // Restore uploads on mount
      restoreUploads();

      return () => {
        worker.terminate();
        setIsReady(false);
      };
    } catch (error) {
      console.error('Failed to create upload worker:', error);
      setIsReady(false);
    }
  }, []);

  const sendMessage = useCallback((message: UploadWorkerMessage) => {
    if (workerRef.current && isReady) {
      workerRef.current.postMessage(message);
    } else {
      console.warn('Worker not ready');
    }
  }, [isReady]);

  const startUpload = useCallback(
    (
      uploadId: string,
      workspaceId: string,
      galleryId: string,
      file: File,
      options?: {
        subGalleryId?: string | null;
        chunkSize?: number;
      }
    ) => {
      sendMessage({
        type: 'start',
        payload: {
          uploadId,
          workspaceId,
          galleryId,
          subGalleryId: options?.subGalleryId,
          file,
          uploadOptions: {
            chunkSize: options?.chunkSize,
          },
        },
      });
    },
    [sendMessage]
  );

  const pauseUpload = useCallback(
    (uploadId: string) => {
      sendMessage({
        type: 'pause',
        payload: { uploadId },
      });
    },
    [sendMessage]
  );

  const resumeUpload = useCallback(
    (uploadId: string) => {
      sendMessage({
        type: 'resume',
        payload: { uploadId },
      });
    },
    [sendMessage]
  );

  const cancelUpload = useCallback(
    (uploadId: string) => {
      sendMessage({
        type: 'cancel',
        payload: { uploadId },
      });
      setUploads((prev) => {
        const updated = new Map(prev);
        updated.delete(uploadId);
        return updated;
      });
    },
    [sendMessage]
  );

  const getStatus = useCallback(
    (uploadId: string) => {
      sendMessage({
        type: 'get_status',
        payload: { uploadId },
      });
    },
    [sendMessage]
  );

  const restoreUploads = useCallback(() => {
    sendMessage({
      type: 'restore',
    });
  }, [sendMessage]);

  return {
    startUpload,
    pauseUpload,
    resumeUpload,
    cancelUpload,
    getStatus,
    restoreUploads,
    uploads,
    isReady,
  };
}

