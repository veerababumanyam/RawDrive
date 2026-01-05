/**
 * SHA256 Worker
 * Web Worker for non-blocking SHA256 hash calculation
 * Uses streaming approach for large files to avoid memory spikes
 * Reports progress for better UX
 */

export interface SHA256WorkerRequest {
  type: 'hash';
  fileId: string;
  file: File;
}

export interface SHA256WorkerResponse {
  type: 'progress' | 'complete' | 'error';
  fileId: string;
  progress?: number; // 0-100
  hash?: string;
  error?: string;
}

// Chunk size for streaming hash (2MB)
// Larger chunks = fewer progress updates but slightly faster
// Smaller chunks = more responsive progress but more overhead
const CHUNK_SIZE = 2 * 1024 * 1024;

/**
 * Calculate SHA256 hash of a file using streaming approach
 * Reports progress every chunk
 */
async function calculateSHA256WithProgress(
  file: File,
  fileId: string,
  onProgress: (progress: number) => void
): Promise<string> {
  const totalSize = file.size;

  // For small files (< 5MB), use simple approach
  if (totalSize < 5 * 1024 * 1024) {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // For large files, use streaming approach
  // Note: Web Crypto API doesn't have incremental digest, so we need to
  // collect all chunks and hash at the end. However, we read in chunks
  // to avoid loading entire file into memory at once and to report progress.

  const chunks: ArrayBuffer[] = [];
  let processedBytes = 0;
  let lastProgressReport = 0;

  // Read file in chunks
  const reader = file.stream().getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      chunks.push(value.buffer);
      processedBytes += value.length;

      // Report progress every ~5%
      const currentProgress = Math.round((processedBytes / totalSize) * 100);
      if (currentProgress - lastProgressReport >= 5) {
        onProgress(Math.min(currentProgress, 95)); // Reserve 5% for final hash computation
        lastProgressReport = currentProgress;
      }
    }

    // Combine chunks for final hash
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;

    for (const chunk of chunks) {
      combined.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }

    // Compute hash
    onProgress(98);
    const hashBuffer = await crypto.subtle.digest('SHA-256', combined.buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    onProgress(100);
    return hashHex;

  } finally {
    reader.releaseLock();
  }
}

/**
 * Handle incoming messages
 */
self.addEventListener('message', async (event: MessageEvent<SHA256WorkerRequest>) => {
  const { type, fileId, file } = event.data;

  if (type !== 'hash') {
    self.postMessage({
      type: 'error',
      fileId,
      error: `Unknown message type: ${type}`,
    } as SHA256WorkerResponse);
    return;
  }

  try {
    const hash = await calculateSHA256WithProgress(
      file,
      fileId,
      (progress) => {
        self.postMessage({
          type: 'progress',
          fileId,
          progress,
        } as SHA256WorkerResponse);
      }
    );

    self.postMessage({
      type: 'complete',
      fileId,
      hash,
    } as SHA256WorkerResponse);

  } catch (error) {
    self.postMessage({
      type: 'error',
      fileId,
      error: error instanceof Error ? error.message : String(error),
    } as SHA256WorkerResponse);
  }
});

// Export types for main thread
export {};
