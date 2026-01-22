/**
 * Gallery Design Studio - Theme Utilities
 *
 * CSS variable injection and theme application utilities.
 * Enables instant theme switching (<16ms) without React re-renders.
 *
 * Usage:
 * ```tsx
 * const containerRef = useRef<HTMLDivElement>(null);
 * useEffect(() => {
 *   if (containerRef.current) {
 *     applyThemeTokens(containerRef.current, 'brand', 'light', '#0066CC');
 *   }
 * }, [themeId, mode, accentOverride]);
 * ```
 */

import { ThemeId, ThemeMode } from '../types/gallery-design';
import { GALLERY_THEMES } from '../constants/galleryThemes';
import { getThemeEngine } from './ThemeEngine';

// Re-export ThemeEngine for convenience
export { ThemeEngine, getThemeEngine, createThemeEngine } from './ThemeEngine';
export type { ThemeApplicationConfig, ThemeApplicationResult, IThemeEngine } from './ThemeEngine';

/**
 * Get the resolved theme mode (convert 'system' to actual mode)
 */
export const resolveThemeMode = (
  mode: ThemeMode,
  systemPreference?: 'light' | 'dark'
): 'light' | 'dark' => {
  if (mode === 'system') {
    if (systemPreference) {
      return systemPreference;
    }
    // Detect system preference via media query
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  }
  return mode;
};

/**
 * Get current system color scheme preference
 */
export const getSystemColorScheme = (): 'light' | 'dark' => {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

/**
 * Listen for system color scheme changes
 */
export const onSystemColorSchemeChange = (
  callback: (scheme: 'light' | 'dark') => void
): (() => void) => {
  if (typeof window === 'undefined') return () => {};

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  const handler = (e: MediaQueryListEvent) => {
    callback(e.matches ? 'dark' : 'light');
  };

  mediaQuery.addEventListener('change', handler);

  return () => mediaQuery.removeEventListener('change', handler);
};

/**
 * Apply theme tokens to an element via CSS variables
 *
 * @param element - DOM element to apply theme to
 * @param themeId - Theme identifier
 * @param mode - Theme appearance mode (light/dark/system)
 * @param accentColorOverride - Optional accent color override (hex format)
 * @param systemPreference - Explicit system preference (for SSR or testing)
 */
export const applyThemeTokens = (
  element: HTMLElement,
  themeId: ThemeId,
  mode: ThemeMode = 'system',
  accentColorOverride?: string,
  systemPreference?: 'light' | 'dark'
): void => {
  const theme = GALLERY_THEMES[themeId];
  if (!theme) {
    console.warn(`Theme "${themeId}" not found`);
    return;
  }

  // Resolve the actual mode
  const resolvedMode = resolveThemeMode(mode, systemPreference);

  // Get tokens for resolved mode
  const tokens = theme[resolvedMode];

  // Apply all theme tokens
  element.style.setProperty('--bg-primary', tokens.bgPrimary);
  element.style.setProperty('--bg-secondary', tokens.bgSecondary);
  element.style.setProperty('--bg-tertiary', tokens.bgTertiary);
  element.style.setProperty('--text-primary', tokens.textPrimary);
  element.style.setProperty('--text-secondary', tokens.textSecondary);
  element.style.setProperty('--text-tertiary', tokens.textTertiary);
  element.style.setProperty('--border-default', tokens.borderDefault);
  element.style.setProperty('--border-hover', tokens.borderHover);

  // Apply accent colors (with optional override)
  if (accentColorOverride) {
    // Validate hex color
    if (/^#[0-9A-Fa-f]{6}$/.test(accentColorOverride)) {
      element.style.setProperty('--accent-primary', accentColorOverride);
    } else {
      console.warn(`Invalid accent color override: "${accentColorOverride}", using theme default`);
      element.style.setProperty('--accent-primary', tokens.accentPrimary);
    }
  } else {
    element.style.setProperty('--accent-primary', tokens.accentPrimary);
  }

  element.style.setProperty('--accent-secondary', tokens.accentSecondary);

  // Update data attribute for CSS selectors
  element.setAttribute('data-theme-id', themeId);
  element.setAttribute('data-theme-mode', resolvedMode);
};

/**
 * Get CSS variable declarations as a string
 * Useful for inline styles or SSR
 */
export const getThemeTokensString = (
  themeId: ThemeId,
  mode: ThemeMode = 'system',
  accentColorOverride?: string
): string => {
  const theme = GALLERY_THEMES[themeId];
  if (!theme) return '';

  const resolvedMode = resolveThemeMode(mode);
  const tokens = theme[resolvedMode];

  const vars = [
    `--bg-primary: ${tokens.bgPrimary}`,
    `--bg-secondary: ${tokens.bgSecondary}`,
    `--bg-tertiary: ${tokens.bgTertiary}`,
    `--text-primary: ${tokens.textPrimary}`,
    `--text-secondary: ${tokens.textSecondary}`,
    `--text-tertiary: ${tokens.textTertiary}`,
    `--accent-primary: ${accentColorOverride && /^#[0-9A-Fa-f]{6}$/.test(accentColorOverride) ? accentColorOverride : tokens.accentPrimary}`,
    `--accent-secondary: ${tokens.accentSecondary}`,
    `--border-default: ${tokens.borderDefault}`,
    `--border-hover: ${tokens.borderHover}`,
  ];

  return vars.join('; ');
};

/**
 * Generate CSS variable declarations for a specific accent swatch
 *
 * Accent swatches provide alternative color options within a theme
 */
export const getAccentSwatchVariables = (
  themeId: ThemeId,
  swatchName: string,
  mode: 'light' | 'dark' = 'light'
): Record<string, string> => {
  const theme = GALLERY_THEMES[themeId];
  if (!theme) return {};

  const swatch = theme.accentSwatches.find((s) => s.name === swatchName);
  if (!swatch) {
    console.warn(`Accent swatch "${swatchName}" not found in theme "${themeId}"`);
    return {};
  }

  return {
    '--accent-primary': swatch.hex,
    '--accent-hover': swatch.hover,
    '--accent-active': swatch.active,
  };
};

/**
 * Apply accent swatch to element
 */
export const applyAccentSwatch = (
  element: HTMLElement,
  themeId: ThemeId,
  swatchName: string
): void => {
  const variables = getAccentSwatchVariables(themeId, swatchName);
  Object.entries(variables).forEach(([key, value]) => {
    element.style.setProperty(key, value);
  });
};

/**
 * Get all CSS custom properties from element
 * Useful for extracting current theme
 */
export const getAppliedThemeVariables = (element: HTMLElement): Record<string, string> => {
  const styles = getComputedStyle(element);
  const variables: Record<string, string> = {};

  const themeVars = [
    '--bg-primary',
    '--bg-secondary',
    '--bg-tertiary',
    '--text-primary',
    '--text-secondary',
    '--text-tertiary',
    '--accent-primary',
    '--accent-secondary',
    '--border-default',
    '--border-hover',
  ];

  themeVars.forEach((varName) => {
    const value = styles.getPropertyValue(varName).trim();
    if (value) {
      variables[varName] = value;
    }
  });

  return variables;
};

/**
 * Validate if a theme is available in gallery themes
 */
export const isValidThemeId = (id: unknown): id is ThemeId => {
  return typeof id === 'string' && id in GALLERY_THEMES;
};

/**
 * Get all available theme IDs
 */
export const getAvailableThemeIds = (): ThemeId[] => {
  return Object.keys(GALLERY_THEMES) as ThemeId[];
};

/**
 * Hook-compatible function to manage theme with system preference listener
 *
 * Returns cleanup function
 */
export const setupThemeWithSystemPreference = (
  element: HTMLElement,
  themeId: ThemeId,
  mode: ThemeMode,
  accentOverride?: string
): (() => void) => {
  // Apply initial theme
  applyThemeTokens(element, themeId, mode, accentOverride);

  // If mode is 'system', listen for changes
  if (mode === 'system') {
    const unsubscribe = onSystemColorSchemeChange((scheme) => {
      applyThemeTokens(element, themeId, 'system', accentOverride, scheme);
    });

    return unsubscribe;
  }

  return () => {};
};

/**
 * Ensure theme CSS variables have fallback values
 * Call this once in app root to set defaults
 */
export const initializeThemeDefaults = (element: HTMLElement = document.documentElement): void => {
  const defaults = {
    '--bg-primary': '#FFFFFF',
    '--bg-secondary': '#F8FAFB',
    '--bg-tertiary': '#F0F3F7',
    '--text-primary': '#1A202C',
    '--text-secondary': '#4A5568',
    '--text-tertiary': '#718096',
    '--accent-primary': '#0066CC',
    '--accent-secondary': '#00D4FF',
    '--border-default': '#E2E8F0',
    '--border-hover': '#CBD5E0',
  };

  Object.entries(defaults).forEach(([key, value]) => {
    if (!element.style.getPropertyValue(key)) {
      element.style.setProperty(key, value);
    }
  });
};

/**
 * Debug utility: Log current theme variables
 */
export const debugThemeVariables = (element: HTMLElement): void => {
  const themeId = element.getAttribute('data-theme-id');
  const themeMode = element.getAttribute('data-theme-mode');
  const variables = getAppliedThemeVariables(element);

  console.group(`Gallery Theme Debug (${themeId}/${themeMode})`);
  console.table(variables);
  console.groupEnd();
};
