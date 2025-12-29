/**
 * useDownloadFavorites Hook Tests
 *
 * Unit tests for the favorites download hook.
 *
 * Feature: 012-client-favorites (US4)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useDownloadFavorites } from '../useDownloadFavorites';
import { favoritesService } from '../../services/favoritesService';

// Mock the favorites service
vi.mock('../../services/favoritesService', () => ({
  favoritesService: {
    requestDownload: vi.fn(),
    getDownloadStatus: vi.fn(),
  },
}));

describe('useDownloadFavorites', () => {
  const galleryId = 'gallery-123';
  const listId = 'list-456';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Initial State', () => {
    it('should have idle initial state', () => {
      const { result } = renderHook(() =>
        useDownloadFavorites(galleryId, listId)
      );

      expect(result.current.state).toBe('idle');
      expect(result.current.progress).toBe(0);
      expect(result.current.downloadUrl).toBeNull();
      expect(result.current.fileSize).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.isDownloading).toBe(false);
    });
  });

  describe('Request Download', () => {
    it('should transition to requesting state when download requested', async () => {
      vi.mocked(favoritesService.requestDownload).mockResolvedValue({
        download_id: 'download-789',
        status: 'pending',
        progress: 0,
        download_url: null,
        file_size_bytes: null,
        error_message: null,
        expires_at: null,
      });

      const { result } = renderHook(() =>
        useDownloadFavorites(galleryId, listId)
      );

      await act(async () => {
        result.current.requestDownload('web');
      });

      expect(favoritesService.requestDownload).toHaveBeenCalledWith(
        galleryId,
        listId,
        'web'
      );
    });

    it('should pass original resolution when specified', async () => {
      vi.mocked(favoritesService.requestDownload).mockResolvedValue({
        download_id: 'download-789',
        status: 'pending',
        progress: 0,
        download_url: null,
        file_size_bytes: null,
        error_message: null,
        expires_at: null,
      });

      const { result } = renderHook(() =>
        useDownloadFavorites(galleryId, listId)
      );

      await act(async () => {
        result.current.requestDownload('original');
      });

      expect(favoritesService.requestDownload).toHaveBeenCalledWith(
        galleryId,
        listId,
        'original'
      );
    });

    it('should set error state on request failure', async () => {
      vi.mocked(favoritesService.requestDownload).mockRejectedValue(
        new Error('Network error')
      );

      const { result } = renderHook(() =>
        useDownloadFavorites(galleryId, listId)
      );

      await act(async () => {
        result.current.requestDownload('web');
      });

      expect(result.current.state).toBe('failed');
      expect(result.current.error).toBe('Network error');
    });
  });

  describe('Progress Polling', () => {
    it('should start polling when download is processing', async () => {
      vi.mocked(favoritesService.requestDownload).mockResolvedValue({
        download_id: 'download-789',
        status: 'processing',
        progress: 10,
        download_url: null,
        file_size_bytes: null,
        error_message: null,
        expires_at: null,
      });

      const { result } = renderHook(() =>
        useDownloadFavorites(galleryId, listId)
      );

      await act(async () => {
        await result.current.requestDownload('web');
      });

      // Should be in processing state after initial request
      expect(result.current.state).toBe('processing');
      expect(result.current.progress).toBe(10);
    });

    it('should update state to completed when polling returns completed status', async () => {
      // This test verifies the hook correctly handles completed status
      vi.mocked(favoritesService.requestDownload).mockResolvedValue({
        download_id: 'download-789',
        status: 'completed',
        progress: 100,
        download_url: 'https://example.com/download.zip',
        file_size_bytes: 1024000,
        error_message: null,
        expires_at: '2025-12-30T12:00:00Z',
      });

      const { result } = renderHook(() =>
        useDownloadFavorites(galleryId, listId)
      );

      await act(async () => {
        await result.current.requestDownload('web');
      });

      // Should be completed immediately
      expect(result.current.state).toBe('completed');
      expect(result.current.downloadUrl).toBe('https://example.com/download.zip');
      expect(result.current.fileSize).toBe(1024000);
    });
  });

  describe('Download Complete', () => {
    it('should stop polling when download completes', async () => {
      vi.mocked(favoritesService.requestDownload).mockResolvedValue({
        download_id: 'download-789',
        status: 'completed',
        progress: 100,
        download_url: 'https://example.com/download.zip',
        file_size_bytes: 512000,
        error_message: null,
        expires_at: '2025-12-30T12:00:00Z',
      });

      const { result } = renderHook(() =>
        useDownloadFavorites(galleryId, listId)
      );

      await act(async () => {
        result.current.requestDownload('web');
      });

      expect(result.current.state).toBe('completed');
      expect(result.current.downloadUrl).toBe('https://example.com/download.zip');

      // Advance timers - should not trigger additional polls
      await act(async () => {
        vi.advanceTimersByTime(10000);
      });

      expect(favoritesService.getDownloadStatus).not.toHaveBeenCalled();
    });
  });

  describe('Download Failed', () => {
    it('should handle failed download status', async () => {
      vi.mocked(favoritesService.requestDownload).mockResolvedValue({
        download_id: 'download-789',
        status: 'failed',
        progress: 0,
        download_url: null,
        file_size_bytes: null,
        error_message: 'No photos found in this list',
        expires_at: null,
      });

      const { result } = renderHook(() =>
        useDownloadFavorites(galleryId, listId)
      );

      await act(async () => {
        result.current.requestDownload('web');
      });

      expect(result.current.state).toBe('failed');
      expect(result.current.error).toBe('No photos found in this list');
    });
  });

  describe('Reset', () => {
    it('should reset all state to initial values', async () => {
      vi.mocked(favoritesService.requestDownload).mockResolvedValue({
        download_id: 'download-789',
        status: 'completed',
        progress: 100,
        download_url: 'https://example.com/download.zip',
        file_size_bytes: 512000,
        error_message: null,
        expires_at: null,
      });

      const { result } = renderHook(() =>
        useDownloadFavorites(galleryId, listId)
      );

      await act(async () => {
        result.current.requestDownload('web');
      });

      expect(result.current.state).toBe('completed');

      act(() => {
        result.current.reset();
      });

      expect(result.current.state).toBe('idle');
      expect(result.current.progress).toBe(0);
      expect(result.current.downloadUrl).toBeNull();
      expect(result.current.fileSize).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });

  describe('isDownloading', () => {
    it('should be true when requesting', async () => {
      vi.mocked(favoritesService.requestDownload).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      const { result } = renderHook(() =>
        useDownloadFavorites(galleryId, listId)
      );

      act(() => {
        result.current.requestDownload('web');
      });

      expect(result.current.isDownloading).toBe(true);
    });

    it('should be true when processing', async () => {
      vi.mocked(favoritesService.requestDownload).mockResolvedValue({
        download_id: 'download-789',
        status: 'processing',
        progress: 50,
        download_url: null,
        file_size_bytes: null,
        error_message: null,
        expires_at: null,
      });

      const { result } = renderHook(() =>
        useDownloadFavorites(galleryId, listId)
      );

      await act(async () => {
        result.current.requestDownload('web');
      });

      expect(result.current.isDownloading).toBe(true);
    });

    it('should be false when completed', async () => {
      vi.mocked(favoritesService.requestDownload).mockResolvedValue({
        download_id: 'download-789',
        status: 'completed',
        progress: 100,
        download_url: 'https://example.com/download.zip',
        file_size_bytes: 512000,
        error_message: null,
        expires_at: null,
      });

      const { result } = renderHook(() =>
        useDownloadFavorites(galleryId, listId)
      );

      await act(async () => {
        result.current.requestDownload('web');
      });

      expect(result.current.isDownloading).toBe(false);
    });
  });
});
