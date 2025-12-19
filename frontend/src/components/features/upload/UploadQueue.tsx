/**
 * UploadQueue Component
 * Manages upload queue with adaptive concurrency based on connection speed
 * Handles retry with exponential backoff
 * Displays error messages with retry option
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UploadFile {
  id: string;
  file: File;
  status: 'queued' | 'uploading' | 'paused' | 'completed' | 'error';
  progress: number; // 0-100
  uploadedBytes: number;
  error?: string;
  retryCount: number;
  startTime?: number;
  lastChunkTime?: number;
  speed?: number; // bytes per second
}

export interface UploadQueueOptions {
  /** Maximum concurrent uploads for standard connections */
  maxConcurrency?: number;
  /** Connection speed threshold for slow connections (bytes per second) */
  slowConnectionThreshold?: number;
  /** Standard chunk size (bytes) */
  standardChunkSize?: number;
  /** Chunk size for slow connections (bytes) */
  slowChunkSize?: number;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Initial retry delay (ms) */
  initialRetryDelay?: number;
  /** Maximum retry delay (ms) */
  maxRetryDelay?: number;
}

export interface UploadQueueCallbacks {
  /** Called when upload starts */
  onUploadStart?: (fileId: string) => void;
  /** Called when upload progress updates */
  onUploadProgress?: (fileId: string, progress: number, uploadedBytes: number, speed?: number) => void;
  /** Called when upload completes */
  onUploadComplete?: (fileId: string) => void;
  /** Called when upload fails */
  onUploadError?: (fileId: string, error: Error) => void;
  /** Called when connection speed is detected */
  onConnectionSpeedDetected?: (speedBytesPerSecond: number) => void;
}

const DEFAULT_OPTIONS: Required<UploadQueueOptions> = {
  maxConcurrency: 3,
  slowConnectionThreshold: 1024 * 1024, // 1 Mbps = 1MB/s = 1,048,576 bytes/s
  standardChunkSize: 5 * 1024 * 1024, // 5MB
  slowChunkSize: 256 * 1024, // 256KB
  maxRetries: 3,
  initialRetryDelay: 1000, // 1 second
  maxRetryDelay: 30000, // 30 seconds
};

export class UploadQueue {
  private files: Map<string, UploadFile> = new Map();
  private activeUploads: Set<string> = new Set();
  private options: Required<UploadQueueOptions>;
  private callbacks: UploadQueueCallbacks;
  private connectionSpeed: number = 0; // bytes per second
  private isPaused: boolean = false;

  constructor(
    options: UploadQueueOptions = {},
    callbacks: UploadQueueCallbacks = {}
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.callbacks = callbacks;
  }

  /**
   * Add files to the queue
   */
  addFiles(files: File[]): string[] {
    const fileIds: string[] = [];
    files.forEach((file) => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      this.files.set(id, {
        id,
        file,
        status: 'queued',
        progress: 0,
        uploadedBytes: 0,
        retryCount: 0,
      });
      fileIds.push(id);
    });
    this.processQueue();
    return fileIds;
  }

  /**
   * Remove file from queue
   */
  removeFile(fileId: string): void {
    this.files.delete(fileId);
    this.activeUploads.delete(fileId);
    this.processQueue();
  }

  /**
   * Pause all uploads
   */
  pause(): void {
    this.isPaused = true;
    // Update status of active uploads
    this.activeUploads.forEach((fileId) => {
      const file = this.files.get(fileId);
      if (file && file.status === 'uploading') {
        file.status = 'paused';
      }
    });
    this.activeUploads.clear();
  }

  /**
   * Resume all uploads
   */
  resume(): void {
    this.isPaused = false;
    this.processQueue();
  }

  /**
   * Retry failed upload
   */
  retry(fileId: string): void {
    const file = this.files.get(fileId);
    if (!file) return;

    if (file.retryCount >= this.options.maxRetries) {
      file.error = 'Maximum retry attempts reached';
      return;
    }

    file.status = 'queued';
    file.error = undefined;
    file.progress = 0;
    file.uploadedBytes = 0;
    file.retryCount += 1;
    this.processQueue();
  }

  /**
   * Get current connection speed
   */
  getConnectionSpeed(): number {
    return this.connectionSpeed;
  }

  /**
   * Get effective concurrency limit based on connection speed
   */
  private getEffectiveConcurrency(): number {
    if (this.connectionSpeed === 0) {
      return this.options.maxConcurrency; // Default until speed is detected
    }
    if (this.connectionSpeed < this.options.slowConnectionThreshold) {
      return 1; // Slow connection - reduce to 1 concurrent
    }
    return this.options.maxConcurrency; // Standard connection
  }

  /**
   * Get effective chunk size based on connection speed
   */
  private getEffectiveChunkSize(): number {
    if (this.connectionSpeed === 0) {
      return this.options.standardChunkSize; // Default until speed is detected
    }
    if (this.connectionSpeed < this.options.slowConnectionThreshold) {
      return this.options.slowChunkSize; // Slow connection - smaller chunks
    }
    return this.options.standardChunkSize; // Standard connection
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private getRetryDelay(retryCount: number): number {
    const delay = Math.min(
      this.options.initialRetryDelay * Math.pow(2, retryCount),
      this.options.maxRetryDelay
    );
    return delay;
  }

  /**
   * Update connection speed based on recent uploads
   */
  private updateConnectionSpeed(_fileId: string, speed: number): void {
    // Simple moving average (could be improved with more sophisticated algorithm)
    if (this.connectionSpeed === 0) {
      this.connectionSpeed = speed;
    } else {
      // Weighted average: 70% old, 30% new
      this.connectionSpeed = this.connectionSpeed * 0.7 + speed * 0.3;
    }
    this.callbacks.onConnectionSpeedDetected?.(this.connectionSpeed);
  }

  /**
   * Process upload queue
   */
  private processQueue(): void {
    if (this.isPaused) return;

    const effectiveConcurrency = this.getEffectiveConcurrency();
    const queuedFiles = Array.from(this.files.values()).filter(
      (f) => f.status === 'queued'
    );

    // Start new uploads up to concurrency limit
    while (
      this.activeUploads.size < effectiveConcurrency &&
      queuedFiles.length > 0
    ) {
      const file = queuedFiles.shift();
      if (file) {
        this.startUpload(file.id);
      }
    }
  }

  /**
   * Start uploading a file
   */
  private async startUpload(fileId: string): Promise<void> {
    const file = this.files.get(fileId);
    if (!file || file.status !== 'queued') return;

    this.activeUploads.add(fileId);
    file.status = 'uploading';
    file.startTime = Date.now();
    file.lastChunkTime = Date.now();

    this.callbacks.onUploadStart?.(fileId);

    try {
      // Simulate upload with chunked transfer
      await this.uploadFile(file);
      file.status = 'completed';
      file.progress = 100;
      this.callbacks.onUploadComplete?.(fileId);
    } catch (error) {
      file.status = 'error';
      file.error = error instanceof Error ? error.message : 'Upload failed';
      this.callbacks.onUploadError?.(fileId, error instanceof Error ? error : new Error(String(error)));

      // Auto-retry with exponential backoff
      if (file.retryCount < this.options.maxRetries) {
        const delay = this.getRetryDelay(file.retryCount);
        setTimeout(() => {
          this.retry(fileId);
        }, delay);
      }
    } finally {
      this.activeUploads.delete(fileId);
      this.processQueue(); // Process next file in queue
    }
  }

  /**
   * Upload file with chunked transfer (placeholder - should integrate with actual upload service)
   */
  private async uploadFile(file: UploadFile): Promise<void> {
    const chunkSize = this.getEffectiveChunkSize();
    const totalSize = file.file.size;
    let uploadedBytes = 0;

    // Simulate chunked upload
    while (uploadedBytes < totalSize) {
      if (this.isPaused) {
        throw new Error('Upload paused');
      }

      const chunkEnd = Math.min(uploadedBytes + chunkSize, totalSize);
      const chunk = file.file.slice(uploadedBytes, chunkEnd);

      // Simulate upload delay (replace with actual upload logic)
      await new Promise((resolve) => setTimeout(resolve, 100));

      uploadedBytes = chunkEnd;
      file.uploadedBytes = uploadedBytes;
      file.progress = Math.round((uploadedBytes / totalSize) * 100);

      // Calculate speed
      const now = Date.now();
      if (file.lastChunkTime) {
        const timeDelta = (now - file.lastChunkTime) / 1000; // seconds
        const bytesDelta = uploadedBytes - (file.uploadedBytes - chunk.size);
        if (timeDelta > 0) {
          const speed = bytesDelta / timeDelta;
          file.speed = speed;
          this.updateConnectionSpeed(file.id, speed);
        }
      }
      file.lastChunkTime = now;

      this.callbacks.onUploadProgress?.(file.id, file.progress, uploadedBytes, file.speed);
    }
  }

  /**
   * Get all files
   */
  getFiles(): UploadFile[] {
    return Array.from(this.files.values());
  }

  /**
   * Get file by ID
   */
  getFile(fileId: string): UploadFile | undefined {
    return this.files.get(fileId);
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    total: number;
    queued: number;
    uploading: number;
    completed: number;
    error: number;
    paused: number;
  } {
    const files = Array.from(this.files.values());
    return {
      total: files.length,
      queued: files.filter((f) => f.status === 'queued').length,
      uploading: files.filter((f) => f.status === 'uploading').length,
      completed: files.filter((f) => f.status === 'completed').length,
      error: files.filter((f) => f.status === 'error').length,
      paused: files.filter((f) => f.status === 'paused').length,
    };
  }

  /**
   * Clear completed files
   */
  clearCompleted(): void {
    const completedIds = Array.from(this.files.values())
      .filter((f) => f.status === 'completed')
      .map((f) => f.id);
    completedIds.forEach((id) => this.files.delete(id));
  }

  /**
   * Clear all files
   */
  clear(): void {
    this.files.clear();
    this.activeUploads.clear();
  }
}

/**
 * React hook for UploadQueue
 */
export function useUploadQueue(
  options: UploadQueueOptions = {},
  callbacks: UploadQueueCallbacks = {}
) {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    queued: 0,
    uploading: 0,
    completed: 0,
    error: 0,
    paused: 0,
  });
  const [connectionSpeed, setConnectionSpeed] = useState<number>(0);
  const queueRef = useRef<UploadQueue | null>(null);

  // Initialize queue
  useEffect(() => {
    queueRef.current = new UploadQueue(options, {
      ...callbacks,
      onUploadProgress: (fileId, progress, uploadedBytes, speed) => {
        setFiles((prev) => {
          const updated = prev.map((f) =>
            f.id === fileId
              ? { ...f, progress, uploadedBytes, speed }
              : f
          );
          return updated;
        });
        callbacks.onUploadProgress?.(fileId, progress, uploadedBytes, speed);
      },
      onUploadComplete: (fileId) => {
        setFiles((prev) => {
          const updated = prev.map((f) =>
            f.id === fileId ? { ...f, status: 'completed' as const, progress: 100 } : f
          );
          return updated;
        });
        callbacks.onUploadComplete?.(fileId);
      },
      onUploadError: (fileId, error) => {
        setFiles((prev) => {
          const updated = prev.map((f) =>
            f.id === fileId ? { ...f, status: 'error' as const, error: error.message } : f
          );
          return updated;
        });
        callbacks.onUploadError?.(fileId, error);
      },
      onConnectionSpeedDetected: (speed) => {
        setConnectionSpeed(speed);
        callbacks.onConnectionSpeedDetected?.(speed);
      },
    });

    return () => {
      queueRef.current?.clear();
    };
  }, []);

  // Update stats when files change
  useEffect(() => {
    if (queueRef.current) {
      setStats(queueRef.current.getStats());
    }
  }, [files]);

  const addFiles = useCallback((files: File[]) => {
    if (!queueRef.current) return [];
    const fileIds = queueRef.current.addFiles(files);
    setFiles(queueRef.current.getFiles());
    return fileIds;
  }, []);

  const removeFile = useCallback((fileId: string) => {
    queueRef.current?.removeFile(fileId);
    setFiles(queueRef.current?.getFiles() || []);
  }, []);

  const pause = useCallback(() => {
    queueRef.current?.pause();
    setFiles(queueRef.current?.getFiles() || []);
  }, []);

  const resume = useCallback(() => {
    queueRef.current?.resume();
    setFiles(queueRef.current?.getFiles() || []);
  }, []);

  const retry = useCallback((fileId: string) => {
    queueRef.current?.retry(fileId);
    setFiles(queueRef.current?.getFiles() || []);
  }, []);

  const clearCompleted = useCallback(() => {
    queueRef.current?.clearCompleted();
    setFiles(queueRef.current?.getFiles() || []);
  }, []);

  return {
    files,
    stats,
    connectionSpeed,
    addFiles,
    removeFile,
    pause,
    resume,
    retry,
    clearCompleted,
    isPaused: false, // Queue paused state is managed internally
  };
}

