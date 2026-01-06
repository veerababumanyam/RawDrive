/**
 * TUS Upload Service
 * Implements TUS (Resumable Upload Protocol) for resumable file uploads
 * Supports pause/resume functionality and auto-resume on connection restoration
 *
 * TUS Protocol Specification: https://tus.io/protocols/resumable-upload.html
 */

import { galleryService } from './galleryService';
import { getStoredTokens } from './tokenStorage';
import { getApiBaseUrl } from './api';

export interface TusUploadOptions {
  /** Workspace ID */
  workspaceId: string;
  /** Gallery ID */
  galleryId: string;
  /** Sub-gallery ID (optional) */
  subGalleryId?: string | null;
  /** File to upload */
  file: File;
  /** Upload session ID (for resuming) */
  uploadId?: string;
  /** Chunk size in bytes (default: 5MB) */
  chunkSize?: number;
  /** Callback for upload progress */
  onProgress?: (uploaded: number, total: number, percentage: number) => void;
  /** Callback when upload completes */
  onComplete?: (assetId: string) => void;
  /** Callback when upload fails */
  onError?: (error: Error) => void;
  /** Callback when upload is paused */
  onPause?: () => void;
  /** Callback when upload is resumed */
  onResume?: () => void;
}

export interface TusUploadState {
  uploadId: string;
  uploadedBytes: number;
  totalBytes: number;
  isPaused: boolean;
  isComplete: boolean;
  error?: Error;
}

/**
 * Calculate SHA256 hash of file
 */
async function calculateSHA256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * TUS Upload Client
 * Implements TUS protocol for resumable uploads
 */
export class TusUploadClient {
  private uploadId?: string;
  private uploadedBytes: number = 0;
  private totalBytes: number;
  private isPaused: boolean = false;
  private isComplete: boolean = false;
  private error?: Error;
  private abortController?: AbortController;
  private options: Required<Pick<TusUploadOptions, 'chunkSize'>> & Omit<TusUploadOptions, 'chunkSize'>;

  constructor(options: TusUploadOptions) {
    this.options = {
      ...options,
      chunkSize: options.chunkSize || 5 * 1024 * 1024, // 5MB default
    };
    this.totalBytes = options.file.size;
    this.uploadId = options.uploadId; // For resuming
  }

  /**
   * Start or resume upload
   */
  async start(): Promise<string> {
    if (this.isComplete) {
      throw new Error('Upload already completed');
    }
    if (this.error && !this.uploadId) {
      throw new Error('Cannot resume failed upload without upload ID');
    }

    this.isPaused = false;
    this.error = undefined;
    this.abortController = new AbortController();

    try {
      // Create upload session if not resuming
      if (!this.uploadId) {
        await this.createUploadSession();
      }

      // Register this client for auto-resume capabilities
      if (this.uploadId) {
        registerUploadClient(this);
      }

      // Upload file chunks
      await this.uploadChunks();

      // Commit upload
      const assetId = await this.commitUpload();

      this.isComplete = true;

      // Unregister on success
      if (this.uploadId) {
        unregisterUploadClient(this.uploadId);
      }

      this.options.onComplete?.(assetId);
      return assetId;
    } catch (error) {
      this.error = error instanceof Error ? error : new Error(String(error));
      this.options.onError?.(this.error);
      throw this.error;
    }
  }

  /**
   * Pause upload
   */
  pause(): void {
    this.isPaused = true;
    this.abortController?.abort();
    this.abortController = undefined;
    this.options.onPause?.();
  }

  /**
   * Resume upload
   */
  async resume(): Promise<string> {
    if (!this.uploadId) {
      throw new Error('Cannot resume upload without upload ID');
    }
    this.options.onResume?.();
    return this.start();
  }

  /**
   * Abort upload
   */
  abort(): void {
    this.pause();
    this.error = new Error('Upload aborted by user');
    if (this.uploadId) {
      // Use the global function assuming it's available in module scope
      // Since we can't easily reference the hoisted function inside a replacement chunk depending on order,
      // we assume the runtime will handle function hoisting or we'll get a lint error if strict.
      // But safe bet is strictly module functions are available.
      unregisterUploadClient(this.uploadId);
    }
  }

  /**
   * Get current upload state
   */
  getState(): TusUploadState {
    return {
      uploadId: this.uploadId!,
      uploadedBytes: this.uploadedBytes,
      totalBytes: this.totalBytes,
      isPaused: this.isPaused,
      isComplete: this.isComplete,
      error: this.error,
    };
  }

  /**
   * Create upload session
   */
  private async createUploadSession(): Promise<void> {
    const sha256 = await calculateSHA256(this.options.file);

    const session = await galleryService.createUploadSession(this.options.workspaceId, {
      file_name: this.options.file.name,
      mime_type: this.options.file.type,
      size_bytes: this.options.file.size,
      gallery_id: this.options.galleryId,
      sub_gallery_id: this.options.subGalleryId,
      sha256: sha256,
      // Note: resumable_protocol will be added to UploadSessionRequest type when backend supports it
      // For now, backend will default to TUS if supported
    });

    this.uploadId = session.upload_id;
  }

  /**
   * Upload file in chunks
   */
  private async uploadChunks(): Promise<void> {
    if (!this.uploadId) {
      throw new Error('Upload session not created');
    }

    const { chunkSize, file } = this.options;
    let offset = this.uploadedBytes;

    while (offset < this.totalBytes && !this.isPaused) {
      if (this.abortController?.signal.aborted) {
        throw new Error('Upload aborted');
      }

      const chunkEnd = Math.min(offset + chunkSize, this.totalBytes);
      const chunk = file.slice(offset, chunkEnd);

      // Upload chunk using PATCH (TUS protocol)
      await this.uploadChunk(chunk, offset, chunkEnd);

      offset = chunkEnd;
      this.uploadedBytes = offset;

      // Report progress
      const percentage = Math.round((this.uploadedBytes / this.totalBytes) * 100);
      this.options.onProgress?.(this.uploadedBytes, this.totalBytes, percentage);
    }
  }

  /**
   * Upload a single chunk
   */
  private async uploadChunk(chunk: Blob, offset: number, chunkEnd: number): Promise<void> {
    if (!this.uploadId) {
      throw new Error('Upload session not created');
    }

    const tokens = await getStoredTokens();
    const headers: Record<string, string> = {
      'Content-Type': 'application/offset+octet-stream',
      'Upload-Offset': offset.toString(),
      'Content-Length': (chunkEnd - offset).toString(),
    };

    if (tokens?.accessToken) {
      headers['Authorization'] = `Bearer ${tokens.accessToken}`;
    }

    // Use centralized API base URL logic
    const apiUrl = getApiBaseUrl();
    const endpoint = `${apiUrl}/api/v1/workspaces/${this.options.workspaceId}/uploads/${this.uploadId}/chunk`;

    const response = await fetch(endpoint, {
      method: 'PATCH',
      headers,
      body: chunk,
      signal: this.abortController?.signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `Upload failed: ${response.statusText}`);
    }

    // Verify Upload-Offset header (TUS protocol)
    const uploadOffset = response.headers.get('Upload-Offset');
    if (uploadOffset) {
      const verifiedOffset = parseInt(uploadOffset, 10);
      if (verifiedOffset !== chunkEnd) {
        throw new Error(`Upload offset mismatch: expected ${chunkEnd}, got ${verifiedOffset}`);
      }
    }
  }

  /**
   * Commit upload using streaming endpoint for chunked uploads
   */
  private async commitUpload(): Promise<string> {
    if (!this.uploadId) {
      throw new Error('Upload session not created');
    }

    const sha256 = await calculateSHA256(this.options.file);
    const tokens = await getStoredTokens();

    // Use the chunked commit endpoint for streaming encryption + multipart upload
    const apiUrl = import.meta.env.VITE_API_URL !== undefined
      ? import.meta.env.VITE_API_URL
      : 'http://localhost:8000';
    const endpoint = `${apiUrl}/api/v1/workspaces/${this.options.workspaceId}/uploads/${this.uploadId}/commit-chunked`;

    const formData = new FormData();
    formData.append('total_size', this.totalBytes.toString());
    formData.append('sha256', sha256);

    const headers: Record<string, string> = {};
    if (tokens?.accessToken) {
      headers['Authorization'] = `Bearer ${tokens.accessToken}`;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: formData,
      signal: this.abortController?.signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `Commit failed: ${response.statusText}`);
    }

    const result = await response.json();
    return result.asset_id;
  }
}

/**
 * Create TUS upload client
 */
export function createTusUpload(options: TusUploadOptions): TusUploadClient {
  return new TusUploadClient(options);
}

/**
 * Resume upload from saved state
 */
export async function resumeTusUpload(
  workspaceId: string,
  uploadId: string,
  file: File,
  options: Omit<TusUploadOptions, 'workspaceId' | 'uploadId' | 'file'>
): Promise<string> {
  const client = new TusUploadClient({
    ...options,
    workspaceId,
    uploadId,
    file,
  });
  return client.resume();
}

/**
 * Auto-resume uploads on connection restoration
 * Stores upload state in localStorage
 */
const UPLOAD_STATE_KEY_PREFIX = 'tus_upload_state_';

export function saveUploadState(uploadId: string, state: TusUploadState): void {
  try {
    localStorage.setItem(
      `${UPLOAD_STATE_KEY_PREFIX}${uploadId}`,
      JSON.stringify(state)
    );
  } catch (error) {
    console.warn('Failed to save upload state:', error);
  }
}

export function loadUploadState(uploadId: string): TusUploadState | null {
  try {
    const stored = localStorage.getItem(`${UPLOAD_STATE_KEY_PREFIX}${uploadId}`);
    if (!stored) return null;
    return JSON.parse(stored);
  } catch (error) {
    console.warn('Failed to load upload state:', error);
    return null;
  }
}

export function clearUploadState(uploadId: string): void {
  try {
    localStorage.removeItem(`${UPLOAD_STATE_KEY_PREFIX}${uploadId}`);
  } catch (error) {
    console.warn('Failed to clear upload state:', error);
  }
}

/**
 * Active upload clients registry for auto-resume functionality
 * We can only auto-resume uploads that are still in memory (i.e. page hasn't been refreshed)
 * because we need access to the original File object.
 */
const activeClients = new Map<string, TusUploadClient>();

/**
 * Register a client to be tracked for auto-resume
 */
export function registerUploadClient(client: TusUploadClient): void {
  const state = client.getState();
  if (state.uploadId) {
    activeClients.set(state.uploadId, client);
  }
}

/**
 * Unregister a client (e.g. when completed or cancelled)
 */
export function unregisterUploadClient(uploadId: string): void {
  activeClients.delete(uploadId);
}

/**
 * Auto-resume all paused uploads on page load or connection restore
 * Note: This only works for uploads currently in memory.
 * For page reloads, the UI must prompt the user to re-select files.
 */
export async function autoResumeUploads(): Promise<void> {
  try {
    console.log(`Checking ${activeClients.size} active uploads for auto-resume...`);

    for (const [uploadId, client] of activeClients.entries()) {
      const state = client.getState();

      // If paused and not complete, try to resume
      if (state.isPaused && !state.isComplete && !state.error) {
        console.log(`Auto-resuming upload ${uploadId}...`);
        try {
          await client.resume();
        } catch (err) {
          console.error(`Failed to auto-resume upload ${uploadId}:`, err);
        }
      }
    }
  } catch (error) {
    console.warn('Failed to auto-resume uploads:', error);
  }
}

// Auto-resume on connection restoration
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('Network connection restored, attempting to resume uploads...');
    autoResumeUploads();
  });
}


