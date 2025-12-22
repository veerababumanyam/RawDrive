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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeSelector } from '../ThemeSelector';

// Mock themes data
const mockThemes = [
  {
    theme_id: 'theme-1',
    name: 'Classic Light',
    description: 'A clean, minimal light theme',
    category: 'minimal',
    is_popular: true,
    is_premium: false,
    colors: {
      primary: '#2563EB',
      secondary: '#64748B',
      accent: '#06B6D4',
      background: '#FFFFFF',
      text: '#1E293B',
    },
    thumbnail_url: '/themes/classic-light.png',
  },
  {
    theme_id: 'theme-2',
    name: 'Dark Pro',
    description: 'Bold dark theme for professionals',
    category: 'bold',
    is_popular: false,
    is_premium: true,
    colors: {
      primary: '#8B5CF6',
      secondary: '#A78BFA',
      accent: '#EC4899',
      background: '#0F172A',
      text: '#F8FAFC',
    },
    thumbnail_url: '/themes/dark-pro.png',
  },
  {
    theme_id: 'theme-3',
    name: 'Elegant Gold',
    description: 'Sophisticated gold accents',
    category: 'elegant',
    is_popular: true,
    is_premium: false,
    colors: {
      primary: '#D4AF37',
      secondary: '#B8860B',
      accent: '#FFD700',
      background: '#FFFEF5',
      text: '#3D3D3D',
    },
    thumbnail_url: '/themes/elegant-gold.png',
  },
];

// Mock the theme service
vi.mock('../../../../services/themeService', () => ({
  themeService: {
    getThemes: vi.fn(() => Promise.resolve(mockThemes)),
    getTheme: vi.fn((id: string) => Promise.resolve(mockThemes.find(t => t.theme_id === id))),
  },
}));

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

      // Wait for themes to load
      await waitFor(() => {
        expect(screen.getByText('Classic Light')).toBeInTheDocument();
      });

      expect(screen.getByText('Dark Pro')).toBeInTheDocument();
      expect(screen.getByText('Elegant Gold')).toBeInTheDocument();
    });

    it('should display category tabs', async () => {
      render(
        <ThemeSelector
          selectedThemeId={undefined}
          onSelect={mockOnSelect}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /all/i })).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /popular/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /minimal/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /bold/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /elegant/i })).toBeInTheDocument();
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
        expect(screen.getByText('Classic Light')).toBeInTheDocument();
      });

      // Click Minimal category
      await user.click(screen.getByRole('button', { name: /minimal/i }));

      // Should show minimal theme
      expect(screen.getByText('Classic Light')).toBeInTheDocument();
      // Should not show bold or elegant themes
      expect(screen.queryByText('Dark Pro')).not.toBeInTheDocument();
      expect(screen.queryByText('Elegant Gold')).not.toBeInTheDocument();
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
        expect(screen.getByText('Classic Light')).toBeInTheDocument();
      });

      // Click Popular tab
      await user.click(screen.getByRole('button', { name: /popular/i }));

      // Should show popular themes
      expect(screen.getByText('Classic Light')).toBeInTheDocument();
      expect(screen.getByText('Elegant Gold')).toBeInTheDocument();
      // Should not show non-popular theme
      expect(screen.queryByText('Dark Pro')).not.toBeInTheDocument();
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
        expect(screen.getByText('Classic Light')).toBeInTheDocument();
      });

      // Type in search
      const searchInput = screen.getByPlaceholderText(/search themes/i);
      await user.type(searchInput, 'Dark');

      // Should only show matching theme
      expect(screen.getByText('Dark Pro')).toBeInTheDocument();
      expect(screen.queryByText('Classic Light')).not.toBeInTheDocument();
      expect(screen.queryByText('Elegant Gold')).not.toBeInTheDocument();
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
        expect(screen.getByText('Classic Light')).toBeInTheDocument();
      });

      // Type non-matching search
      const searchInput = screen.getByPlaceholderText(/search themes/i);
      await user.type(searchInput, 'xyznonexistent');

      // Should show no results message
      expect(screen.getByText(/no themes found/i)).toBeInTheDocument();
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
        expect(screen.getByText('Classic Light')).toBeInTheDocument();
      });

      // Click on a theme card
      const themeCard = screen.getByText('Classic Light').closest('button');
      await user.click(themeCard!);

      expect(mockOnSelect).toHaveBeenCalledWith(mockThemes[0]);
    });

    it('should highlight selected theme', async () => {
      render(
        <ThemeSelector
          selectedThemeId="theme-1"
          onSelect={mockOnSelect}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Classic Light')).toBeInTheDocument();
      });

      // The selected theme card should have selected indicator
      const themeCard = screen.getByText('Classic Light').closest('button');
      expect(themeCard).toHaveClass('ring-2');
    });
  });

  describe('Premium Badge', () => {
    it('should show Premium badge on premium themes', async () => {
      render(
        <ThemeSelector
          selectedThemeId={undefined}
          onSelect={mockOnSelect}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Dark Pro')).toBeInTheDocument();
      });

      // Find the premium theme card
      const premiumCard = screen.getByText('Dark Pro').closest('button');
      expect(premiumCard).toContainHTML('Premium');
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
        expect(screen.getByText('Classic Light')).toBeInTheDocument();
      });

      // Find the popular theme card
      const popularCard = screen.getByText('Classic Light').closest('button');
      expect(popularCard).toContainHTML('Popular');
    });
  });

  describe('Disabled State', () => {
    it('should disable all interactions when disabled prop is true', async () => {
      render(
        <ThemeSelector
          selectedThemeId={undefined}
          onSelect={mockOnSelect}
          disabled={true}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Classic Light')).toBeInTheDocument();
      });

      // Theme cards should be disabled
      const themeCard = screen.getByText('Classic Light').closest('button');
      expect(themeCard).toBeDisabled();
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
        expect(screen.getByText('Classic Light')).toBeInTheDocument();
      });

      // Theme cards should have accessible names
      const themeCards = screen.getAllByRole('button');
      const themeButtons = themeCards.filter(btn =>
        btn.getAttribute('aria-label')?.includes('theme') ||
        btn.textContent?.includes('Classic Light') ||
        btn.textContent?.includes('Dark Pro') ||
        btn.textContent?.includes('Elegant Gold')
      );
      expect(themeButtons.length).toBeGreaterThan(0);
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
        expect(screen.getByText('Classic Light')).toBeInTheDocument();
      });

      // Tab to first theme card
      await user.tab();
      await user.tab(); // Skip search input
      await user.tab(); // Skip category tabs

      // Press Enter to select
      await user.keyboard('{Enter}');

      // Should have called onSelect
      expect(mockOnSelect).toHaveBeenCalled();
    });
  });

  describe('Compact Mode', () => {
    it('should render smaller cards in compact mode', async () => {
      render(
        <ThemeSelector
          selectedThemeId={undefined}
          onSelect={mockOnSelect}
          compact={true}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Classic Light')).toBeInTheDocument();
      });

      // In compact mode, the grid should have different styling
      const grid = screen.getByRole('group');
      expect(grid).toHaveClass('gap-2');
    });
  });
});
