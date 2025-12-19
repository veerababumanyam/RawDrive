/**
 * Upload Worker
 * Web Worker for background file uploads
 * Continues uploads when tab is inactive or minimized
 * Shows browser notifications on completion
 * Persists upload queue state to localStorage
 * Restores queue state on page return
 */

import { createTusUpload, TusUploadClient } from '../services/tusUploadService';

export interface UploadWorkerMessage {
  type: 'start' | 'pause' | 'resume' | 'cancel' | 'get_status' | 'restore';
  payload?: {
    uploadId?: string;
    workspaceId?: string;
    galleryId?: string;
    subGalleryId?: string | null;
    file?: File;
    uploadOptions?: {
      chunkSize?: number;
      onProgress?: (uploaded: number, total: number, percentage: number) => void;
      onComplete?: (assetId: string) => void;
      onError?: (error: Error) => void;
    };
  };
}

export interface UploadWorkerResponse {
  type: 'progress' | 'complete' | 'error' | 'status' | 'notification';
  uploadId?: string;
  payload?: {
    uploaded?: number;
    total?: number;
    percentage?: number;
    assetId?: string;
    error?: string;
    status?: 'queued' | 'uploading' | 'paused' | 'completed' | 'error' | 'cancelled';
    restoredUploads?: number;
    uploads?: Array<{ uploadId: string; status?: string; fileName?: string }>;
  };
}

// Store active uploads
const activeUploads = new Map<string, TusUploadClient>();

// Storage key prefix
const STORAGE_PREFIX = 'upload_worker_';

/**
 * Save upload state to localStorage
 */
function saveUploadState(uploadId: string, state: any): void {
  try {
    const key = `${STORAGE_PREFIX}${uploadId}`;
    localStorage.setItem(key, JSON.stringify({
      ...state,
      timestamp: Date.now(),
    }));
  } catch (error) {
    console.error('Failed to save upload state:', error);
  }
}

/**
 * Load upload state from localStorage
 */
function loadUploadState(uploadId: string): any | null {
  try {
    const key = `${STORAGE_PREFIX}${uploadId}`;
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    return JSON.parse(stored);
  } catch (error) {
    console.error('Failed to load upload state:', error);
    return null;
  }
}

/**
 * Clear upload state from localStorage
 */
function clearUploadState(uploadId: string): void {
  try {
    const key = `${STORAGE_PREFIX}${uploadId}`;
    localStorage.removeItem(key);
  } catch (error) {
    console.error('Failed to clear upload state:', error);
  }
}

/**
 * Show browser notification
 */
function showNotification(title: string, options?: NotificationOptions): void {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, options);
  } else if ('Notification' in window && Notification.permission !== 'denied') {
    Notification.requestPermission().then((permission) => {
      if (permission === 'granted') {
        new Notification(title, options);
      }
    });
  }
}

/**
 * Request notification permission
 */
function requestNotificationPermission(): void {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

// Request notification permission on worker start
requestNotificationPermission();

/**
 * Handle start upload message
 */
async function handleStartUpload(message: UploadWorkerMessage): Promise<void> {
  const { uploadId, workspaceId, galleryId, subGalleryId, file, uploadOptions } = message.payload!;

  if (!uploadId || !workspaceId || !galleryId || !file) {
    self.postMessage({
      type: 'error',
      uploadId,
      payload: { error: 'Missing required parameters' },
    } as UploadWorkerResponse);
    return;
  }

  try {
    // Create TUS upload client
    const client = createTusUpload({
      workspaceId,
      galleryId,
      subGalleryId,
      file,
      chunkSize: uploadOptions?.chunkSize,
      onProgress: (uploaded, total, percentage) => {
        // Save progress to localStorage
        saveUploadState(uploadId, {
          uploaded,
          total,
          percentage,
          status: 'uploading',
        });

        // Send progress update
        self.postMessage({
          type: 'progress',
          uploadId,
          payload: { uploaded, total, percentage },
        } as UploadWorkerResponse);

        // Call optional callback
        uploadOptions?.onProgress?.(uploaded, total, percentage);
      },
      onComplete: (assetId) => {
        // Clear state
        clearUploadState(uploadId);
        activeUploads.delete(uploadId);

        // Show notification
        showNotification('Upload Complete', {
          body: `${file.name} has been uploaded successfully`,
          icon: '/favicon-32x32.png',
        });

        // Send completion message
        self.postMessage({
          type: 'complete',
          uploadId,
          payload: { assetId },
        } as UploadWorkerResponse);

        // Call optional callback
        uploadOptions?.onComplete?.(assetId);
      },
      onError: (error) => {
        // Save error state
        saveUploadState(uploadId, {
          status: 'error',
          error: error.message,
        });

        // Show notification
        showNotification('Upload Failed', {
          body: `${file.name} failed to upload: ${error.message}`,
          icon: '/favicon-32x32.png',
        });

        // Send error message
        self.postMessage({
          type: 'error',
          uploadId,
          payload: { error: error.message },
        } as UploadWorkerResponse);

        // Call optional callback
        uploadOptions?.onError?.(error);
      },
    });

    // Store client
    activeUploads.set(uploadId, client);

    // Save initial state
    saveUploadState(uploadId, {
      workspaceId,
      galleryId,
      subGalleryId,
      fileName: file.name,
      fileSize: file.size,
      status: 'queued',
    });

    // Start upload
    await client.start();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    self.postMessage({
      type: 'error',
      uploadId,
      payload: { error: errorMessage },
    } as UploadWorkerResponse);
  }
}

/**
 * Handle pause upload message
 */
function handlePauseUpload(message: UploadWorkerMessage): void {
  const { uploadId } = message.payload!;
  const client = activeUploads.get(uploadId!);

  if (!client) {
    self.postMessage({
      type: 'error',
      uploadId,
      payload: { error: 'Upload not found' },
    } as UploadWorkerResponse);
    return;
  }

  client.pause();
  saveUploadState(uploadId!, { status: 'paused' });

  self.postMessage({
    type: 'status',
    uploadId,
    payload: { status: 'paused' },
  } as UploadWorkerResponse);
}

/**
 * Handle resume upload message
 */
async function handleResumeUpload(message: UploadWorkerMessage): Promise<void> {
  const { uploadId } = message.payload!;
  const client = activeUploads.get(uploadId!);

  if (!client) {
    self.postMessage({
      type: 'error',
      uploadId,
      payload: { error: 'Upload not found' },
    } as UploadWorkerResponse);
    return;
  }

  try {
    await client.resume();
    saveUploadState(uploadId!, { status: 'uploading' });

    self.postMessage({
      type: 'status',
      uploadId,
      payload: { status: 'uploading' },
    } as UploadWorkerResponse);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    self.postMessage({
      type: 'error',
      uploadId,
      payload: { error: errorMessage },
    } as UploadWorkerResponse);
  }
}

/**
 * Handle cancel upload message
 */
function handleCancelUpload(message: UploadWorkerMessage): void {
  const { uploadId } = message.payload!;
  const client = activeUploads.get(uploadId!);

  if (!client) {
    self.postMessage({
      type: 'error',
      uploadId,
      payload: { error: 'Upload not found' },
    } as UploadWorkerResponse);
    return;
  }

  client.abort();
  clearUploadState(uploadId!);
  activeUploads.delete(uploadId!);

  self.postMessage({
    type: 'status',
    uploadId,
    payload: { status: 'cancelled' },
  } as UploadWorkerResponse);
}

/**
 * Handle get status message
 */
function handleGetStatus(message: UploadWorkerMessage): void {
  const { uploadId } = message.payload!;
  const state = loadUploadState(uploadId!);

  if (!state) {
    self.postMessage({
      type: 'error',
      uploadId,
      payload: { error: 'Upload state not found' },
    } as UploadWorkerResponse);
    return;
  }

  self.postMessage({
    type: 'status',
    uploadId,
    payload: {
      status: state.status || 'unknown',
      uploaded: state.uploaded,
      total: state.total,
      percentage: state.percentage,
    },
  } as UploadWorkerResponse);
}

/**
 * Handle restore uploads message
 */
function handleRestoreUploads(): void {
  try {
    const keys = Object.keys(localStorage);
    const uploadKeys = keys.filter((key) => key.startsWith(STORAGE_PREFIX));

    const restoredUploads = uploadKeys.map((key) => {
      const uploadId = key.replace(STORAGE_PREFIX, '');
      const state = loadUploadState(uploadId);
      return { uploadId, state };
    });

    self.postMessage({
      type: 'status',
      payload: {
        restoredUploads: restoredUploads.length,
        uploads: restoredUploads.map(({ uploadId, state }) => ({
          uploadId,
          status: state?.status,
          fileName: state?.fileName,
        })),
      },
    } as UploadWorkerResponse);
  } catch (error) {
    console.error('Failed to restore uploads:', error);
  }
}

/**
 * Main message handler
 */
self.addEventListener('message', async (event: MessageEvent<UploadWorkerMessage>) => {
  const { type } = event.data;

  try {
    switch (type) {
      case 'start':
        await handleStartUpload(event.data);
        break;
      case 'pause':
        handlePauseUpload(event.data);
        break;
      case 'resume':
        await handleResumeUpload(event.data);
        break;
      case 'cancel':
        handleCancelUpload(event.data);
        break;
      case 'get_status':
        handleGetStatus(event.data);
        break;
      case 'restore':
        handleRestoreUploads();
        break;
      default:
        self.postMessage({
          type: 'error',
          payload: { error: `Unknown message type: ${type}` },
        } as UploadWorkerResponse);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    self.postMessage({
      type: 'error',
      payload: { error: errorMessage },
    } as UploadWorkerResponse);
  }
});

// Types are exported above as interfaces

