/**
 * SHA256 Utility
 * Client-side SHA256 hash calculation using Web Crypto API
 * Uses Web Workers for non-blocking hash calculation on large files
 * Used for duplicate detection before upload
 */

import type { SHA256WorkerRequest, SHA256WorkerResponse } from '../workers/sha256Worker';

// Worker pool for parallel hash calculations
let workerPool: Worker[] = [];
let workerIndex = 0;
const pendingRequests = new Map<string, {
  resolve: (hash: string) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: number) => void;
}>();

// Use Web Worker for files larger than this threshold (5MB)
// Smaller files are fast enough on main thread
const WORKER_THRESHOLD = 5 * 1024 * 1024;

// Lazy initialize worker pool
function getWorkerPool(): Worker[] {
  if (workerPool.length === 0 && typeof Worker !== 'undefined') {
    // Create workers based on available cores (max 4 to avoid overhead)
    const workerCount = Math.min(navigator.hardwareConcurrency || 2, 4);

    for (let i = 0; i < workerCount; i++) {
      try {
        const worker = new Worker(
          new URL('../workers/sha256Worker.ts', import.meta.url),
          { type: 'module' }
        );

        worker.addEventListener('message', (event: MessageEvent<SHA256WorkerResponse>) => {
          const { type, fileId, hash, progress, error } = event.data;
          const pending = pendingRequests.get(fileId);

          if (!pending) return;

          switch (type) {
            case 'progress':
              pending.onProgress?.(progress || 0);
              break;
            case 'complete':
              pendingRequests.delete(fileId);
              pending.resolve(hash!);
              break;
            case 'error':
              pendingRequests.delete(fileId);
              pending.reject(new Error(error || 'Unknown error'));
              break;
          }
        });

        worker.addEventListener('error', (event) => {
          console.error('SHA256 worker error:', event);
        });

        workerPool.push(worker);
      } catch (error) {
        console.warn('Failed to create SHA256 worker:', error);
      }
    }
  }
  return workerPool;
}

/**
 * Calculate SHA256 hash on main thread (for small files or fallback)
 */
async function calculateSHA256MainThread(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Calculate SHA256 hash using Web Worker (for large files)
 */
function calculateSHA256Worker(
  file: File,
  onProgress?: (progress: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const pool = getWorkerPool();

    if (pool.length === 0) {
      // Fallback to main thread if workers not available
      calculateSHA256MainThread(file).then(resolve).catch(reject);
      return;
    }

    // Round-robin worker selection
    const worker = pool[workerIndex % pool.length];
    workerIndex++;

    const fileId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    pendingRequests.set(fileId, { resolve, reject, onProgress });

    const request: SHA256WorkerRequest = {
      type: 'hash',
      fileId,
      file,
    };

    worker.postMessage(request);
  });
}

/**
 * Calculate SHA256 hash of a file
 * Automatically uses Web Worker for large files to keep UI responsive
 * @param file File to hash
 * @param onProgress Optional progress callback (0-100)
 * @returns Promise resolving to hex-encoded SHA256 hash (64 characters)
 */
export async function calculateSHA256(
  file: File,
  onProgress?: (progress: number) => void
): Promise<string> {
  try {
    // Use worker for large files to avoid blocking UI
    if (file.size > WORKER_THRESHOLD) {
      return await calculateSHA256Worker(file, onProgress);
    }

    // Small files are fast enough on main thread
    onProgress?.(50);
    const hash = await calculateSHA256MainThread(file);
    onProgress?.(100);
    return hash;
  } catch (error) {
    throw new Error(
      `Failed to calculate SHA256 hash: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Cleanup workers when no longer needed
 */
export function terminateSHA256Workers(): void {
  workerPool.forEach((worker) => worker.terminate());
  workerPool = [];
  pendingRequests.clear();
}

/**
 * Calculate SHA256 hash for multiple files in parallel
 * @param files Array of files to hash
 * @returns Promise resolving to Map of File -> SHA256 hash
 */
export async function calculateSHA256Batch(
  files: File[]
): Promise<Map<File, string>> {
  const results = new Map<File, string>();

  // Calculate hashes in parallel
  const promises = files.map(async (file) => {
    try {
      const hash = await calculateSHA256(file);
      return { file, hash };
    } catch (error) {
      // Log error but continue with other files
      console.error(`Failed to hash file ${file.name}:`, error);
      return { file, hash: null };
    }
  });

  const resolved = await Promise.all(promises);

  // Build map (skip files that failed to hash)
  for (const { file, hash } of resolved) {
    if (hash) {
      results.set(file, hash);
    }
  }

  return results;
}

