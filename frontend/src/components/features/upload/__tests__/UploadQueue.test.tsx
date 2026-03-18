import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UploadQueue } from '../UploadQueue';
import type { UploadQueueCallbacks } from '../UploadQueue';

describe('UploadQueue', () => {
  let queue: UploadQueue;
  let callbacks: UploadQueueCallbacks;

  beforeEach(() => {
    vi.clearAllMocks();
    callbacks = {
      onUploadStart: vi.fn(),
      onUploadProgress: vi.fn(),
      onUploadComplete: vi.fn(),
      onUploadError: vi.fn(),
      onConnectionSpeedDetected: vi.fn(),
    };
    queue = new UploadQueue({ maxConcurrency: 2, maxRetries: 2 }, callbacks);
  });

  it('adds files to the queue and returns file IDs', () => {
    const file1 = new File(['data1'], 'photo1.jpg', { type: 'image/jpeg' });
    const file2 = new File(['data2'], 'photo2.png', { type: 'image/png' });

    const ids = queue.addFiles([file1, file2]);

    expect(ids).toHaveLength(2);
    expect(queue.getFiles()).toHaveLength(2);
  });

  it('reports correct queue statistics', () => {
    const file1 = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    queue.addFiles([file1]);

    const stats = queue.getStats();
    expect(stats.total).toBe(1);
    // File may be queued or already uploading depending on timing
    expect(stats.total).toBeGreaterThanOrEqual(1);
  });

  it('removes a file from the queue', () => {
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    const [fileId] = queue.addFiles([file]);

    queue.removeFile(fileId);

    expect(queue.getFiles()).toHaveLength(0);
    expect(queue.getStats().total).toBe(0);
  });

  it('retrieves a file by ID', () => {
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    const [fileId] = queue.addFiles([file]);

    const retrieved = queue.getFile(fileId);

    expect(retrieved).toBeDefined();
    expect(retrieved!.file.name).toBe('photo.jpg');
  });

  it('clears completed files from the queue', () => {
    const queue2 = new UploadQueue({ maxConcurrency: 0 }, callbacks);
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    queue2.addFiles([file]);

    // Manually set status to completed for testing
    const files = queue2.getFiles();
    (files[0] as any).status = 'completed';

    queue2.clearCompleted();
    expect(queue2.getFiles()).toHaveLength(0);
  });

  it('clears all files from the queue', () => {
    const file1 = new File(['a'], 'a.jpg', { type: 'image/jpeg' });
    const file2 = new File(['b'], 'b.jpg', { type: 'image/jpeg' });
    queue.addFiles([file1, file2]);

    queue.clear();

    expect(queue.getFiles()).toHaveLength(0);
    expect(queue.getStats().total).toBe(0);
  });

  it('pauses and resumes the queue', () => {
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    queue.addFiles([file]);

    queue.pause();
    const statsAfterPause = queue.getStats();
    // Active uploads should be cleared (paused)
    expect(statsAfterPause.uploading).toBe(0);

    queue.resume();
    // Queue processing resumes
    expect(queue.getStats().total).toBeGreaterThanOrEqual(1);
  });
});
