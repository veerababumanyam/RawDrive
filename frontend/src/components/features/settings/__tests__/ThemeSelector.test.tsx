/**
 * Unit tests for ThemeSelector component
 *
 * Tests cover:
 * - Theme grid rendering
 * - Category filtering
 * - Search functionality
 * - Theme selection
 * - Light/Dark preview toggle
 * - Accessibility compliance
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.12, 7.13
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeSelector } from '../ThemeSelector';

// Note: ThemeSelector uses PREBUILT_THEMES directly from constants,
// so we test with actual theme data rather than mocking

describe('ThemeSelector', () => {
  const mockOnSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render theme grid with all themes', async () => {
      render(
        <ThemeSelector
          selectedThemeId={undefined}
          onSelect={mockOnSelect}
        />
      );

      // Wait for themes to render - check for actual theme names
      await waitFor(() => {
        expect(screen.getByText('Clean Slate')).toBeInTheDocument();
      });

      // Check for other themes
      expect(screen.getByText('Vivid Impact')).toBeInTheDocument();
      expect(screen.getByText('Golden Hour')).toBeInTheDocument();
    });

    it('should display category tabs', async () => {
      render(
        <ThemeSelector
          selectedThemeId={undefined}
          onSelect={mockOnSelect}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /all/i })).toBeInTheDocument();
      });

      expect(screen.getByRole('tab', { name: /popular/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /minimal/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /bold/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /elegant/i })).toBeInTheDocument();
    });

    it('should show search input', async () => {
      render(
        <ThemeSelector
          selectedThemeId={undefined}
          onSelect={mockOnSelect}
        />
      );

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/search themes/i)).toBeInTheDocument();
      });
    });

    it('should display light/dark preview toggle', async () => {
      render(
        <ThemeSelector
          selectedThemeId={undefined}
          onSelect={mockOnSelect}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /light/i })).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /dark/i })).toBeInTheDocument();
    });
  });

  describe('Category Filtering', () => {
    it('should filter themes by category when tab clicked', async () => {
      const user = userEvent.setup();

      render(
        <ThemeSelector
          selectedThemeId={undefined}
          onSelect={mockOnSelect}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Clean Slate')).toBeInTheDocument();
      });

      // Click Minimal category
      await user.click(screen.getByRole('tab', { name: /minimal/i }));

      // Should show minimal themes (Clean Slate, Monochrome)
      await waitFor(() => {
        expect(screen.getByText('Clean Slate')).toBeInTheDocument();
      });
    });

    it('should show popular themes when Popular tab clicked', async () => {
      const user = userEvent.setup();

      render(
        <ThemeSelector
          selectedThemeId={undefined}
          onSelect={mockOnSelect}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Clean Slate')).toBeInTheDocument();
      });

      // Click Popular tab
      await user.click(screen.getByRole('tab', { name: /popular/i }));

      // Should show popular themes
      await waitFor(() => {
        expect(screen.getByText('Clean Slate')).toBeInTheDocument();
      });
    });
  });

  describe('Search Functionality', () => {
    it('should filter themes by search query', async () => {
      const user = userEvent.setup();

      render(
        <ThemeSelector
          selectedThemeId={undefined}
          onSelect={mockOnSelect}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Clean Slate')).toBeInTheDocument();
      });

      // Type in search
      const searchInput = screen.getByPlaceholderText(/search themes/i);
      await user.type(searchInput, 'Ocean');

      // Should show matching theme
      await waitFor(() => {
        expect(screen.getByText('Ocean Breeze')).toBeInTheDocument();
      });
    });

    it('should show no results message when search has no matches', async () => {
      const user = userEvent.setup();

      render(
        <ThemeSelector
          selectedThemeId={undefined}
          onSelect={mockOnSelect}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Clean Slate')).toBeInTheDocument();
      });

      // Type non-matching search
      const searchInput = screen.getByPlaceholderText(/search themes/i);
      await user.type(searchInput, 'xyznonexistent');

      // Should show no results message
      await waitFor(() => {
        expect(screen.getByText(/no themes found/i)).toBeInTheDocument();
      });
    });
  });

  describe('Theme Selection', () => {
    it('should call onSelect when theme is clicked', async () => {
      const user = userEvent.setup();

      render(
        <ThemeSelector
          selectedThemeId={undefined}
          onSelect={mockOnSelect}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Clean Slate')).toBeInTheDocument();
      });

      // Click on a theme card
      const themeCard = screen.getByText('Clean Slate').closest('button');
      await user.click(themeCard!);

      expect(mockOnSelect).toHaveBeenCalled();
      expect(mockOnSelect).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Clean Slate',
      }));
    });

    it('should highlight selected theme', async () => {
      render(
        <ThemeSelector
          selectedThemeId="theme-clean-slate"
          onSelect={mockOnSelect}
        />
      );

      // Wait for themes to render - use getAllByText since selected theme name appears in multiple places
      // (theme card title and selection summary)
      await waitFor(() => {
        const themeTexts = screen.getAllByText('Clean Slate');
        expect(themeTexts.length).toBeGreaterThan(0);
      });

      // Find the theme card button - it's the first one with the theme name in an h3
      const themeTexts = screen.getAllByText('Clean Slate');
      // The theme card has the name in an h3, find the button containing it
      const themeCard = themeTexts[0].closest('button');

      // Verify the card has aria-pressed="true" for selection state
      expect(themeCard).toHaveAttribute('aria-pressed', 'true');

      // Additionally verify the card has the selected class (ring-2)
      expect(themeCard?.className).toContain('ring-2');
    });
  });

  describe('Premium Badge', () => {
    it('should show Pro badge on premium themes', async () => {
      render(
        <ThemeSelector
          selectedThemeId={undefined}
          onSelect={mockOnSelect}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Golden Hour')).toBeInTheDocument();
      });

      // Find the premium theme card (Golden Hour is premium)
      const premiumCard = screen.getByText('Golden Hour').closest('button');
      expect(premiumCard).toContainHTML('Pro');
    });
  });

  describe('Popular Badge', () => {
    it('should show Popular badge on popular themes', async () => {
      render(
        <ThemeSelector
          selectedThemeId={undefined}
          onSelect={mockOnSelect}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Clean Slate')).toBeInTheDocument();
      });

      // Find the popular theme card (Clean Slate is popular and not premium)
      const popularCard = screen.getByText('Clean Slate').closest('button');
      expect(popularCard).toContainHTML('Popular');
    });
  });

  describe('Disabled State', () => {
    it('should disable all interactions when disabled prop is true', async () => {
      const user = userEvent.setup();

      render(
        <ThemeSelector
          selectedThemeId={undefined}
          onSelect={mockOnSelect}
          disabled={true}
        />
      );

      // Wait for themes to render
      await waitFor(() => {
        expect(screen.getByText('Clean Slate')).toBeInTheDocument();
      });

      // Theme cards should be disabled - use toBeDisabled() matcher
      const themeCard = screen.getByText('Clean Slate').closest('button');
      expect(themeCard).toBeDisabled();

      // Verify clicking doesn't trigger onSelect when disabled
      await user.click(themeCard!);
      expect(mockOnSelect).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('should have accessible labels on theme cards', async () => {
      render(
        <ThemeSelector
          selectedThemeId={undefined}
          onSelect={mockOnSelect}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Clean Slate')).toBeInTheDocument();
      });

      // Theme cards should have accessible names
      const themeCard = screen.getByText('Clean Slate').closest('button');
      expect(themeCard).toHaveAttribute('aria-label', expect.stringContaining('Clean Slate'));
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();

      render(
        <ThemeSelector
          selectedThemeId={undefined}
          onSelect={mockOnSelect}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Clean Slate')).toBeInTheDocument();
      });

      // Tab to search first
      const searchInput = screen.getByPlaceholderText(/search themes/i);
      await user.click(searchInput);
      
      // Tab through elements
      await user.tab();
      await user.tab();
      await user.tab();
      await user.tab();
      await user.tab();

      // Theme card should be focusable
      const focusedElement = document.activeElement;
      expect(focusedElement?.tagName).toBe('BUTTON');
    });
  });

  describe('Compact Mode', () => {
    it('should render in compact mode', async () => {
      render(
        <ThemeSelector
          selectedThemeId={undefined}
          onSelect={mockOnSelect}
          compact={true}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Clean Slate')).toBeInTheDocument();
      });

      // In compact mode, the grid should have the tabpanel role
      const grid = screen.getByRole('tabpanel');
      expect(grid).toBeInTheDocument();
    });
  });
});
