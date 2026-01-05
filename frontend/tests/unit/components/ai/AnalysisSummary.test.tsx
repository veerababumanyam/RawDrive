/**
 * AnalysisSummary Component Tests
 *
 * Feature: 025-ai-filter-simplify
 * Task: T064 - Frontend UI component tests
 *
 * Tests cover:
 * - Summary statistics rendering
 * - Quality distribution display
 * - Partial failure warning banner
 * - Retry functionality
 * - Accessibility
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnalysisSummary } from '../../../../src/components/ai/AnalysisSummary';
import type { AnalysisSummary as AnalysisSummaryType } from '../../../../src/validation/aiFilterSchemas';

// Mock the aiFilterService
vi.mock('../../../../src/services/aiFilterService', () => ({
  aiFilterService: {
    retryFailedAnalysis: vi.fn(),
  },
}));

import { aiFilterService } from '../../../../src/services/aiFilterService';

const baseSummary: AnalysisSummaryType = {
  total_analyzed: 100,
  total_photos: 100,
  failed_count: 0,
  excellent: 25,
  good: 40,
  fair: 30,
  poor: 5,
  blur_count: 15,
};

const summaryWithFailures: AnalysisSummaryType = {
  total_analyzed: 90,
  total_photos: 100,
  failed_count: 10,
  excellent: 20,
  good: 35,
  fair: 30,
  poor: 5,
  blur_count: 12,
};

describe('AnalysisSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders total analyzed count', () => {
      render(<AnalysisSummary summary={baseSummary} />);

      expect(screen.getByText('100')).toBeInTheDocument();
      expect(screen.getByText(/total analyzed/i)).toBeInTheDocument();
    });

    it('renders blur count', () => {
      render(<AnalysisSummary summary={baseSummary} />);

      expect(screen.getByText('15')).toBeInTheDocument();
      expect(screen.getByText(/blurry/i)).toBeInTheDocument();
    });

    it('renders quality distribution', () => {
      render(<AnalysisSummary summary={baseSummary} />);

      expect(screen.getByText('excellent')).toBeInTheDocument();
      expect(screen.getByText('good')).toBeInTheDocument();
      expect(screen.getByText('fair')).toBeInTheDocument();
      expect(screen.getByText('poor')).toBeInTheDocument();

      // Check counts in the distribution
      expect(screen.getByText('25')).toBeInTheDocument();
      expect(screen.getByText('40')).toBeInTheDocument();
      expect(screen.getByText('30')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('shows total photos when different from analyzed', () => {
      render(<AnalysisSummary summary={summaryWithFailures} />);

      expect(screen.getByText('90')).toBeInTheDocument();
      expect(screen.getByText('/ 100')).toBeInTheDocument();
    });
  });

  describe('Partial Failure Warning', () => {
    it('shows warning banner when failed_count > 0', () => {
      render(<AnalysisSummary summary={summaryWithFailures} />);

      expect(screen.getByText(/10 photos? failed to analyze/i)).toBeInTheDocument();
    });

    it('does not show warning banner when no failures', () => {
      render(<AnalysisSummary summary={baseSummary} />);

      expect(screen.queryByText(/failed to analyze/i)).not.toBeInTheDocument();
    });

    it('shows correct failure count in warning', () => {
      const customSummary = { ...baseSummary, total_photos: 105, total_analyzed: 100, failed_count: 5 };
      render(<AnalysisSummary summary={customSummary} />);

      expect(screen.getByText(/5 photos? failed to analyze/i)).toBeInTheDocument();
    });
  });

  describe('Retry Functionality', () => {
    it('shows retry button when workspaceId and galleryId provided', () => {
      render(
        <AnalysisSummary
          summary={summaryWithFailures}
          workspaceId="workspace-123"
          galleryId="gallery-456"
        />
      );

      expect(screen.getByRole('button', { name: /retry failed/i })).toBeInTheDocument();
    });

    it('does not show retry button without workspaceId/galleryId', () => {
      render(<AnalysisSummary summary={summaryWithFailures} />);

      expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
    });

    it('calls retryFailedAnalysis on retry click', async () => {
      const user = userEvent.setup();
      vi.mocked(aiFilterService.retryFailedAnalysis).mockResolvedValueOnce({
        queued_count: 10,
        message: 'Queued 10 photos for re-analysis',
      });

      render(
        <AnalysisSummary
          summary={summaryWithFailures}
          workspaceId="workspace-123"
          galleryId="gallery-456"
        />
      );

      const retryButton = screen.getByRole('button', { name: /retry failed/i });
      await user.click(retryButton);

      expect(aiFilterService.retryFailedAnalysis).toHaveBeenCalledWith(
        'workspace-123',
        'gallery-456'
      );
    });

    it('shows loading state during retry', async () => {
      const user = userEvent.setup();
      vi.mocked(aiFilterService.retryFailedAnalysis).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      render(
        <AnalysisSummary
          summary={summaryWithFailures}
          workspaceId="workspace-123"
          galleryId="gallery-456"
        />
      );

      const retryButton = screen.getByRole('button', { name: /retry failed/i });
      await user.click(retryButton);

      expect(screen.getByText(/retrying/i)).toBeInTheDocument();
    });

    it('shows success message after retry', async () => {
      const user = userEvent.setup();
      vi.mocked(aiFilterService.retryFailedAnalysis).mockResolvedValueOnce({
        queued_count: 10,
        message: 'Queued 10 photos for re-analysis',
      });

      render(
        <AnalysisSummary
          summary={summaryWithFailures}
          workspaceId="workspace-123"
          galleryId="gallery-456"
        />
      );

      const retryButton = screen.getByRole('button', { name: /retry failed/i });
      await user.click(retryButton);

      await waitFor(() => {
        expect(screen.getByText(/retry started/i)).toBeInTheDocument();
      });
    });

    it('shows error message on retry failure', async () => {
      const user = userEvent.setup();
      vi.mocked(aiFilterService.retryFailedAnalysis).mockRejectedValueOnce(
        new Error('Network error')
      );

      render(
        <AnalysisSummary
          summary={summaryWithFailures}
          workspaceId="workspace-123"
          galleryId="gallery-456"
        />
      );

      const retryButton = screen.getByRole('button', { name: /retry failed/i });
      await user.click(retryButton);

      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument();
      });
    });

    it('calls onRetryStarted callback on successful retry', async () => {
      const user = userEvent.setup();
      const onRetryStarted = vi.fn();
      vi.mocked(aiFilterService.retryFailedAnalysis).mockResolvedValueOnce({
        queued_count: 10,
        message: 'Queued 10 photos for re-analysis',
      });

      render(
        <AnalysisSummary
          summary={summaryWithFailures}
          workspaceId="workspace-123"
          galleryId="gallery-456"
          onRetryStarted={onRetryStarted}
        />
      );

      const retryButton = screen.getByRole('button', { name: /retry failed/i });
      await user.click(retryButton);

      await waitFor(() => {
        expect(onRetryStarted).toHaveBeenCalled();
      });
    });
  });

  describe('Quality Distribution Bars', () => {
    it('renders progress bars for each quality tier', () => {
      render(<AnalysisSummary summary={baseSummary} />);

      // Check for the distribution section
      expect(screen.getByText('Quality Distribution')).toBeInTheDocument();

      // Each tier should have a visual bar with appropriate color class
      // Colors are: bg-green-500 (excellent), bg-blue-500 (good), bg-yellow-500 (fair), bg-red-400 (poor)
      const greenBar = document.querySelector('.bg-green-500');
      const blueBar = document.querySelector('.bg-blue-500');
      const yellowBar = document.querySelector('.bg-yellow-500');
      const redBar = document.querySelector('.bg-red-400');

      expect(greenBar).toBeInTheDocument();
      expect(blueBar).toBeInTheDocument();
      expect(yellowBar).toBeInTheDocument();
      expect(redBar).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has semantic heading structure', () => {
      render(<AnalysisSummary summary={baseSummary} />);

      expect(screen.getByRole('heading', { name: /analysis complete/i })).toBeInTheDocument();
    });

    it('retry button has accessible label', () => {
      render(
        <AnalysisSummary
          summary={summaryWithFailures}
          workspaceId="workspace-123"
          galleryId="gallery-456"
        />
      );

      const retryButton = screen.getByRole('button', { name: /retry failed/i });
      expect(retryButton).toHaveAttribute('aria-label');
    });
  });
});
