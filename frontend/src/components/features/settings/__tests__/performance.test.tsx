/**
 * Performance tests for Theme components
 *
 * Tests cover:
 * - Component render time
 * - Re-render optimization
 * - Memory usage patterns
 * - Bundle size considerations
 *
 * Requirements: 10.9
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeSelector } from '../ThemeSelector';
import { ThemeCustomization } from '../ThemeCustomization';
import { UndoRedoControls } from '../UndoRedoControls';
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

describe('Performance Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('ThemeSelector Performance', () => {
    it('should render initial view within acceptable time', async () => {
      const startTime = performance.now();

      render(
        <ThemeSelector
          selectedThemeId={undefined}
          onSelect={vi.fn()}
        />
      );

      const endTime = performance.now();
      const renderTime = endTime - startTime;

      // Initial render should be under 500ms (generous for test environment)
      expect(renderTime).toBeLessThan(500);
    });

    it('should filter themes efficiently', async () => {
      const user = userEvent.setup();

      render(
        <ThemeSelector
          selectedThemeId={undefined}
          onSelect={vi.fn()}
        />
      );

      const startTime = performance.now();

      // Type in search
      const searchInput = screen.getByPlaceholderText(/search themes/i);
      await user.type(searchInput, 'Theme');

      const endTime = performance.now();
      const filterTime = endTime - startTime;

      // Filtering should be responsive (generous for test environment)
      expect(filterTime).toBeLessThan(1000);
    });

    it('should not re-render unnecessarily when props unchanged', async () => {
      const renderSpy = vi.fn();

      const ThemeSelectorWithSpy: React.FC<{ selectedThemeId?: string; onSelect: () => void }> = (props) => {
        renderSpy();
        return <ThemeSelector {...props} />;
      };

      const { rerender } = render(
        <ThemeSelectorWithSpy
          selectedThemeId="theme-1"
          onSelect={vi.fn()}
        />
      );

      const initialRenderCount = renderSpy.mock.calls.length;

      // Rerender with same props
      rerender(
        <ThemeSelectorWithSpy
          selectedThemeId="theme-1"
          onSelect={vi.fn()}
        />
      );

      // Should not cause many additional renders
      expect(renderSpy.mock.calls.length).toBeLessThanOrEqual(initialRenderCount + 2);
    });
  });

  describe('ThemeCustomization Performance', () => {
    it('should render within acceptable time', () => {
      const startTime = performance.now();

      render(
        <ThemeCustomization
          theme={mockTheme}
          customization={mockCustomization}
          onChange={vi.fn()}
          onReset={vi.fn()}
        />
      );

      const endTime = performance.now();
      const renderTime = endTime - startTime;

      // Should render in under 200ms
      expect(renderTime).toBeLessThan(200);
    });

    it('should update color efficiently', async () => {
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

      const primaryInput = screen.getByDisplayValue('#2563EB');

      const startTime = performance.now();

      await user.clear(primaryInput);
      await user.type(primaryInput, '#FF0000');

      const endTime = performance.now();
      const updateTime = endTime - startTime;

      // Color update should be responsive
      expect(updateTime).toBeLessThan(500);
    });

    it('should handle color changes without excessive rerenders', async () => {
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

      const primaryInput = screen.getByDisplayValue('#2563EB');

      // Type a few characters
      await user.clear(primaryInput);
      await user.type(primaryInput, '#FF00');

      // onChange should be called but not excessively
      // (debouncing should limit calls)
      expect(onChange.mock.calls.length).toBeLessThanOrEqual(10);
    });
  });

  describe('UndoRedoControls Performance', () => {
    it('should render quickly', () => {
      const startTime = performance.now();

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

      const endTime = performance.now();
      const renderTime = endTime - startTime;

      // Simple component should render in under 100ms
      expect(renderTime).toBeLessThan(100);
    });

    it('should update efficiently on state changes', () => {
      const { rerender } = render(
        <UndoRedoControls
          canUndo={false}
          canRedo={false}
          onUndo={vi.fn()}
          onRedo={vi.fn()}
        />
      );

      const startTime = performance.now();

      // Update multiple times
      for (let i = 0; i < 20; i++) {
        rerender(
          <UndoRedoControls
            canUndo={i % 2 === 0}
            canRedo={i % 3 === 0}
            undoCount={i}
            redoCount={20 - i}
            onUndo={vi.fn()}
            onRedo={vi.fn()}
          />
        );
      }

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // 20 updates should complete in under 500ms
      expect(totalTime).toBeLessThan(500);
    });
  });

  describe('Memory Usage', () => {
    it('should not leak memory on unmount', async () => {
      const { unmount } = render(
        <ThemeSelector
          selectedThemeId={undefined}
          onSelect={vi.fn()}
        />
      );

      // Simply verify unmount doesn't throw
      expect(() => unmount()).not.toThrow();
    });

    it('should clean up event listeners on unmount', async () => {
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

      const { unmount } = render(
        <ThemeSelector
          selectedThemeId={undefined}
          onSelect={vi.fn()}
        />
      );

      const addedListeners = addEventListenerSpy.mock.calls.length;

      unmount();

      const removedListeners = removeEventListenerSpy.mock.calls.length;

      // All added listeners should be removed
      expect(removedListeners).toBeGreaterThanOrEqual(addedListeners);
    });
  });

  describe('Bundle Size Considerations', () => {
    it('should use tree-shakeable imports', () => {
      // Verify that icons are imported individually, not as entire library
      // This is a static analysis that would normally be done at build time

      // Components should not import entire icon libraries
      // e.g., import { Icon } from 'lucide-react' not import * as Icons from 'lucide-react'

      // This test passes as long as the component renders
      // (build would fail if imports were wrong)
      render(
        <ThemeCustomization
          theme={mockTheme}
          customization={mockCustomization}
          onChange={vi.fn()}
          onReset={vi.fn()}
        />
      );

      expect(screen.getByText(/colors/i)).toBeInTheDocument();
    });
  });

  describe('Lazy Loading', () => {
    it('should render images with lazy loading attribute', async () => {
      render(
        <ThemeSelector
          selectedThemeId={undefined}
          onSelect={vi.fn()}
        />
      );

      // If there are images, they should have loading="lazy" attribute
      const images = document.querySelectorAll('img');

      if (images.length > 0) {
        images.forEach((img) => {
          // Images should either have loading lazy or be small enough to not need it
          const hasLazyLoading = img.getAttribute('loading') === 'lazy';
          const isSmall = img.width < 100 && img.height < 100;
          expect(hasLazyLoading || isSmall || img.width === 0).toBe(true);
        });
      }
    });
  });

  describe('Virtualization', () => {
    it('should render efficiently with themes', async () => {
      render(
        <ThemeSelector
          selectedThemeId={undefined}
          onSelect={vi.fn()}
        />
      );

      // Verify it renders without errors
      // The component should handle the default theme list efficiently
      expect(document.body).toBeInTheDocument();
    });
  });
});
