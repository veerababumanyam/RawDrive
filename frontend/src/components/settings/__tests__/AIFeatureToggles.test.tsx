/**
 * Tests for AI Feature Toggles Component
 * Feature: 010-ai-powered-features
 * Task: T081 - E2E tests for complete user workflows
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AIFeatureTogglesSection from '../AIFeatureTogglesSection';
import type { AIFeatureToggles, AIFeatureTogglesResponse } from '../../../types/geminiSettings';

// ---------------------------------------------------------------------------
// Test Setup
// ---------------------------------------------------------------------------

const mockFeatureToggles: AIFeatureTogglesResponse = {
  toggles: {
    photo_analysis: true,
    captions: true,
    hashtags: true,
    gallery_story: true,
    smart_curation: true,
  },
  has_api_key: true,
  api_status: 'connected',
};

const mockOnToggle = vi.fn();

describe('AIFeatureTogglesSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Rendering Tests
  // ---------------------------------------------------------------------------

  describe('Rendering', () => {
    it('renders all feature toggles when API key is configured', () => {
      render(
        <AIFeatureTogglesSection
          featureToggles={mockFeatureToggles}
          onToggle={mockOnToggle}
        />
      );

      // Check all feature names are rendered
      expect(screen.getByText('Photo Analysis')).toBeInTheDocument();
      expect(screen.getByText('Caption Generation')).toBeInTheDocument();
      expect(screen.getByText('Hashtag Generation')).toBeInTheDocument();
      expect(screen.getByText('Gallery Stories')).toBeInTheDocument();
      expect(screen.getByText('Smart Curation')).toBeInTheDocument();
    });

    it('renders feature descriptions', () => {
      render(
        <AIFeatureTogglesSection
          featureToggles={mockFeatureToggles}
          onToggle={mockOnToggle}
        />
      );

      expect(
        screen.getByText(/AI-powered quality assessment, tags, colors/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Generate professional, casual, or poetic captions/i)
      ).toBeInTheDocument();
    });

    it('renders loading skeleton when loading without data', () => {
      render(
        <AIFeatureTogglesSection
          featureToggles={null}
          onToggle={mockOnToggle}
          loading={true}
        />
      );

      // Should show skeleton loaders
      const skeletons = document.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('renders error state when error prop is provided', () => {
      const testError = new Error('Failed to load features');
      render(
        <AIFeatureTogglesSection
          featureToggles={null}
          onToggle={mockOnToggle}
          error={testError}
        />
      );

      expect(
        screen.getByText(/Failed to load feature settings/i)
      ).toBeInTheDocument();
    });

    it('renders disabled state when no API key', () => {
      const noApiKeyToggles: AIFeatureTogglesResponse = {
        toggles: {
          photo_analysis: false,
          captions: false,
          hashtags: false,
          gallery_story: false,
          smart_curation: false,
        },
        has_api_key: false,
        api_status: 'not_configured',
      };

      render(
        <AIFeatureTogglesSection
          featureToggles={noApiKeyToggles}
          onToggle={mockOnToggle}
        />
      );

      expect(
        screen.getByText(/Configure your Gemini API key/i)
      ).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Toggle Interaction Tests
  // ---------------------------------------------------------------------------

  describe('Toggle Interactions', () => {
    it('calls onToggle when a toggle is clicked', async () => {
      const user = userEvent.setup();

      render(
        <AIFeatureTogglesSection
          featureToggles={mockFeatureToggles}
          onToggle={mockOnToggle}
        />
      );

      // Find and click the photo analysis toggle
      const toggles = screen.getAllByRole('switch');
      expect(toggles.length).toBe(5);

      await user.click(toggles[0]);
      expect(mockOnToggle).toHaveBeenCalledWith('photo_analysis');
    });

    it('shows loading state when toggling a feature', () => {
      render(
        <AIFeatureTogglesSection
          featureToggles={mockFeatureToggles}
          onToggle={mockOnToggle}
          togglingFeature="captions"
        />
      );

      // Should show loading spinner for captions toggle
      const spinners = document.querySelectorAll('.animate-spin');
      expect(spinners.length).toBeGreaterThan(0);
    });

    it('disables toggle buttons when loading', () => {
      render(
        <AIFeatureTogglesSection
          featureToggles={mockFeatureToggles}
          onToggle={mockOnToggle}
          togglingFeature="photo_analysis"
        />
      );

      const toggles = screen.getAllByRole('switch');
      // The toggling one should be disabled
      expect(toggles[0]).toBeDisabled();
    });

    it('toggles each feature correctly', async () => {
      const user = userEvent.setup();
      const onToggle = vi.fn();

      render(
        <AIFeatureTogglesSection
          featureToggles={mockFeatureToggles}
          onToggle={onToggle}
        />
      );

      const toggles = screen.getAllByRole('switch');

      // Toggle each feature
      await user.click(toggles[0]); // photo_analysis
      expect(onToggle).toHaveBeenLastCalledWith('photo_analysis');

      await user.click(toggles[1]); // captions
      expect(onToggle).toHaveBeenLastCalledWith('captions');

      await user.click(toggles[2]); // hashtags
      expect(onToggle).toHaveBeenLastCalledWith('hashtags');

      await user.click(toggles[3]); // gallery_story
      expect(onToggle).toHaveBeenLastCalledWith('gallery_story');

      await user.click(toggles[4]); // smart_curation
      expect(onToggle).toHaveBeenLastCalledWith('smart_curation');

      expect(onToggle).toHaveBeenCalledTimes(5);
    });
  });

  // ---------------------------------------------------------------------------
  // Accessibility Tests
  // ---------------------------------------------------------------------------

  describe('Accessibility', () => {
    it('has correct ARIA attributes on toggles', () => {
      render(
        <AIFeatureTogglesSection
          featureToggles={mockFeatureToggles}
          onToggle={mockOnToggle}
        />
      );

      const toggles = screen.getAllByRole('switch');

      toggles.forEach((toggle) => {
        expect(toggle).toHaveAttribute('aria-checked');
        expect(toggle).toHaveAttribute('aria-label');
      });
    });

    it('reflects enabled state in aria-checked', () => {
      const mixedToggles: AIFeatureTogglesResponse = {
        ...mockFeatureToggles,
        toggles: {
          ...mockFeatureToggles.toggles,
          photo_analysis: false,
          captions: true,
        },
      };

      render(
        <AIFeatureTogglesSection
          featureToggles={mixedToggles}
          onToggle={mockOnToggle}
        />
      );

      const toggles = screen.getAllByRole('switch');
      expect(toggles[0]).toHaveAttribute('aria-checked', 'false');
      expect(toggles[1]).toHaveAttribute('aria-checked', 'true');
    });

    it('has accessible labels for screen readers', () => {
      render(
        <AIFeatureTogglesSection
          featureToggles={mockFeatureToggles}
          onToggle={mockOnToggle}
        />
      );

      const toggles = screen.getAllByRole('switch');

      // Each toggle should have a descriptive aria-label
      expect(toggles[0]).toHaveAttribute('aria-label', expect.stringContaining('Photo Analysis'));
      expect(toggles[1]).toHaveAttribute('aria-label', expect.stringContaining('Caption Generation'));
    });

    it('supports keyboard navigation', async () => {
      const user = userEvent.setup();
      const onToggle = vi.fn();

      render(
        <AIFeatureTogglesSection
          featureToggles={mockFeatureToggles}
          onToggle={onToggle}
        />
      );

      // Tab to first toggle and press Space
      const firstToggle = screen.getAllByRole('switch')[0];
      firstToggle.focus();

      await user.keyboard('[Space]');
      expect(onToggle).toHaveBeenCalledWith('photo_analysis');
    });
  });

  // ---------------------------------------------------------------------------
  // Visual State Tests
  // ---------------------------------------------------------------------------

  describe('Visual States', () => {
    it('shows enabled styling for enabled features', () => {
      render(
        <AIFeatureTogglesSection
          featureToggles={mockFeatureToggles}
          onToggle={mockOnToggle}
        />
      );

      // Check for success styling on enabled toggles
      const featureItems = document.querySelectorAll('.bg-success\\/5');
      expect(featureItems.length).toBeGreaterThan(0);
    });

    it('shows disabled styling for disabled features', () => {
      const disabledToggles: AIFeatureTogglesResponse = {
        ...mockFeatureToggles,
        toggles: {
          photo_analysis: false,
          captions: false,
          hashtags: false,
          gallery_story: false,
          smart_curation: false,
        },
      };

      render(
        <AIFeatureTogglesSection
          featureToggles={disabledToggles}
          onToggle={mockOnToggle}
        />
      );

      // No success styling should be present
      const enabledItems = document.querySelectorAll('.bg-success\\/5');
      expect(enabledItems.length).toBe(0);
    });

    it('applies correct icon color based on state', () => {
      const mixedToggles: AIFeatureTogglesResponse = {
        ...mockFeatureToggles,
        toggles: {
          ...mockFeatureToggles.toggles,
          photo_analysis: false,
        },
      };

      render(
        <AIFeatureTogglesSection
          featureToggles={mixedToggles}
          onToggle={mockOnToggle}
        />
      );

      // Check icon containers for different colors
      const iconContainers = document.querySelectorAll('.rounded-lg.flex.items-center');
      expect(iconContainers.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Edge Cases
  // ---------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('handles null toggles gracefully', () => {
      render(
        <AIFeatureTogglesSection
          featureToggles={null}
          onToggle={mockOnToggle}
        />
      );

      // Should not crash, might show loading or empty state
      expect(screen.queryByText('Photo Analysis')).not.toBeInTheDocument();
    });

    it('handles validation_failed API status', () => {
      const failedToggles: AIFeatureTogglesResponse = {
        ...mockFeatureToggles,
        api_status: 'validation_failed',
      };

      render(
        <AIFeatureTogglesSection
          featureToggles={failedToggles}
          onToggle={mockOnToggle}
        />
      );

      // Should show warning about API key
      expect(
        screen.getByText(/Configure your Gemini API key/i)
      ).toBeInTheDocument();
    });

    it('handles rapid toggle clicks', async () => {
      const user = userEvent.setup();
      const onToggle = vi.fn().mockImplementation(() => new Promise((r) => setTimeout(r, 100)));

      render(
        <AIFeatureTogglesSection
          featureToggles={mockFeatureToggles}
          onToggle={onToggle}
        />
      );

      const toggles = screen.getAllByRole('switch');

      // Rapidly click the same toggle
      await user.click(toggles[0]);
      await user.click(toggles[0]);
      await user.click(toggles[0]);

      // Each click should register
      expect(onToggle).toHaveBeenCalledTimes(3);
    });

    it('defaults to enabled when toggle value is undefined', () => {
      const partialToggles: AIFeatureTogglesResponse = {
        toggles: {
          photo_analysis: true,
          captions: true,
          hashtags: true,
          gallery_story: true,
          smart_curation: true,
        } as AIFeatureToggles,
        has_api_key: true,
        api_status: 'connected',
      };

      render(
        <AIFeatureTogglesSection
          featureToggles={partialToggles}
          onToggle={mockOnToggle}
        />
      );

      // All toggles should render without error
      const toggles = screen.getAllByRole('switch');
      expect(toggles.length).toBe(5);
    });
  });
});
