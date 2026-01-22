/**
 * Theme Engine Interface Contract
 *
 * Defines the public interface for the ThemeEngine utility
 * that applies gallery theme tokens to preview containers.
 *
 * Feature: 028-tailwind-v4-design-studio
 */

import type { ThemeId, ThemeMode, GalleryThemeTokens } from '@/types/gallery-design';

/**
 * Configuration for applying a theme to a container
 */
export interface ThemeApplicationConfig {
  /** The theme identifier to apply */
  themeId: ThemeId;

  /** The mode to use (light/dark/system) */
  mode: ThemeMode;

  /** Optional accent color override (hex format) */
  accentOverride?: string;
}

/**
 * Result of applying a theme
 */
export interface ThemeApplicationResult {
  /** Whether the theme was successfully applied */
  success: boolean;

  /** The resolved mode that was applied (system resolves to light/dark) */
  resolvedMode: 'light' | 'dark';

  /** Cleanup function to remove applied styles */
  cleanup: () => void;
}

/**
 * Theme Engine Interface
 *
 * Provides methods to apply gallery themes to DOM containers
 * without affecting the surrounding application chrome.
 */
export interface IThemeEngine {
  /**
   * Apply a theme to a specific container element
   *
   * @param container - The DOM element to apply theme CSS variables to
   * @param config - Theme configuration (themeId, mode, optional accent)
   * @returns Result with cleanup function
   *
   * @example
   * ```typescript
   * const result = themeEngine.applyTheme(previewDiv, {
   *   themeId: 'gold',
   *   mode: 'dark',
   * });
   *
   * // Later, to remove theme:
   * result.cleanup();
   * ```
   */
  applyTheme(
    container: HTMLElement,
    config: ThemeApplicationConfig
  ): ThemeApplicationResult;

  /**
   * Apply theme with system preference detection
   *
   * Sets up a listener for system color scheme changes when mode is 'system'.
   * Automatically switches between light/dark tokens based on user's OS preference.
   *
   * @param container - The DOM element to apply theme CSS variables to
   * @param config - Theme configuration
   * @returns Cleanup function that removes theme AND system preference listener
   *
   * @example
   * ```typescript
   * const cleanup = themeEngine.applyThemeWithSystemPreference(previewDiv, {
   *   themeId: 'brand',
   *   mode: 'system',
   * });
   *
   * // On component unmount:
   * cleanup();
   * ```
   */
  applyThemeWithSystemPreference(
    container: HTMLElement,
    config: ThemeApplicationConfig
  ): () => void;

  /**
   * Get the resolved CSS variables for a theme
   *
   * Returns the CSS variable object without applying to any element.
   * Useful for previewing or debugging theme tokens.
   *
   * @param themeId - The theme to get tokens for
   * @param mode - The mode (light/dark)
   * @returns Object mapping CSS variable names to values
   *
   * @example
   * ```typescript
   * const tokens = themeEngine.getThemeTokens('midnight', 'dark');
   * // tokens = { '--bg-primary': '#0F0E16', '--text-primary': '#F5F3FF', ... }
   * ```
   */
  getThemeTokens(
    themeId: ThemeId,
    mode: 'light' | 'dark'
  ): Record<string, string>;

  /**
   * Check if the current system prefers dark mode
   *
   * @returns true if system prefers dark color scheme
   */
  systemPrefersDark(): boolean;
}

/**
 * CSS Variable mapping from theme tokens
 *
 * Documents how GalleryThemeTokens properties map to CSS variables
 */
export const THEME_TOKEN_TO_CSS_VAR: Record<keyof GalleryThemeTokens, string> = {
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
 * Container query breakpoint definitions
 *
 * Used for responsive preview simulation in Design Studio
 */
export const CONTAINER_BREAKPOINTS = {
  /** Mobile: 0-639px */
  sm: 640,
  /** Tablet: 640-1023px */
  md: 768,
  /** Desktop: 1024px+ */
  lg: 1024,
  /** Large desktop: 1280px+ */
  xl: 1280,
} as const;

/**
 * Preset viewport widths for device simulation
 */
export const VIEWPORT_PRESETS = {
  mobile: { width: 375, height: 667, label: 'iPhone SE' },
  mobileLarge: { width: 428, height: 926, label: 'iPhone 14 Pro Max' },
  tablet: { width: 768, height: 1024, label: 'iPad' },
  tabletLarge: { width: 1024, height: 1366, label: 'iPad Pro' },
  desktop: { width: 1440, height: 900, label: 'Desktop' },
  desktopLarge: { width: 1920, height: 1080, label: 'Full HD' },
} as const;
