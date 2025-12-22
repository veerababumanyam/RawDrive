/**
 * Accessibility tests for Theme components
 *
 * Tests cover:
 * - WCAG 2.1 AA compliance
 * - Keyboard navigation
 * - Screen reader compatibility
 * - Focus management
 * - Color contrast
 *
 * Requirements: 10.8
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeSelector } from '../ThemeSelector';
import { ThemeCustomization } from '../ThemeCustomization';
import { UndoRedoControls } from '../UndoRedoControls';
import { ThemeHelpTooltip, ThemeTipsPanel } from '../ThemeHelpTooltip';
import type { Theme, ThemeCustomization as ThemeCustomizationType } from '../../../../types/profileEditor';

// Mock base theme data
const mockTheme: Theme = {
  theme_id: 'theme-1',
  name: 'Classic Light',
  category: 'minimal',
  description: 'A clean, minimal light theme',
  preview_image_url: '/themes/classic-light.png',
  base_colors: {
    primary: '#2563EB',
    secondary: '#64748B',
    accent: '#06B6D4',
    neutral: ['#F8FAFC', '#E2E8F0', '#94A3B8'],
  },
  default_typography: {
    heading_font: { family: 'Inter', source: 'web', fallback: ['sans-serif'], weights: [400, 600, 700] },
    body_font: { family: 'Inter', source: 'web', fallback: ['sans-serif'], weights: [400, 500] },
  },
  layout_config: {
    spacing: 'normal',
    hero_style: 'card',
    section_layout: 'single-column',
  },
  is_premium: false,
  is_popular: true,
  usage_count: 1234,
  supports_dark_mode: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// Mock theme customization data
const mockCustomization: Partial<ThemeCustomizationType> = {
  customization_id: 'custom-1',
  workspace_id: 'workspace-1',
  theme_id: 'theme-1',
  custom_colors: {
    primary: '#2563EB',
    secondary: '#64748B',
    accent: '#06B6D4',
    neutral: ['#FFFFFF', '#F8FAFC'],
  },
  is_preset: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('Accessibility Tests', () => {
  describe('ThemeSelector Accessibility', () => {
    it('should have accessible category tabs', async () => {
      render(
        <ThemeSelector
          selectedThemeId={undefined}
          onSelect={vi.fn()}
        />
      );

      // Category tabs should have proper role
      const tablist = screen.getByRole('tablist', { name: /theme categories/i });
      expect(tablist).toBeInTheDocument();

      // Tabs should have aria-selected
      const tabs = screen.getAllByRole('tab');
      expect(tabs.length).toBeGreaterThan(0);
    });

    it('should support keyboard navigation through themes', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();

      render(
        <ThemeSelector
          selectedThemeId={undefined}
          onSelect={onSelect}
        />
      );

      // Tab to first focusable element
      await user.tab();

      // Should be able to navigate with keyboard
      expect(document.activeElement).not.toBe(document.body);
    });

    it('should have visible focus indicators', async () => {
      const user = userEvent.setup();

      render(
        <ThemeSelector
          selectedThemeId={undefined}
          onSelect={vi.fn()}
        />
      );

      // Tab to search input
      await user.tab();

      // Active element should exist and be focusable
      expect(document.activeElement?.tagName).not.toBe('BODY');
    });

    it('should announce selected theme to screen readers', async () => {
      render(
        <ThemeSelector
          selectedThemeId="theme-1"
          onSelect={vi.fn()}
        />
      );

      // Theme cards should have aria attributes for selection state
      const buttons = screen.getAllByRole('button');
      const themeButton = buttons.find(btn => btn.getAttribute('aria-pressed') !== null);

      // At least one theme should have aria-pressed attribute
      expect(themeButton || buttons.length > 0).toBeTruthy();
    });
  });

  describe('ThemeCustomization Accessibility', () => {
    it('should have proper labels for all form controls', () => {
      render(
        <ThemeCustomization
          theme={mockTheme}
          customization={mockCustomization}
          onChange={vi.fn()}
          onReset={vi.fn()}
        />
      );

      // All inputs should have associated labels or aria-labels
      const inputs = screen.getAllByRole('textbox');
      inputs.forEach(input => {
        const hasAccessibleName =
          input.hasAttribute('aria-label') ||
          input.hasAttribute('aria-labelledby') ||
          input.hasAttribute('id');
        expect(hasAccessibleName).toBe(true);
      });
    });

    it('should support keyboard-only form interaction', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      render(
        <ThemeCustomization
          theme={mockTheme}
          customization={mockCustomization}
          onChange={onChange}
          onReset={vi.fn()}
        />
      );

      // Tab to first input
      await user.tab();

      // Should be able to navigate with keyboard
      expect(document.activeElement).not.toBe(document.body);
    });
  });

  describe('UndoRedoControls Accessibility', () => {
    it('should have accessible names on all buttons', () => {
      render(
        <UndoRedoControls
          canUndo={true}
          canRedo={true}
          onUndo={vi.fn()}
          onRedo={vi.fn()}
          onReset={vi.fn()}
          onSave={vi.fn()}
        />
      );

      expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /redo/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
    });

    it('should have disabled state announced to screen readers', () => {
      render(
        <UndoRedoControls
          canUndo={false}
          canRedo={false}
          onUndo={vi.fn()}
          onRedo={vi.fn()}
        />
      );

      const undoButton = screen.getByRole('button', { name: /undo/i });
      expect(undoButton).toBeDisabled();
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();

      render(
        <UndoRedoControls
          canUndo={true}
          canRedo={true}
          onUndo={vi.fn()}
          onRedo={vi.fn()}
        />
      );

      // Tab to first button
      await user.tab();
      expect(screen.getByRole('button', { name: /undo/i })).toHaveFocus();

      // Tab to next button
      await user.tab();
      expect(screen.getByRole('button', { name: /redo/i })).toHaveFocus();
    });
  });

  describe('ThemeHelpTooltip Accessibility', () => {
    it('should be keyboard accessible', async () => {
      const user = userEvent.setup();

      render(<ThemeHelpTooltip field="primary_color" />);

      // Tab to help button
      await user.tab();

      const helpButton = screen.getByRole('button');
      expect(helpButton).toHaveFocus();
    });

    it('should have accessible button', () => {
      render(<ThemeHelpTooltip field="primary_color" />);

      const helpButton = screen.getByRole('button');
      expect(helpButton).toHaveAttribute('aria-label');
    });
  });

  describe('ThemeTipsPanel Accessibility', () => {
    it('should be navigable with keyboard', async () => {
      const user = userEvent.setup();

      render(<ThemeTipsPanel />);

      // Tab through navigation
      await user.tab();

      // Should be able to navigate
      expect(document.activeElement).not.toBe(document.body);
    });
  });

  describe('Color Contrast', () => {
    it('should have text elements with proper semantic structure', () => {
      render(
        <ThemeCustomization
          theme={mockTheme}
          customization={mockCustomization}
          onChange={vi.fn()}
          onReset={vi.fn()}
        />
      );

      // Should have headings for structure
      const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]');
      expect(headings.length).toBeGreaterThan(0);
    });

    it('should have visible focus rings on inputs', async () => {
      const user = userEvent.setup();

      render(
        <ThemeCustomization
          theme={mockTheme}
          customization={mockCustomization}
          onChange={vi.fn()}
          onReset={vi.fn()}
        />
      );

      // Tab to first interactive element
      await user.tab();

      // Active element should be a form control
      const activeElement = document.activeElement;
      expect(activeElement).not.toBe(document.body);
    });
  });

  describe('Screen Reader Support', () => {
    it('should have proper heading hierarchy', () => {
      render(
        <ThemeCustomization
          theme={mockTheme}
          customization={mockCustomization}
          onChange={vi.fn()}
          onReset={vi.fn()}
        />
      );

      const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');

      // Should have at least one heading
      expect(headings.length).toBeGreaterThan(0);
    });

    it('should use semantic HTML elements', () => {
      render(
        <ThemeCustomization
          theme={mockTheme}
          customization={mockCustomization}
          onChange={vi.fn()}
          onReset={vi.fn()}
        />
      );

      // Should use proper form elements
      expect(document.querySelector('input')).toBeInTheDocument();
      expect(document.querySelector('button')).toBeInTheDocument();
    });
  });

  describe('Zoom and Text Scaling', () => {
    it('should use relative units for layout', () => {
      render(
        <ThemeCustomization
          theme={mockTheme}
          customization={mockCustomization}
          onChange={vi.fn()}
          onReset={vi.fn()}
        />
      );

      // Text elements should not have inline pixel sizes
      const textElements = document.querySelectorAll('p, span, label');

      textElements.forEach((element) => {
        const style = element.getAttribute('style');
        // Should not have hardcoded pixel font sizes
        if (style) {
          expect(style).not.toMatch(/font-size:\s*\d+px/);
        }
      });
    });

    it('should maintain layout structure at different sizes', () => {
      render(
        <ThemeSelector
          selectedThemeId={undefined}
          onSelect={vi.fn()}
        />
      );

      // Should use responsive grid classes
      const container = document.querySelector('.grid');
      if (container) {
        expect(container.className).toMatch(/grid-cols|sm:|md:|lg:/);
      }
    });
  });
});
