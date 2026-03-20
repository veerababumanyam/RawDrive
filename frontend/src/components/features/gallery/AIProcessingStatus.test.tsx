/**
 * AIProcessingStatus Tests
 * Tests progress bar, estimated time, per-photo status
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { AIProcessingStatus } from './AIProcessingStatus';

describe('AIProcessingStatus', () => {
  const defaultProps = {
    galleryId: 'gallery-1',
    totalPhotos: 100,
    processedCount: 50,
    failedCount: 2,
    status: 'processing' as const,
  };

  it('renders progress bar with percentage', () => {
    render(<AIProcessingStatus {...defaultProps} />);

    expect(screen.getByText('50%')).toBeTruthy();
    expect(screen.getByRole('progressbar')).toBeTruthy();
  });

  it('shows processed count out of total', () => {
    render(<AIProcessingStatus {...defaultProps} />);

    expect(screen.getByText(/50 of 100/)).toBeTruthy();
  });

  it('shows failed count with retry message when failures exist', () => {
    render(<AIProcessingStatus {...defaultProps} />);

    expect(screen.getByText(/2 of 100 failed/)).toBeTruthy();
  });

  it('shows estimated time remaining during processing', () => {
    render(
      <AIProcessingStatus
        {...defaultProps}
        elapsedSeconds={60}
      />
    );

    // 60 seconds for 50 photos = ~1.2s/photo, 50 remaining = ~60s
    expect(screen.getByText(/remaining/i)).toBeTruthy();
  });

  it('shows complete state when status is complete', () => {
    render(
      <AIProcessingStatus
        {...defaultProps}
        status="complete"
        processedCount={100}
        failedCount={0}
      />
    );

    expect(screen.getByText('100%')).toBeTruthy();
    expect(screen.getByText(/complete/i)).toBeTruthy();
  });

  it('shows partial failure state', () => {
    render(
      <AIProcessingStatus
        {...defaultProps}
        status="partial_failure"
        processedCount={98}
        failedCount={2}
      />
    );

    expect(screen.getByText(/2 of 100 failed/)).toBeTruthy();
  });

  it('renders idle state when not processing', () => {
    render(
      <AIProcessingStatus
        {...defaultProps}
        status="idle"
        processedCount={0}
        failedCount={0}
      />
    );

    expect(screen.getByText('0%')).toBeTruthy();
  });

  it('has collapsible detail section', () => {
    render(<AIProcessingStatus {...defaultProps} />);

    const toggleButton = screen.getByLabelText(/toggle details/i);
    expect(toggleButton).toBeTruthy();

    fireEvent.click(toggleButton);
    // After expanding, per-photo details should be visible
    expect(screen.getByText(/per-photo status/i)).toBeTruthy();
  });

  it('calls onRetryFailed when retry button is clicked', () => {
    const onRetryFailed = vi.fn();
    render(
      <AIProcessingStatus
        {...defaultProps}
        onRetryFailed={onRetryFailed}
      />
    );

    const retryButton = screen.getByText(/retry/i);
    fireEvent.click(retryButton);

    expect(onRetryFailed).toHaveBeenCalledWith('gallery-1');
  });
});
