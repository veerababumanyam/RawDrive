import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGalleryDownload } from './useGalleryDownload';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock EventSource
class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readyState = 0;
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    this.readyState = 1; // OPEN
    MockEventSource.instances.push(this);
  }

  simulateMessage(data: Record<string, unknown>) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }));
    }
  }

  simulateError() {
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }
}

// Replace global EventSource
(global as any).EventSource = MockEventSource;

// Mock window.open
const mockWindowOpen = vi.fn();
Object.defineProperty(window, 'open', { value: mockWindowOpen, writable: true });

describe('useGalleryDownload', () => {
  const galleryToken = 'test-token-abc';
  const galleryServiceUrl = 'http://localhost:8004';

  beforeEach(() => {
    vi.clearAllMocks();
    MockEventSource.instances = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with idle state', () => {
    const { result } = renderHook(() =>
      useGalleryDownload(galleryToken, galleryServiceUrl),
    );

    expect(result.current.progress).toBe(0);
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
  });

  it('downloadSingle calls POST /downloads/single and triggers browser download', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ download_url: 'https://cdn.example.com/photo.jpg' }),
    });

    const { result } = renderHook(() =>
      useGalleryDownload(galleryToken, galleryServiceUrl),
    );

    await act(async () => {
      await result.current.downloadSingle('asset-123', 'web', 'jpeg');
    });

    expect(mockFetch).toHaveBeenCalledWith(
      `${galleryServiceUrl}/api/v1/public/galleries/${galleryToken}/downloads/single`,
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset_id: 'asset-123', size: 'web', format: 'jpeg' }),
      }),
    );
  });

  it('downloadBatch calls POST /downloads/batch and opens SSE stream', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ job_id: 'job-456' }),
    });

    const { result } = renderHook(() =>
      useGalleryDownload(galleryToken, galleryServiceUrl),
    );

    await act(async () => {
      await result.current.downloadBatch({ size: 'web' });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      `${galleryServiceUrl}/api/v1/public/galleries/${galleryToken}/downloads/batch`,
      expect.objectContaining({
        method: 'POST',
      }),
    );

    // Should have created an EventSource for SSE
    expect(MockEventSource.instances.length).toBe(1);
    expect(MockEventSource.instances[0].url).toBe(
      `${galleryServiceUrl}/api/v1/public/galleries/${galleryToken}/downloads/job/job-456/stream`,
    );
    expect(result.current.status).toBe('preparing');
  });

  it('progress updates from 0 to 100 as SSE events arrive', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ job_id: 'job-789' }),
    });

    const { result } = renderHook(() =>
      useGalleryDownload(galleryToken, galleryServiceUrl),
    );

    await act(async () => {
      await result.current.downloadBatch({ size: 'print' });
    });

    const sse = MockEventSource.instances[0];

    await act(async () => {
      sse.simulateMessage({ status: 'processing', progress: 25 });
    });
    expect(result.current.progress).toBe(25);
    expect(result.current.status).toBe('downloading');

    await act(async () => {
      sse.simulateMessage({ status: 'processing', progress: 75 });
    });
    expect(result.current.progress).toBe(75);
  });

  it('downloadBatch auto-triggers browser download when status=complete', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ job_id: 'job-complete' }),
    });

    const { result } = renderHook(() =>
      useGalleryDownload(galleryToken, galleryServiceUrl),
    );

    await act(async () => {
      await result.current.downloadBatch({ size: 'original' });
    });

    const sse = MockEventSource.instances[0];

    await act(async () => {
      sse.simulateMessage({
        status: 'complete',
        progress: 100,
        download_url: 'https://cdn.example.com/batch.zip',
      });
    });

    expect(result.current.status).toBe('complete');
    expect(result.current.progress).toBe(100);
    // Should have triggered download
    expect(mockWindowOpen).toHaveBeenCalledWith(
      'https://cdn.example.com/batch.zip',
      '_blank',
    );
  });

  it('cancelDownload closes EventSource and resets state', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ job_id: 'job-cancel' }),
    });

    const { result } = renderHook(() =>
      useGalleryDownload(galleryToken, galleryServiceUrl),
    );

    await act(async () => {
      await result.current.downloadBatch({ size: 'web' });
    });

    const sse = MockEventSource.instances[0];

    await act(async () => {
      result.current.cancelDownload();
    });

    expect(sse.close).toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
    expect(result.current.progress).toBe(0);
  });
});
