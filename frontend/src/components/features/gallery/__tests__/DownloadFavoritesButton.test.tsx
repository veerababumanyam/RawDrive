/**
 * DownloadFavoritesButton Component Tests
 *
 * Unit tests for the favorites download button.
 *
 * Feature: 012-client-favorites (US4)
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DownloadFavoritesButton } from '../DownloadFavoritesButton';
import * as useDownloadFavoritesModule from '../../../../hooks/useDownloadFavorites';

// Mock the hook
vi.mock('../../../../hooks/useDownloadFavorites', () => ({
  useDownloadFavorites: vi.fn(),
}));

const mockUseDownloadFavorites = vi.mocked(
  useDownloadFavoritesModule.useDownloadFavorites
);

describe('DownloadFavoritesButton', () => {
  const defaultProps = {
    galleryId: 'gallery-123',
    listId: 'list-456',
  };

  const defaultHookReturn = {
    state: 'idle' as const,
    progress: 0,
    downloadUrl: null,
    fileSize: null,
    error: null,
    requestDownload: vi.fn(),
    reset: vi.fn(),
    isDownloading: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDownloadFavorites.mockReturnValue(defaultHookReturn);
  });

  describe('Idle State', () => {
    it('should render download button in idle state', () => {
      render(<DownloadFavoritesButton {...defaultProps} />);

      expect(screen.getByText('Download')).toBeInTheDocument();
    });

    it('should trigger download on click', () => {
      const requestDownload = vi.fn();
      mockUseDownloadFavorites.mockReturnValue({
        ...defaultHookReturn,
        requestDownload,
      });

      render(<DownloadFavoritesButton {...defaultProps} />);

      fireEvent.click(screen.getByRole('button'));

      expect(requestDownload).toHaveBeenCalledWith('web');
    });
  });

  describe('Resolution Picker', () => {
    it('should show resolution picker when allowOriginal is true', () => {
      render(<DownloadFavoritesButton {...defaultProps} allowOriginal />);

      fireEvent.click(screen.getByRole('button'));

      expect(screen.getByText('Web Quality')).toBeInTheDocument();
      expect(screen.getByText('Original Quality')).toBeInTheDocument();
    });

    it('should not show resolution picker when allowOriginal is false', () => {
      const requestDownload = vi.fn();
      mockUseDownloadFavorites.mockReturnValue({
        ...defaultHookReturn,
        requestDownload,
      });

      render(<DownloadFavoritesButton {...defaultProps} />);

      fireEvent.click(screen.getByRole('button'));

      expect(screen.queryByText('Web Quality')).not.toBeInTheDocument();
      expect(requestDownload).toHaveBeenCalledWith('web');
    });

    it('should request web resolution when web quality selected', async () => {
      const requestDownload = vi.fn();
      mockUseDownloadFavorites.mockReturnValue({
        ...defaultHookReturn,
        requestDownload,
      });

      render(<DownloadFavoritesButton {...defaultProps} allowOriginal />);

      fireEvent.click(screen.getByRole('button'));
      fireEvent.click(screen.getByText('Web Quality'));

      expect(requestDownload).toHaveBeenCalledWith('web');
    });

    it('should request original resolution when original quality selected', async () => {
      const requestDownload = vi.fn();
      mockUseDownloadFavorites.mockReturnValue({
        ...defaultHookReturn,
        requestDownload,
      });

      render(<DownloadFavoritesButton {...defaultProps} allowOriginal />);

      fireEvent.click(screen.getByRole('button'));
      fireEvent.click(screen.getByText('Original Quality'));

      expect(requestDownload).toHaveBeenCalledWith('original');
    });
  });

  describe('Processing State', () => {
    it('should show progress when processing', () => {
      mockUseDownloadFavorites.mockReturnValue({
        ...defaultHookReturn,
        state: 'processing',
        progress: 45,
        isDownloading: true,
      });

      render(<DownloadFavoritesButton {...defaultProps} />);

      expect(screen.getByText('Downloading 45%')).toBeInTheDocument();
    });

    it('should show preparing text when requesting', () => {
      mockUseDownloadFavorites.mockReturnValue({
        ...defaultHookReturn,
        state: 'requesting',
        isDownloading: true,
      });

      render(<DownloadFavoritesButton {...defaultProps} />);

      expect(screen.getByText('Preparing...')).toBeInTheDocument();
    });

    it('should be disabled when downloading', () => {
      mockUseDownloadFavorites.mockReturnValue({
        ...defaultHookReturn,
        state: 'processing',
        isDownloading: true,
      });

      render(<DownloadFavoritesButton {...defaultProps} />);

      expect(screen.getByRole('button')).toBeDisabled();
    });
  });

  describe('Completed State', () => {
    it('should show download ready text when completed', () => {
      mockUseDownloadFavorites.mockReturnValue({
        ...defaultHookReturn,
        state: 'completed',
        downloadUrl: 'https://example.com/download.zip',
        fileSize: 1048576, // 1 MB
      });

      render(<DownloadFavoritesButton {...defaultProps} />);

      expect(screen.getByText(/Download Ready/)).toBeInTheDocument();
      expect(screen.getByText(/1.0 MB/)).toBeInTheDocument();
    });

    it('should open download URL when clicked in completed state', () => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

      mockUseDownloadFavorites.mockReturnValue({
        ...defaultHookReturn,
        state: 'completed',
        downloadUrl: 'https://example.com/download.zip',
        fileSize: 512000,
      });

      render(<DownloadFavoritesButton {...defaultProps} />);

      fireEvent.click(screen.getByRole('button'));

      expect(openSpy).toHaveBeenCalledWith(
        'https://example.com/download.zip',
        '_blank'
      );

      openSpy.mockRestore();
    });
  });

  describe('Failed State', () => {
    it('should show retry button when failed', () => {
      mockUseDownloadFavorites.mockReturnValue({
        ...defaultHookReturn,
        state: 'failed',
        error: 'Download failed',
      });

      render(<DownloadFavoritesButton {...defaultProps} />);

      expect(screen.getByText('Failed - Retry')).toBeInTheDocument();
    });

    it('should reset on click when failed', () => {
      const reset = vi.fn();
      mockUseDownloadFavorites.mockReturnValue({
        ...defaultHookReturn,
        state: 'failed',
        error: 'Download failed',
        reset,
      });

      render(<DownloadFavoritesButton {...defaultProps} />);

      fireEvent.click(screen.getByRole('button'));

      expect(reset).toHaveBeenCalled();
    });
  });

  describe('Disabled State', () => {
    it('should be disabled when disabled prop is true', () => {
      render(<DownloadFavoritesButton {...defaultProps} disabled />);

      expect(screen.getByRole('button')).toBeDisabled();
    });
  });

  describe('File Size Formatting', () => {
    it('should format bytes correctly', () => {
      mockUseDownloadFavorites.mockReturnValue({
        ...defaultHookReturn,
        state: 'completed',
        downloadUrl: 'https://example.com/download.zip',
        fileSize: 500,
      });

      render(<DownloadFavoritesButton {...defaultProps} />);
      expect(screen.getByText(/500 B/)).toBeInTheDocument();
    });

    it('should format kilobytes correctly', () => {
      mockUseDownloadFavorites.mockReturnValue({
        ...defaultHookReturn,
        state: 'completed',
        downloadUrl: 'https://example.com/download.zip',
        fileSize: 2048,
      });

      render(<DownloadFavoritesButton {...defaultProps} />);
      expect(screen.getByText(/2.0 KB/)).toBeInTheDocument();
    });

    it('should format megabytes correctly', () => {
      mockUseDownloadFavorites.mockReturnValue({
        ...defaultHookReturn,
        state: 'completed',
        downloadUrl: 'https://example.com/download.zip',
        fileSize: 5 * 1024 * 1024,
      });

      render(<DownloadFavoritesButton {...defaultProps} />);
      expect(screen.getByText(/5.0 MB/)).toBeInTheDocument();
    });

    it('should format gigabytes correctly', () => {
      mockUseDownloadFavorites.mockReturnValue({
        ...defaultHookReturn,
        state: 'completed',
        downloadUrl: 'https://example.com/download.zip',
        fileSize: 1.5 * 1024 * 1024 * 1024,
      });

      render(<DownloadFavoritesButton {...defaultProps} />);
      expect(screen.getByText(/1.50 GB/)).toBeInTheDocument();
    });
  });
});
