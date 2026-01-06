/**
 * useUpload Hook
 * Unified hook for managing file uploads with state, progress, and queue management
 * Consolidates upload logic from GalleryUpload and other components
 */

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { galleryService } from '../services/galleryService';
import { calculateSHA256 } from '../utils/sha256';
import { useBrowserCloseWarning } from './useBrowserCloseWarning';
import { getStoredTokens, isTokenExpired } from '../services/tokenStorage';
import { refreshAccessToken, API_BASE_URL } from '../services/api';
import { createTusUpload, type TusUploadClient } from '../services/tusUploadService';
import type { DuplicateAssetResponse } from '../types/gallery';
import { isRawFile } from '../utils/fileUtils';
import { featureFlags, getUploadServiceUrl } from '../config/featureFlags';

// Files larger than this threshold use TUS chunked upload (10MB)
const TUS_UPLOAD_THRESHOLD = 10 * 1024 * 1024;

/**
 * Helper function to create upload session via upload microservice
 */
async function createUploadSessionViaService(
  workspaceId: string,
  request: {
    gallery_id?: string;
    sub_gallery_id?: string | null;
    file_name: string;
    mime_type: string;
    size_bytes: number;
    sha256: string;
    relative_path?: string;
  }
): Promise<{ upload_id: string; upload_url: string }> {
  const baseUrl = featureFlags.uploadMicroservice
    ? getUploadServiceUrl()
    : API_BASE_URL;

  const tokens = getStoredTokens();
  const response = await fetch(`${baseUrl}/api/v1/upload/session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': tokens ? `Bearer ${tokens.accessToken}` : '',
      'X-Workspace-ID': workspaceId,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Upload service error: ${response.statusText} - ${errorText}`);
  }

  return response.json();
}

/**
 * Helper function to commit upload via upload microservice
 */
async function commitUploadViaService(
  workspaceId: string,
  uploadId: string,
  data: {
    sha256: string;
    etag?: string;
    client_metadata?: Record<string, any>;
  }
): Promise<{ asset_id: string }> {
  const baseUrl = featureFlags.uploadMicroservice
    ? getUploadServiceUrl()
    : API_BASE_URL;

  const tokens = getStoredTokens();
  const response = await fetch(`${baseUrl}/api/v1/upload/complete/${uploadId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': tokens ? `Bearer ${tokens.accessToken}` : '',
      'X-Workspace-ID': workspaceId,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Upload commit error: ${response.statusText} - ${errorText}`);
  }

  return response.json();
}

export interface UploadFile {
  id: string;
  file: File;
  status: 'pending' | 'preparing' | 'queued' | 'uploading' | 'verifying' | 'completed' | 'error' | 'paused' | 'cancelled';
  progress: number; // 0-100
  uploadedBytes: number;
  totalBytes: number;
  speed?: number; // bytes/sec
  eta?: number; // seconds
  uploadId?: string; // Upload session ID
  assetId?: string; // Asset ID after commit
  error?: string;
  retryCount?: number;
  thumbnail?: string; // Local preview URL
  clientMetadata?: Record<string, any>;
  preparationProgress?: number; // 0-100 for SHA256 calculation progress
}

export interface UploadProgress {
  total: number;
  completed: number;
  failed: number;
  uploading: number;
  queued: number;
  paused: number;
  totalBytes: number;
  uploadedBytes: number;
  overallProgress: number; // 0-100
  averageSpeed: number; // bytes/sec
  estimatedTimeRemaining: number; // seconds
}

export interface UseUploadOptions {
  workspaceId: string;
  galleryId?: string;
  subGalleryId?: string | null;
  onComplete?: (assetId: string, fileId: string) => void;
  onError?: (error: Error, fileId: string) => void;
  onProgress?: (fileId: string, progress: number) => void;
  onBatchComplete?: (completedCount: number, failedCount: number) => void; // Called when all uploads finish
  enableDuplicateDetection?: boolean; // Default: true
  enableBackgroundUpload?: boolean; // Default: false (can be enabled later)
  maxConcurrent?: number; // Default: 6 (optimized for modern connections)
  retryAttempts?: number; // Default: 3
  retryDelay?: number; // Default: 1000ms
  onDuplicateDetected?: (file: File, duplicates: DuplicateAssetResponse[]) => void; // Callback for duplicate dialog
}

export interface UseUploadReturn {
  // State
  files: UploadFile[];
  progress: UploadProgress;
  isUploading: boolean;
  isPaused: boolean;

  // Actions
  addFiles: (files: File[], skipDuplicateCheck?: boolean) => Promise<void>;
  removeFile: (fileId: string) => void;
  startUpload: () => Promise<void>;
  pauseUpload: (fileId?: string) => void;
  resumeUpload: (fileId?: string) => void;
  cancelUpload: (fileId?: string) => void;
  retryUpload: (fileId: string) => Promise<void>;

  // Helpers
  clearCompleted: () => void;
  clearErrors: () => void;
  clearAll: () => void;
}

/**
 * Unified upload hook
 */
export function useUpload(options: UseUploadOptions): UseUploadReturn {
  const {
    workspaceId,
    galleryId,
    subGalleryId,
    onComplete,
    onError,
    onProgress,
    onBatchComplete,
    enableDuplicateDetection = true,
    maxConcurrent = 6,
    retryAttempts = 3,
    retryDelay = 1000,
    onDuplicateDetected,
  } = options;

  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  // Trigger to signal queue processing without depending on fluctuating 'files' state (progress updates)
  const [queueTrigger, setQueueTrigger] = useState(0);

  const bumpQueue = useCallback(() => setQueueTrigger(t => t + 1), []);

  // Refs for upload state
  const activeUploadsRef = useRef<Set<string>>(new Set());
  const pauseStateRef = useRef<Map<string, boolean>>(new Map());
  const uploadSingleFileRef = useRef<((uploadFile: UploadFile) => Promise<void>) | null>(null);
  const wasUploadingRef = useRef<boolean>(false);
  const batchStartedRef = useRef<boolean>(false);
  // Track files that have started uploading (prevents duplicate uploads from StrictMode/double effects)
  const startedUploadsRef = useRef<Set<string>>(new Set());
  // Track completed uploads in current session (prevents re-upload of already-completed files)
  const completedUploadsRef = useRef<Set<string>>(new Set());
  // Stable ref for files to avoid closure stale issues in processQueue
  const filesRef = useRef<UploadFile[]>([]);
  // TUS upload clients for large files (for pause/resume/cancel)
  const tusClientsRef = useRef<Map<string, TusUploadClient>>(new Map());

  // Calculate progress
  const progress = useMemo<UploadProgress>(() => {
    const total = files.length;
    const completed = files.filter((f) => f.status === 'completed').length;
    const failed = files.filter((f) => f.status === 'error').length;
    const uploading = files.filter((f) => f.status === 'uploading' || f.status === 'verifying' || f.status === 'preparing').length;
    const queued = files.filter((f) => f.status === 'queued' || f.status === 'pending').length;
    const paused = files.filter((f) => f.status === 'paused').length;

    const totalBytes = files.reduce((sum, f) => sum + f.totalBytes, 0);
    const uploadedBytes = files.reduce((sum, f) => sum + f.uploadedBytes, 0);
    const overallProgress = totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0;

    // Calculate average speed
    const uploadingFiles = files.filter((f) => f.status === 'uploading' && f.speed);
    const averageSpeed = uploadingFiles.length > 0
      ? uploadingFiles.reduce((sum, f) => sum + (f.speed || 0), 0) / uploadingFiles.length
      : 0;

    // Calculate ETA
    const remainingBytes = totalBytes - uploadedBytes;
    const estimatedTimeRemaining = averageSpeed > 0 ? Math.round(remainingBytes / averageSpeed) : 0;

    return {
      total,
      completed,
      failed,
      uploading,
      queued,
      paused,
      totalBytes,
      uploadedBytes,
      overallProgress,
      averageSpeed,
      estimatedTimeRemaining,
    };
  }, [files]);

  // Sync filesRef with files state
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  const isUploading = progress.uploading > 0 || progress.queued > 0;

  // Browser close warning
  useBrowserCloseWarning({
    hasActiveUploads: isUploading,
    uploadCount: progress.uploading + progress.queued,
  });

  // Format file size helper
  const formatFileSize = useCallback((bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }, []);

  // Validate file
  const validateFile = useCallback((file: File): string | null => {
    const maxSize = 100 * 1024 * 1024; // 100MB default
    if (file.size > maxSize) {
      return `File size exceeds ${formatFileSize(maxSize)}`;
    }
    // Basic type validation (can be extended)
    return null;
  }, [formatFileSize]);

  // Check for duplicates
  const checkForDuplicates = useCallback(
    async (file: File): Promise<DuplicateAssetResponse[] | null> => {
      if (!enableDuplicateDetection) {
        return null;
      }

      try {
        const sha256 = await calculateSHA256(file);
        if (!galleryId && enableDuplicateDetection) {
          // If no gallery, check against library logic (potentially undefined/null gallery_id in backend)
          const result = await galleryService.checkDuplicate(workspaceId, sha256, undefined);
           return result.is_duplicate ? result.duplicates : null;
        } 
        
        const result = await galleryService.checkDuplicate(workspaceId, sha256, galleryId);
        return result.is_duplicate ? result.duplicates : null;
      } catch (error) {
        // If duplicate check fails, proceed with upload (don't block user)
        console.warn('Failed to check for duplicates:', error);
        return null;
      }
    },
    [workspaceId, galleryId, enableDuplicateDetection]
  );

  // Generate thumbnail preview
  const generateThumbnail = useCallback(async (file: File): Promise<string | undefined> => {
    if (!file.type.startsWith('image/')) {
      return undefined;
    }

    try {
      return URL.createObjectURL(file);
    } catch (error) {
      console.warn('Failed to generate thumbnail:', error);
      return undefined;
    }
  }, []);

  // Update file state
  const updateFile = useCallback((fileId: string, updates: Partial<UploadFile>) => {
    setFiles((prev) =>
      prev.map((f) => {
        if (f.id === fileId) {
          return { ...f, ...updates };
        }
        return f;
      })
    );
  }, []);

  // Add files to queue
  const addFiles = useCallback(
    async (newFiles: File[], skipDuplicateCheck = false) => {
      // Step 1: Immediately add all valid files to state as 'preparing' so UI shows progress panel
      const initialFiles: UploadFile[] = [];
      const filesToProcess: { uploadFile: UploadFile; needsDuplicateCheck: boolean }[] = [];

      for (const file of newFiles) {
        // Validate file
        const validationError = validateFile(file);
        if (validationError) {
          const errorFile: UploadFile = {
            id: `${Date.now()}-${Math.random()}`,
            file,
            status: 'error',
            progress: 0,
            uploadedBytes: 0,
            totalBytes: file.size,
            error: validationError,
          };
          initialFiles.push(errorFile);
          continue;
        }

        // Generate thumbnail synchronously (fast for object URLs)
        let thumbnail: string | undefined;
        if (file.type.startsWith('image/')) {
          try {
            thumbnail = URL.createObjectURL(file);
          } catch {
            // Ignore thumbnail generation failures
          }
        }

        // Add file with 'preparing' status so it shows immediately in the panel
        const uploadFile: UploadFile = {
          id: `${Date.now()}-${Math.random()}`,
          file,
          status: 'preparing',
          progress: 0,
          uploadedBytes: 0,
          totalBytes: file.size,
          retryCount: 0,
          thumbnail,
          clientMetadata: (file as any).clientMetadata,
        };
        initialFiles.push(uploadFile);
        filesToProcess.push({ uploadFile, needsDuplicateCheck: !skipDuplicateCheck });
      }

      // Immediately update state so progress panel is visible
      if (initialFiles.length > 0) {
        setFiles((prev) => [...prev, ...initialFiles]);
      }

      // Step 2: Process duplicate detection in background for each file AND parallelize
      const BATCH_SIZE = 5;
      for (let i = 0; i < filesToProcess.length; i += BATCH_SIZE) {
        const batch = filesToProcess.slice(i, i + BATCH_SIZE);
        
        await Promise.all(batch.map(async ({ uploadFile, needsDuplicateCheck }) => {
            if (uploadFile.status === 'error') return; // Skip already errored files

            if (needsDuplicateCheck && enableDuplicateDetection) {
            try {
                const duplicates = await checkForDuplicates(uploadFile.file);
                if (duplicates && duplicates.length > 0) {
                // Remove file from queue and show duplicate dialog
                setFiles((prev) => prev.filter((f) => f.id !== uploadFile.id));
                if (uploadFile.thumbnail) {
                    URL.revokeObjectURL(uploadFile.thumbnail);
                }
                if (onDuplicateDetected) {
                    onDuplicateDetected(uploadFile.file, duplicates);
                }
                return;
                }
            } catch (error) {
                // If duplicate check fails, proceed with upload
                console.warn('Failed to check for duplicates:', error);
            }
            }

            // Update file status to 'pending' so it enters the upload queue
            updateFile(uploadFile.id, { status: 'pending' });
        }));
      }

      // Trigger queue processing for files that passed duplicate check
      bumpQueue();
    },
    [validateFile, checkForDuplicates, enableDuplicateDetection, onDuplicateDetected, updateFile, bumpQueue]
  );

  // Remove file
  const removeFile = useCallback((fileId: string) => {
    setFiles((prev) => {
      const file = prev.find((f) => f.id === fileId);
      // Cleanup thumbnail URL
      if (file?.thumbnail) {
        URL.revokeObjectURL(file.thumbnail);
      }
      // Cancel upload if in progress
      if (file?.status === 'uploading' || file?.status === 'verifying') {
        activeUploadsRef.current.delete(fileId);
      }
      return prev.filter((f) => f.id !== fileId);
    });
  }, []);

  // Helper to ensure token is valid before upload
  const ensureValidToken = useCallback(async (): Promise<{accessToken: string; refreshToken: string} | null> => {
    const tokens = getStoredTokens();
    if (!tokens) return null;

    try {
      // Check if token is expired or expiring soon (within 1 minute)
      const tokenPayload = JSON.parse(atob(tokens.accessToken.split('.')[1]));
      const expiresAt = tokenPayload.exp * 1000; // Convert to ms
      const now = Date.now();

      if (expiresAt - now < 60000) { // Less than 1 minute remaining
        // Trigger refresh via API client (which has refresh logic and stores new tokens)
        const newAccessToken = await refreshAccessToken();
        if (newAccessToken) {
          // Tokens were refreshed and stored, retrieve the updated tokens
          const updatedTokens = getStoredTokens();
          return updatedTokens;
        }
        // If refresh failed, return existing tokens (they might still work)
        return tokens;
      }

      return tokens;
    } catch (error) {
      console.error('[Upload] Token validation/refresh failed:', error);
      // Return existing tokens as fallback
      return tokens;
    }
  }, []);

  // Upload single file
  const uploadSingleFile = useCallback(
    async (uploadFile: UploadFile): Promise<void> => {
      const fileId = uploadFile.id;
      // Create unique upload key combining fileId and uploadId to prevent duplicate starts
      const uploadKey = `${fileId}-${uploadFile.uploadId || 'new'}`;

      // Check if paused
      if (pauseStateRef.current.get(fileId)) {
        return;
      }

      // === DEDUPLICATION GUARDS (must be BEFORE status change) ===
      // Check if this file has already started uploading (prevents StrictMode double-invocation)
      if (startedUploadsRef.current.has(uploadKey)) {
        console.log(`[Upload] Skipping duplicate start for upload ${uploadKey}`);
        return;
      }
      // Check if file was already completed in this session
      if (completedUploadsRef.current.has(fileId)) {
        console.log(`[Upload] Skipping already-completed file ${fileId}`);
        return;
      }
      // Extra safety: check current filesRef state for completed/verifying (NOT uploading - we're about to set that)
      const currentFileState = filesRef.current.find(f => f.id === fileId);
      if (currentFileState && (currentFileState.status === 'completed' || currentFileState.status === 'verifying')) {
        console.log(`[Upload] Skipping file ${fileId} with status ${currentFileState.status}`);
        return;
      }
      // Mark as started BEFORE any async work
      startedUploadsRef.current.add(uploadKey);

      try {
        // Update status to preparing (for SHA256 calculation)
        updateFile(fileId, { status: 'preparing', progress: 0, preparationProgress: 0 });

        // Check for token expiry before starting - fail early if refresh fails
        if (isTokenExpired()) {
          const newToken = await refreshAccessToken();
          if (!newToken) {
            throw new Error('Session expired. Please log in again to continue uploading.');
          }
        }

        // Calculate SHA256 with progress tracking (runs in Web Worker for large files)
        const sha256 = await calculateSHA256(uploadFile.file, (hashProgress) => {
          updateFile(fileId, { preparationProgress: hashProgress });
        });

        // Now move to uploading status
        updateFile(fileId, { status: 'uploading', progress: 0 });

        // Check if paused again after SHA calc
        if (pauseStateRef.current.get(fileId)) {
          return;
        }

        let assetId: string;

        // Use TUS chunked upload for large files (> 10MB) for better reliability and resume capability
        if (uploadFile.file.size > TUS_UPLOAD_THRESHOLD && galleryId) {
          // ========== TUS CHUNKED UPLOAD (for large files) ==========
          const tusClient = createTusUpload({
            workspaceId,
            galleryId,
            subGalleryId: subGalleryId || undefined,
            file: uploadFile.file,
            uploadId: uploadFile.uploadId, // Resume if retrying
            chunkSize: 5 * 1024 * 1024, // 5MB chunks
            onProgress: (uploaded, total, percentage) => {
              const speed = uploaded / ((Date.now() - Date.now()) / 1000 || 1);
              const remainingBytes = total - uploaded;
              const eta = speed > 0 ? Math.ceil(remainingBytes / speed) : undefined;

              updateFile(fileId, {
                progress: percentage,
                uploadedBytes: uploaded,
                speed: speed > 0 ? speed : undefined,
                eta,
              });
              onProgress?.(fileId, percentage);
            },
          });

          // Store client reference for pause/cancel operations
          tusClientsRef.current.set(fileId, tusClient);

          try {
            // TUS client handles session creation, chunking, and commit
            assetId = await tusClient.start();
            updateFile(fileId, { uploadId: tusClient.getState().uploadId });
          } finally {
            // Cleanup TUS client reference
            tusClientsRef.current.delete(fileId);
          }
        } else {
          // ========== STANDARD SINGLE-REQUEST UPLOAD (for small files) ==========
          // Reuse existing session if retrying (prevents duplicate uploads)
          let sessionUploadId = uploadFile.uploadId;
          let uploadUrl = '';

          if (!sessionUploadId) {
            // Create upload session only if we don't have one
            const isRaw = isRawFile(uploadFile.file.name);
            const mimeType = uploadFile.file.type || (isRaw ? '' : 'application/octet-stream');

            // Log RAW file uploads
            if (isRaw) {
              console.info(
                `Uploading RAW file: ${uploadFile.file.name} ` +
                `(MIME: ${uploadFile.file.type || 'empty'}, size: ${uploadFile.file.size})`
              );
            }

            // Use upload microservice if feature flag is enabled
            const session = featureFlags.uploadMicroservice
              ? await createUploadSessionViaService(workspaceId, {
                  gallery_id: galleryId || undefined,
                  sub_gallery_id: subGalleryId || null,
                  file_name: uploadFile.file.name,
                  mime_type: mimeType,
                  size_bytes: uploadFile.file.size,
                  sha256,
                  relative_path: (uploadFile.file as any).webkitRelativePath || undefined,
                })
              : await galleryService.createUploadSession(workspaceId, {
                  gallery_id: galleryId || undefined,
                  sub_gallery_id: subGalleryId || null,
                  file_name: uploadFile.file.name,
                  mime_type: mimeType, // Pass empty string for RAW if browser doesn't provide
                  size_bytes: uploadFile.file.size,
                  sha256,
                  relative_path: (uploadFile.file as any).webkitRelativePath || undefined,
                });
            sessionUploadId = session.upload_id;
            // CRITICAL: Always use the upload_url returned by the backend
            // This ensures correct environment (dev vs prod) URL is used
            uploadUrl = session.upload_url;
            updateFile(fileId, { uploadId: session.upload_id });
          } else {
            // Existing session for retry - get upload URL from backend
            // Use API_BASE_URL which properly handles VITE_API_URL (even empty string for relative URLs)
            const apiBase = API_BASE_URL;
            uploadUrl = `${apiBase}/api/v1/workspaces/${workspaceId}/uploads/${sessionUploadId}/upload`;
          }

          // Ensure token is valid before uploading
          const validTokens = await ensureValidToken();

          // Upload file to R2 using XMLHttpRequest for progress tracking
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            const startTime = Date.now();
            let lastLoaded = 0;
            let lastTime = startTime;

            xhr.open('PUT', uploadUrl);

            // Set headers with validated/refreshed token
            if (validTokens && uploadUrl.includes('/api/v1/')) {
              xhr.setRequestHeader('Authorization', `Bearer ${validTokens.accessToken}`);
            }
            xhr.setRequestHeader('X-Workspace-ID', workspaceId);

            // Progress handler
            xhr.upload.onprogress = (event) => {
              if (event.lengthComputable) {
                const currentTime = Date.now();
                const timeDiff = (currentTime - lastTime) / 1000; // seconds

                // Calculate speed (bytes per second)
                let speed = 0;
                if (timeDiff > 0.5) { // Update speed every 500ms
                  const bytesDiff = event.loaded - lastLoaded;
                  speed = bytesDiff / timeDiff;
                  // Calculate ETA (seconds)
                  const remainingBytes = event.total - event.loaded;
                  const eta = speed > 0 ? Math.ceil(remainingBytes / speed) : undefined;

                  const progress = (event.loaded / event.total) * 100;

                  // Only update state if meaningful change to avoid excessive re-renders
                  updateFile(fileId, {
                    progress,
                    uploadedBytes: event.loaded,
                    speed: speed > 0 ? speed : undefined,
                    eta
                  });

                  onProgress?.(fileId, progress);
                  lastLoaded = event.loaded;
                  lastTime = currentTime;
                }
              }
            };

            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
              } else {
                const error = new Error(`Upload failed: ${xhr.statusText}`);
                (error as any).status = xhr.status;
                reject(error);
              }
            };

            xhr.onerror = () => reject(new Error('Network error'));
            xhr.onabort = () => reject(new Error('Upload cancelled'));

            // Handle cancellation if needed
            if (pauseStateRef.current.get(fileId)) {
              xhr.abort();
              return;
            }

            xhr.send(uploadFile.file);
          });

          updateFile(fileId, { progress: 90, status: 'verifying' });

          // Commit upload - use upload microservice if feature flag is enabled
          const commitResult = featureFlags.uploadMicroservice
            ? await commitUploadViaService(
                workspaceId,
                sessionUploadId,
                {
                  sha256,
                  etag: undefined,
                  client_metadata: uploadFile.clientMetadata
                }
              )
            : await galleryService.commitUpload(
                workspaceId,
                sessionUploadId,
                {
                  sha256,
                  etag: undefined,
                  client_metadata: uploadFile.clientMetadata
                }
              );

          assetId = commitResult.asset_id;
        }

        // Update to completed
        updateFile(fileId, {
          status: 'completed',
          progress: 100,
          uploadedBytes: uploadFile.totalBytes,
          assetId,
        });

        // Cleanup
        activeUploadsRef.current.delete(fileId);
        completedUploadsRef.current.add(fileId); // Mark as completed in session
        startedUploadsRef.current.delete(uploadKey); // Clean up upload session tracking
        if (uploadFile.thumbnail) {
          URL.revokeObjectURL(uploadFile.thumbnail);
        }

        onComplete?.(assetId, fileId);
        onProgress?.(fileId, 100);
        
        // Trigger queue to pick up next file
        bumpQueue();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Upload failed';
        const retryCount = (uploadFile.retryCount || 0) + 1;
        const status = (error as any)?.status;

        // Handle 401 specifically
        if (status === 401) {
          await refreshAccessToken();
        }

        if (retryCount <= retryAttempts) {
          // Retry - preserve uploadId to avoid creating duplicate sessions
          const currentUploadId = uploadFile.uploadId;
          // Clear started flag to allow retry
          startedUploadsRef.current.delete(fileId);
          updateFile(fileId, {
            status: 'pending',
            error: undefined,
            retryCount,
          });
          // Retry after delay with preserved uploadId
          // Use exponential backoff with cap to prevent excessive delays
          const backoffDelay = Math.min(retryDelay * Math.pow(1.5, retryCount - 1), 5000);
          setTimeout(() => {
            if (uploadSingleFileRef.current) {
              uploadSingleFileRef.current({ ...uploadFile, retryCount, uploadId: currentUploadId });
            }
          }, backoffDelay); // Exponential backoff: 1s, 1.5s, 2.25s, 3.375s, max 5s
        } else {
          // Max retries reached
          updateFile(fileId, {
            status: 'error',
            error: errorMessage,
            retryCount,
          });
          activeUploadsRef.current.delete(fileId);
          startedUploadsRef.current.delete(uploadKey); // Clean up upload session tracking
          onError?.(error instanceof Error ? error : new Error(errorMessage), fileId);
        }
      }
    },
    [workspaceId, galleryId, subGalleryId, retryAttempts, retryDelay, updateFile, onComplete, onError, onProgress, bumpQueue]
  );

  // Store latest version in ref for recursive calls
  useEffect(() => {
    uploadSingleFileRef.current = uploadSingleFile;
  }, [uploadSingleFile]);

  // Process upload queue
  const processQueue = useCallback(async () => {
    if (isPaused) {
      return;
    }

    const activeCount = activeUploadsRef.current.size;
    if (activeCount >= maxConcurrent) {
      return;
    }

    const availableSlots = maxConcurrent - activeCount;
    // Use filesRef.current instead of files to avoid stale closure and dependency churn
    const currentFiles = filesRef.current;
    const pendingFiles = currentFiles.filter(
      (f) => (f.status === 'pending' || f.status === 'queued') && 
             !pauseStateRef.current.get(f.id) &&
             !completedUploadsRef.current.has(f.id) &&
             !startedUploadsRef.current.has(f.id)
    );

    const filesToUpload = pendingFiles.slice(0, availableSlots);

    for (const file of filesToUpload) {
      activeUploadsRef.current.add(file.id);
      updateFile(file.id, { status: 'queued' });
      uploadSingleFile(file).catch((error) => {
        console.error('Upload error:', error);
        activeUploadsRef.current.delete(file.id);
      });
    }
  }, [isPaused, maxConcurrent, uploadSingleFile, updateFile]);

  // Start uploads
  const startUpload = useCallback(async () => {
    setIsPaused(false);
    pauseStateRef.current.clear();

    // Mark pending files as queued
    setFiles((prev) =>
      prev.map((f) => {
        if (f.status === 'pending') {
          return { ...f, status: 'queued' };
        }
        return f;
      })
    );

    // Process queue
    await processQueue();
  }, [processQueue]);

  // Pause upload
  const pauseUpload = useCallback((fileId?: string) => {
    if (fileId) {
      pauseStateRef.current.set(fileId, true);
      // Pause TUS client if exists
      const tusClient = tusClientsRef.current.get(fileId);
      if (tusClient) {
        tusClient.pause();
      }
      updateFile(fileId, { status: 'paused' });
    } else {
      setIsPaused(true);
      setFiles((prev) =>
        prev.map((f) => {
          if (f.status === 'uploading' || f.status === 'verifying' || f.status === 'preparing') {
            pauseStateRef.current.set(f.id, true);
            // Pause TUS client if exists
            const tusClient = tusClientsRef.current.get(f.id);
            if (tusClient) {
              tusClient.pause();
            }
            return { ...f, status: 'paused' };
          }
          return f;
        })
      );
    }
  }, [updateFile]);

  // Resume upload
  const resumeUpload = useCallback((fileId?: string) => {
    if (fileId) {
      pauseStateRef.current.delete(fileId);
      const file = files.find((f) => f.id === fileId);
      if (file && file.status === 'paused') {
        updateFile(fileId, { status: 'pending' });
        bumpQueue();
      }
    } else {
      setIsPaused(false);
      pauseStateRef.current.clear();
      setFiles((prev) =>
        prev.map((f) => {
          if (f.status === 'paused') {
            pauseStateRef.current.delete(f.id);
            return { ...f, status: 'pending' };
          }
          return f;
        })
      );
      // Trigger queue
      bumpQueue();
    }
  }, [files, updateFile, bumpQueue]);

  // Cancel upload
  const cancelUpload = useCallback((fileId?: string) => {
    if (fileId) {
      activeUploadsRef.current.delete(fileId);
      pauseStateRef.current.delete(fileId);
      // Abort TUS client if exists
      const tusClient = tusClientsRef.current.get(fileId);
      if (tusClient) {
        tusClient.abort();
        tusClientsRef.current.delete(fileId);
      }
      updateFile(fileId, { status: 'cancelled' });
      removeFile(fileId);
    } else {
      // Cancel all
      activeUploadsRef.current.clear();
      pauseStateRef.current.clear();
      // Abort all TUS clients
      tusClientsRef.current.forEach((client) => client.abort());
      tusClientsRef.current.clear();
      setFiles((prev) => {
        prev.forEach((f) => {
          if (f.thumbnail) {
            URL.revokeObjectURL(f.thumbnail);
          }
        });
        return [];
      });
    }
  }, [updateFile, removeFile]);

  // Retry upload
  const retryUpload = useCallback(
    async (fileId: string) => {
      // Use filesRef to avoid stale closure or dependency on frequently changing files state
      const file = filesRef.current.find((f) => f.id === fileId);
      if (!file || file.status !== 'error') {
        return;
      }

      // Clear the started flag to allow retry
      startedUploadsRef.current.delete(fileId);

      updateFile(fileId, {
        status: 'pending',
        error: undefined,
        progress: 0,
        uploadedBytes: 0,
        retryCount: 0,
      });

      // Trigger queue processing
      bumpQueue();
    },
    [updateFile, bumpQueue]
  );

  // Clear completed
  const clearCompleted = useCallback(() => {
    setFiles((prev) => {
      const completed = prev.filter((f) => f.status === 'completed');
      completed.forEach((f) => {
        if (f.thumbnail) {
          URL.revokeObjectURL(f.thumbnail);
        }
      });
      return prev.filter((f) => f.status !== 'completed');
    });
  }, []);

  // Clear errors
  const clearErrors = useCallback(() => {
    setFiles((prev) => prev.filter((f) => f.status !== 'error'));
  }, []);

  // Clear all
  const clearAll = useCallback(() => {
    setFiles((prev) => {
      prev.forEach((f) => {
        if (f.thumbnail) {
          URL.revokeObjectURL(f.thumbnail);
        }
      });
      return [];
    });
    activeUploadsRef.current.clear();
    pauseStateRef.current.clear();
    startedUploadsRef.current.clear();
  }, []);

  // Process queue when trigger changes
  useEffect(() => {
    if (!isPaused && activeUploadsRef.current.size < maxConcurrent) {
      processQueue();
    }
  }, [queueTrigger, isPaused, maxConcurrent, processQueue]);

  // Track batch start - when uploading begins
  useEffect(() => {
    if (isUploading && !batchStartedRef.current) {
      batchStartedRef.current = true;
      wasUploadingRef.current = true;
    }
  }, [isUploading]);

  // Detect batch completion - when all uploads finish
  useEffect(() => {
    // Only fire if we were uploading and now we're done
    if (wasUploadingRef.current && !isUploading && batchStartedRef.current) {
      // All uploads finished (either completed or failed)
      if (progress.completed > 0 || progress.failed > 0) {
        onBatchComplete?.(progress.completed, progress.failed);
      }
      // Reset tracking for next batch
      wasUploadingRef.current = false;
      batchStartedRef.current = false;
    }
  }, [isUploading, progress.completed, progress.failed, onBatchComplete]);

  return {
    files,
    progress,
    isUploading,
    isPaused,
    addFiles,
    removeFile,
    startUpload,
    pauseUpload,
    resumeUpload,
    cancelUpload,
    retryUpload,
    clearCompleted,
    clearErrors,
    clearAll,
  };
}

