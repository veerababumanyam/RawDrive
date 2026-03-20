import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { DownloadTrackingPanel } from './DownloadTrackingPanel';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const mockDownloadLog = {
  downloads: [
    {
      id: 'dl-1',
      asset_id: 'asset-001',
      visitor_token: 'visitor-abc12345xyz',
      size: 'web',
      file_size_bytes: 2048000,
      created_at: '2026-03-20T08:00:00Z',
    },
    {
      id: 'dl-2',
      asset_id: 'asset-002',
      visitor_token: 'visitor-def67890uvw',
      size: 'original',
      file_size_bytes: 15360000,
      created_at: '2026-03-19T14:30:00Z',
    },
  ],
  total_count: 2,
  total_bytes: 17408000,
};

describe('DownloadTrackingPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders table with visitor, photo, size, date columns', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockDownloadLog,
    });

    render(
      <DownloadTrackingPanel galleryId="gallery-1" workspaceId="ws-1" />,
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      // Both visitor tokens render as masked (first 8 chars + ...)
      const visitorCells = screen.getAllByText(/visitor-\.\.\./);
      expect(visitorCells.length).toBe(2);
    });

    // Should show size badges
    expect(screen.getByText('web')).toBeTruthy();
    expect(screen.getByText('original')).toBeTruthy();
  });

  it('shows total download count and total bandwidth', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockDownloadLog,
    });

    render(
      <DownloadTrackingPanel galleryId="gallery-1" workspaceId="ws-1" />,
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(screen.getByText(/2 downloads/i)).toBeTruthy();
    });

    // Total bytes: 17408000 = ~16.6 MB
    expect(screen.getByText(/16\.6 MB/i)).toBeTruthy();
  });

  it('paginates with next/prev buttons', async () => {
    // First page
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...mockDownloadLog,
        total_count: 50,
      }),
    });

    render(
      <DownloadTrackingPanel galleryId="gallery-1" workspaceId="ws-1" />,
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(screen.getByText(/Page 1/i)).toBeTruthy();
    });

    // Next button should be present
    const nextBtn = screen.getByRole('button', { name: /next/i });
    expect(nextBtn).toBeTruthy();
  });

  it('shows empty state when no downloads', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        downloads: [],
        total_count: 0,
        total_bytes: 0,
      }),
    });

    render(
      <DownloadTrackingPanel galleryId="gallery-1" workspaceId="ws-1" />,
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(screen.getByText(/No downloads yet/i)).toBeTruthy();
    });
  });
});
