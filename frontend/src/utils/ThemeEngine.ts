/**
 * Theme Engine - Gallery Design Studio
 *
 * Implements IThemeEngine interface for isolated theme application
 * to preview containers without affecting the surrounding application.
 *
 * Features:
 * - CSS variable injection to specific containers
 * - System dark mode detection and auto-switching
 * - Debouncing for rapid theme changes (prevents flickering)
 * - Cleanup functions for proper lifecycle management
 *
 * Feature: 028-tailwind-v4-design-studio
 */

import type { ThemeId, ThemeMode, GalleryThemeTokens } from '../types/gallery-design';
import { GALLERY_THEMES } from '../constants/galleryThemes';

// Import interface types (defined locally to avoid circular dependencies)
export interface ThemeApplicationConfig {
  themeId: ThemeId;
  mode: ThemeMode;
  accentOverride?: string;
}

export interface ThemeApplicationResult {
  success: boolean;
  resolvedMode: 'light' | 'dark';
  cleanup: () => void;
}

export interface IThemeEngine {
  applyTheme(container: HTMLElement, config: ThemeApplicationConfig): ThemeApplicationResult;
  applyThemeWithSystemPreference(container: HTMLElement, config: ThemeApplicationConfig): () => void;
  getThemeTokens(themeId: ThemeId, mode: 'light' | 'dark'): Record<string, string>;
  systemPrefersDark(): boolean;
}

/**
 * CSS variable mapping from theme tokens
 */
const THEME_TOKEN_TO_CSS_VAR: Record<keyof GalleryThemeTokens, string> = {
  bgPrimary: '--bg-primary',
  bgSecondary: '--bg-secondary',
  bgTertiary: '--bg-tertiary',
  textPrimary: '--text-primary',
  textSecondary: '--text-secondary',
  textTertiary: '--text-tertiary',
  accentPrimary: '--accent-primary',
  accentSecondary: '--accent-secondary',
  borderDefault: '--border-default',
  borderHover: '--border-hover',
};

/**
 * ThemeEngine class
 *
 * Provides isolated theme application to DOM containers
 * with debouncing and system preference detection.
 */
export class ThemeEngine implements IThemeEngine {
  private debounceTimers: Map<HTMLElement, number> = new Map();
  private debounceDelay: number;

  /**
   * Create a new ThemeEngine instance
   * @param debounceMs - Debounce delay in milliseconds (default: 50ms)
   */
  constructor(debounceMs: number = 50) {
    this.debounceDelay = debounceMs;
  }

  /**
   * Resolve 'system' mode to actual light/dark based on system preference
   */
  private resolveMode(mode: ThemeMode): 'light' | 'dark' {
    if (mode === 'system') {
      return this.systemPrefersDark() ? 'dark' : 'light';
    }
    return mode;
  }

  /**
   * Apply CSS variables to an element
   */
  private applyTokensToElement(
    element: HTMLElement,
    tokens: GalleryThemeTokens,
    accentOverride?: string
  ): void {
    // Apply all theme tokens as CSS variables
    Object.entries(THEME_TOKEN_TO_CSS_VAR).forEach(([tokenKey, cssVar]) => {
      const value = tokens[tokenKey as keyof GalleryThemeTokens];
      element.style.setProperty(cssVar, value);
    });

    // Handle accent color override
    if (accentOverride && /^#[0-9A-Fa-f]{6}$/.test(accentOverride)) {
      element.style.setProperty('--accent-primary', accentOverride);
    }
  }

  /**
   * Remove theme CSS variables from an element
   */
  private removeTokensFromElement(element: HTMLElement): void {
    Object.values(THEME_TOKEN_TO_CSS_VAR).forEach((cssVar) => {
      element.style.removeProperty(cssVar);
    });
    element.removeAttribute('data-theme-id');
    element.removeAttribute('data-theme-mode');
  }

  /**
   * Apply a theme to a specific container element
   */
  applyTheme(
    container: HTMLElement,
    config: ThemeApplicationConfig
  ): ThemeApplicationResult {
    const { themeId, mode, accentOverride } = config;

    // Get theme definition
    const theme = GALLERY_THEMES[themeId];
    if (!theme) {
      console.warn(`ThemeEngine: Theme "${themeId}" not found`);
      return {
        success: false,
        resolvedMode: 'light',
        cleanup: () => {},
      };
    }

    // Resolve the actual mode
    const resolvedMode = this.resolveMode(mode);

    // Get tokens for resolved mode
    const tokens = theme[resolvedMode];

    // Apply tokens to container
    this.applyTokensToElement(container, tokens, accentOverride);

    // Set data attributes for CSS selectors
    container.setAttribute('data-theme-id', themeId);
    container.setAttribute('data-theme-mode', resolvedMode);

    // Create cleanup function
    const cleanup = () => {
      this.removeTokensFromElement(container);
    };

    return {
      success: true,
      resolvedMode,
      cleanup,
    };
  }

  /**
   * Apply theme with system preference detection
   * Sets up a listener for system color scheme changes when mode is 'system'
   */
  applyThemeWithSystemPreference(
    container: HTMLElement,
    config: ThemeApplicationConfig
  ): () => void {
    const { themeId, mode, accentOverride } = config;

    // Clear any existing debounce timer for this container
    const existingTimer = this.debounceTimers.get(container);
    if (existingTimer !== undefined) {
      window.clearTimeout(existingTimer);
    }

    // Debounced theme application
    const applyWithDebounce = () => {
      const timer = window.setTimeout(() => {
        this.applyTheme(container, { themeId, mode, accentOverride });
        this.debounceTimers.delete(container);
      }, this.debounceDelay);

      this.debounceTimers.set(container, timer);
    };

    // Apply initial theme (immediate, no debounce)
    this.applyTheme(container, { themeId, mode, accentOverride });

    // If mode is 'system', set up listener for system preference changes
    let mediaQueryListener: (() => void) | null = null;

    if (mode === 'system' && typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

      const handleChange = () => {
        // Use debounced application for system changes
        applyWithDebounce();
      };

      mediaQuery.addEventListener('change', handleChange);

      mediaQueryListener = () => {
        mediaQuery.removeEventListener('change', handleChange);
      };
    }

    // Return cleanup function
    return () => {
      // Clear any pending debounce timer
      const timer = this.debounceTimers.get(container);
      if (timer !== undefined) {
        window.clearTimeout(timer);
        this.debounceTimers.delete(container);
      }

      // Remove media query listener
      if (mediaQueryListener) {
        mediaQueryListener();
      }

      // Remove theme from container
      this.removeTokensFromElement(container);
    };
  }

  /**
   * Get the resolved CSS variables for a theme
   * Returns the CSS variable object without applying to any element
   */
  getThemeTokens(
    themeId: ThemeId,
    mode: 'light' | 'dark'
  ): Record<string, string> {
    const theme = GALLERY_THEMES[themeId];
    if (!theme) {
      console.warn(`ThemeEngine: Theme "${themeId}" not found`);
      return {};
    }

    const tokens = theme[mode];
    const result: Record<string, string> = {};

    Object.entries(THEME_TOKEN_TO_CSS_VAR).forEach(([tokenKey, cssVar]) => {
      result[cssVar] = tokens[tokenKey as keyof GalleryThemeTokens];
    });

    return result;
  }

  /**
   * Check if the current system prefers dark mode
   */
  systemPrefersDark(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  /**
   * Update debounce delay
   */
  setDebounceDelay(ms: number): void {
    this.debounceDelay = Math.max(0, Math.min(ms, 500));
  }

  /**
   * Get current debounce delay
   */
  getDebounceDelay(): number {
    return this.debounceDelay;
  }
}

// Singleton instance for convenience
let defaultInstance: ThemeEngine | null = null;

/**
 * Get the default ThemeEngine instance (singleton)
 */
export const getThemeEngine = (): ThemeEngine => {
  if (!defaultInstance) {
    defaultInstance = new ThemeEngine(50);
  }
  return defaultInstance;
};

/**
 * Create a new ThemeEngine instance with custom debounce delay
 */
export const createThemeEngine = (debounceMs: number = 50): ThemeEngine => {
  return new ThemeEngine(debounceMs);
};

export default ThemeEngine;
