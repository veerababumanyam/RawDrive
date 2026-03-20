import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { BatchDownloadModal } from './BatchDownloadModal';

describe('BatchDownloadModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    downloadPolicy: 'original_allowed' as const,
    totalPhotos: 100,
    favoritesCount: 10,
    selectionsCount: 5,
    onDownload: vi.fn(),
    progress: 0,
    status: 'idle' as const,
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows only Web size when download_policy is web_only', () => {
    render(<BatchDownloadModal {...defaultProps} downloadPolicy="web_only" />);

    const webOption = screen.getByText('Web Quality');
    expect(webOption).toBeTruthy();

    // Print and Original should be disabled/unavailable
    const printOption = screen.getByText('Print Quality');
    const originalOption = screen.getByText('Original');
    // They should exist but be disabled
    expect(printOption.closest('button')?.getAttribute('disabled')).not.toBeNull();
    expect(originalOption.closest('button')?.getAttribute('disabled')).not.toBeNull();
  });

  it('shows all size options when download_policy is original_allowed', () => {
    render(<BatchDownloadModal {...defaultProps} downloadPolicy="original_allowed" />);

    expect(screen.getByText('Web Quality')).toBeTruthy();
    expect(screen.getByText('Print Quality')).toBeTruthy();
    expect(screen.getByText('Original')).toBeTruthy();

    // None should be disabled
    const buttons = screen.getAllByRole('radio');
    buttons.forEach((btn) => {
      expect(btn).not.toBeDisabled();
    });
  });

  it('shows "Download All", "Download Favorites", "Download Selections" options', () => {
    render(<BatchDownloadModal {...defaultProps} />);

    expect(screen.getByText(/All Photos/)).toBeTruthy();
    expect(screen.getByText(/Favorites/)).toBeTruthy();
    expect(screen.getByText(/Selections/)).toBeTruthy();
  });

  it('disables scope options with 0 count', () => {
    render(
      <BatchDownloadModal
        {...defaultProps}
        favoritesCount={0}
        selectionsCount={0}
      />,
    );

    const favoritesOption = screen.getByText(/Favorites/).closest('button');
    const selectionsOption = screen.getByText(/Selections/).closest('button');
    expect(favoritesOption?.getAttribute('disabled')).not.toBeNull();
    expect(selectionsOption?.getAttribute('disabled')).not.toBeNull();
  });

  it('shows Watermarked badge when download_policy is watermarked_only', () => {
    render(<BatchDownloadModal {...defaultProps} downloadPolicy="watermarked_only" />);

    expect(screen.getByText('Watermarked')).toBeTruthy();
  });

  it('triggers onDownload with selected options when Download is clicked', () => {
    render(<BatchDownloadModal {...defaultProps} />);

    const downloadBtn = screen.getByRole('button', { name: /download/i });
    fireEvent.click(downloadBtn);

    expect(defaultProps.onDownload).toHaveBeenCalledWith(
      expect.objectContaining({
        size: expect.any(String),
        scope: expect.any(String),
      }),
    );
  });

  it('shows progress bar when status is not idle', () => {
    render(<BatchDownloadModal {...defaultProps} status="downloading" progress={45} />);

    expect(screen.getByText(/45%/)).toBeTruthy();
  });
});
