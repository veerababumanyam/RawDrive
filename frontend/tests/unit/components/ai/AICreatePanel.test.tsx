/**
 * AICreatePanel Component Tests
 *
 * Feature: 025-ai-filter-simplify
 * Task: T064 - Frontend UI component tests
 *
 * Tests cover:
 * - Mode selection
 * - Style and tone controls
 * - Generate button and loading state
 * - Result display and copy functionality
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AICreatePanel } from '../../../../src/components/features/ai/AICreatePanel';
import type { AICreateResult } from '../../../../src/types/aiFilter';

describe('AICreatePanel', () => {
  const mockOnGenerate = vi.fn<Parameters<typeof vi.fn>>().mockResolvedValue({
    mode: 'story',
    content: 'Generated story content',
    asset_count: 5,
    tokens_used: 150,
  } as AICreateResult);

  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders panel with title and close button', () => {
      render(
        <AICreatePanel
          selectedAssetIds={['1', '2', '3']}
          onGenerate={mockOnGenerate}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText('AI Create')).toBeInTheDocument();
      expect(screen.getByText('3 photos')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
    });

    it('renders mode selection buttons', () => {
      render(
        <AICreatePanel
          selectedAssetIds={['1', '2']}
          onGenerate={mockOnGenerate}
        />
      );

      expect(screen.getByText('Story')).toBeInTheDocument();
      expect(screen.getByText('Captions')).toBeInTheDocument();
      expect(screen.getByText('Hashtags')).toBeInTheDocument();
    });

    it('renders style and tone dropdowns', () => {
      render(
        <AICreatePanel
          selectedAssetIds={['1', '2']}
          onGenerate={mockOnGenerate}
        />
      );

      expect(screen.getByLabelText(/style/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/tone/i)).toBeInTheDocument();
    });

    it('does not render when isOpen is false', () => {
      render(
        <AICreatePanel
          selectedAssetIds={['1', '2']}
          onGenerate={mockOnGenerate}
          isOpen={false}
        />
      );

      expect(screen.queryByText('AI Create')).not.toBeInTheDocument();
    });
  });

  describe('Mode Selection', () => {
    it('selects mode when clicked', async () => {
      const user = userEvent.setup();
      render(
        <AICreatePanel
          selectedAssetIds={['1', '2']}
          onGenerate={mockOnGenerate}
        />
      );

      const captionsButton = screen.getByText('Captions').closest('button')!;
      await user.click(captionsButton);

      // Generate button should reflect the mode
      expect(screen.getByRole('button', { name: /generate captions/i })).toBeInTheDocument();
    });

    it('hides max length for hashtags mode', async () => {
      const user = userEvent.setup();
      render(
        <AICreatePanel
          selectedAssetIds={['1', '2']}
          onGenerate={mockOnGenerate}
        />
      );

      // Max length should be visible for story mode
      expect(screen.getByLabelText(/max length/i)).toBeInTheDocument();

      // Switch to hashtags
      const hashtagsButton = screen.getByText('Hashtags').closest('button')!;
      await user.click(hashtagsButton);

      // Max length should be hidden
      expect(screen.queryByLabelText(/max length/i)).not.toBeInTheDocument();
    });
  });

  describe('Generate Button', () => {
    it('calls onGenerate with correct parameters', async () => {
      const user = userEvent.setup();
      render(
        <AICreatePanel
          selectedAssetIds={['asset-1', 'asset-2']}
          onGenerate={mockOnGenerate}
        />
      );

      await user.click(screen.getByRole('button', { name: /generate story/i }));

      expect(mockOnGenerate).toHaveBeenCalledWith({
        mode: 'story',
        asset_ids: ['asset-1', 'asset-2'],
        style: 'professional',
        tone: 'warm',
        max_length: undefined,
      });
    });

    it('is disabled when no photos selected', () => {
      render(
        <AICreatePanel
          selectedAssetIds={[]}
          onGenerate={mockOnGenerate}
        />
      );

      expect(screen.getByRole('button', { name: /generate story/i })).toBeDisabled();
    });

    it('shows loading state while generating', async () => {
      const user = userEvent.setup();
      const slowGenerate = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ mode: 'story', content: 'test', asset_count: 1 }), 100))
      );

      render(
        <AICreatePanel
          selectedAssetIds={['1']}
          onGenerate={slowGenerate}
        />
      );

      await user.click(screen.getByRole('button', { name: /generate story/i }));

      expect(screen.getByText(/generating/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /generating/i })).toBeDisabled();
    });

    it('shows empty state message when no photos selected', () => {
      render(
        <AICreatePanel
          selectedAssetIds={[]}
          onGenerate={mockOnGenerate}
        />
      );

      expect(screen.getByText(/select photos/i)).toBeInTheDocument();
    });
  });

  describe('Result Display', () => {
    it('displays generated content', async () => {
      const user = userEvent.setup();
      render(
        <AICreatePanel
          selectedAssetIds={['1']}
          onGenerate={mockOnGenerate}
        />
      );

      await user.click(screen.getByRole('button', { name: /generate story/i }));

      await waitFor(() => {
        expect(screen.getByText('Generated story content')).toBeInTheDocument();
      });
    });

    it('shows token count when available', async () => {
      const user = userEvent.setup();
      render(
        <AICreatePanel
          selectedAssetIds={['1']}
          onGenerate={mockOnGenerate}
        />
      );

      await user.click(screen.getByRole('button', { name: /generate story/i }));

      await waitFor(() => {
        expect(screen.getByText(/~150 tokens/i)).toBeInTheDocument();
      });
    });

    it('has copy button for result', async () => {
      const user = userEvent.setup();

      // Mock clipboard API using vi.stubGlobal for proper test isolation
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('navigator', {
        ...navigator,
        clipboard: { writeText: writeTextMock },
      });

      render(
        <AICreatePanel
          selectedAssetIds={['1']}
          onGenerate={mockOnGenerate}
        />
      );

      await user.click(screen.getByRole('button', { name: /generate story/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /copy/i }));

      expect(writeTextMock).toHaveBeenCalledWith('Generated story content');

      // Clean up
      vi.unstubAllGlobals();
    });

    it('has regenerate button', async () => {
      const user = userEvent.setup();
      render(
        <AICreatePanel
          selectedAssetIds={['1']}
          onGenerate={mockOnGenerate}
        />
      );

      await user.click(screen.getByRole('button', { name: /generate story/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /regenerate/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /regenerate/i }));

      expect(mockOnGenerate).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling', () => {
    it('displays error message when generation fails', async () => {
      const user = userEvent.setup();
      const failingGenerate = vi.fn().mockRejectedValue(new Error('API quota exceeded'));

      render(
        <AICreatePanel
          selectedAssetIds={['1']}
          onGenerate={failingGenerate}
        />
      );

      await user.click(screen.getByRole('button', { name: /generate story/i }));

      await waitFor(() => {
        expect(screen.getByText(/API quota exceeded/i)).toBeInTheDocument();
      });
    });

    it('shows error when trying to generate with no photos', async () => {
      const user = userEvent.setup();
      const checkGenerate = vi.fn().mockRejectedValue(new Error('Please select at least one photo'));

      render(
        <AICreatePanel
          selectedAssetIds={[]}
          onGenerate={checkGenerate}
        />
      );

      // Button should be disabled, but we test the validation message
      expect(screen.getByText(/select photos/i)).toBeInTheDocument();
    });
  });

  describe('Style and Tone Options', () => {
    it('updates style when selected', async () => {
      const user = userEvent.setup();
      render(
        <AICreatePanel
          selectedAssetIds={['1']}
          onGenerate={mockOnGenerate}
        />
      );

      const styleSelect = screen.getByLabelText(/style/i) as HTMLSelectElement;
      fireEvent.change(styleSelect, { target: { value: 'poetic' } });

      await user.click(screen.getByRole('button', { name: /generate story/i }));

      expect(mockOnGenerate).toHaveBeenCalledWith(
        expect.objectContaining({ style: 'poetic' })
      );
    });

    it('updates tone when selected', async () => {
      const user = userEvent.setup();
      render(
        <AICreatePanel
          selectedAssetIds={['1']}
          onGenerate={mockOnGenerate}
        />
      );

      const toneSelect = screen.getByLabelText(/tone/i) as HTMLSelectElement;
      fireEvent.change(toneSelect, { target: { value: 'playful' } });

      await user.click(screen.getByRole('button', { name: /generate story/i }));

      expect(mockOnGenerate).toHaveBeenCalledWith(
        expect.objectContaining({ tone: 'playful' })
      );
    });
  });

  describe('Close Action', () => {
    it('calls onClose when close button clicked', async () => {
      const user = userEvent.setup();
      render(
        <AICreatePanel
          selectedAssetIds={['1']}
          onGenerate={mockOnGenerate}
          onClose={mockOnClose}
        />
      );

      await user.click(screen.getByRole('button', { name: /close/i }));

      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('has dialog role', () => {
      render(
        <AICreatePanel
          selectedAssetIds={['1']}
          onGenerate={mockOnGenerate}
        />
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('has aria-labelledby for the title', () => {
      render(
        <AICreatePanel
          selectedAssetIds={['1']}
          onGenerate={mockOnGenerate}
        />
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-labelledby');
    });

    it('mode buttons have radiogroup role', () => {
      render(
        <AICreatePanel
          selectedAssetIds={['1']}
          onGenerate={mockOnGenerate}
        />
      );

      expect(screen.getByRole('radiogroup', { name: /content type/i })).toBeInTheDocument();
    });
  });
});
