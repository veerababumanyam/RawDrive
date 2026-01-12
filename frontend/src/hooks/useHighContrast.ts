/**
 * useHighContrast Hook - High contrast mode management
 *
 * Provides WCAG AAA compliant high contrast mode with localStorage
 * persistence and system preference detection.
 *
 * Feature: 027-gallery-feature-completion
 * User Story: US3 - High Contrast Mode
 */

import { useCallback, useEffect, useState } from 'react';

/**
 * LocalStorage key for high contrast preference
 */
const STORAGE_KEY = 'rawdrive_high_contrast';

/**
 * CSS class applied to document root for high contrast mode
 */
const HIGH_CONTRAST_CLASS = 'high-contrast';

/**
 * High contrast hook return type
 */
export interface UseHighContrastResult {
  /** Whether high contrast mode is currently enabled */
  isHighContrast: boolean;
  /** Toggle high contrast mode on/off */
  toggleHighContrast: () => void;
  /** Enable high contrast mode */
  enableHighContrast: () => void;
  /** Disable high contrast mode */
  disableHighContrast: () => void;
  /** Set high contrast mode to a specific value */
  setHighContrast: (enabled: boolean) => void;
}

/**
 * Check if user prefers high contrast via system settings
 */
function getSystemPreference(): boolean {
  if (typeof window === 'undefined') return false;

  // Check for Windows High Contrast mode
  const mediaQuery = window.matchMedia('(forced-colors: active)');
  if (mediaQuery.matches) return true;

  // Check for prefers-contrast media query (modern browsers)
  const contrastQuery = window.matchMedia('(prefers-contrast: more)');
  return contrastQuery.matches;
}

/**
 * Get stored preference from localStorage
 */
function getStoredPreference(): boolean | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === null) return null;
    return stored === 'true';
  } catch {
    // localStorage may be blocked in private browsing
    return null;
  }
}

/**
 * Store preference in localStorage
 */
function setStoredPreference(enabled: boolean): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    // localStorage may be blocked in private browsing
  }
}

/**
 * Apply or remove high contrast class from document
 */
function applyHighContrast(enabled: boolean): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;

  if (enabled) {
    root.classList.add(HIGH_CONTRAST_CLASS);
    root.setAttribute('data-high-contrast', 'true');
  } else {
    root.classList.remove(HIGH_CONTRAST_CLASS);
    root.removeAttribute('data-high-contrast');
  }
}

/**
 * Hook for managing high contrast mode
 *
 * @example
 * ```tsx
 * function AccessibilitySettings() {
 *   const { isHighContrast, toggleHighContrast } = useHighContrast();
 *
 *   return (
 *     <button
 *       onClick={toggleHighContrast}
 *       aria-pressed={isHighContrast}
 *     >
 *       High Contrast: {isHighContrast ? 'On' : 'Off'}
 *     </button>
 *   );
 * }
 * ```
 */
export function useHighContrast(): UseHighContrastResult {
  // Initialize state from stored preference or system preference
  const [isHighContrast, setIsHighContrastState] = useState<boolean>(() => {
    const stored = getStoredPreference();
    if (stored !== null) return stored;
    return getSystemPreference();
  });

  // Apply high contrast on mount and when state changes
  useEffect(() => {
    applyHighContrast(isHighContrast);
  }, [isHighContrast]);

  // Listen for system preference changes
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Only apply system preference if user hasn't set a manual preference
    const storedPreference = getStoredPreference();
    if (storedPreference !== null) return;

    const handleContrastChange = (e: MediaQueryListEvent) => {
      setIsHighContrastState(e.matches);
    };

    // Listen for prefers-contrast changes
    const contrastQuery = window.matchMedia('(prefers-contrast: more)');
    contrastQuery.addEventListener('change', handleContrastChange);

    // Listen for forced-colors changes (Windows High Contrast)
    const forcedColorsQuery = window.matchMedia('(forced-colors: active)');
    forcedColorsQuery.addEventListener('change', handleContrastChange);

    return () => {
      contrastQuery.removeEventListener('change', handleContrastChange);
      forcedColorsQuery.removeEventListener('change', handleContrastChange);
    };
  }, []);

  // Set high contrast mode
  const setHighContrast = useCallback((enabled: boolean) => {
    setIsHighContrastState(enabled);
    setStoredPreference(enabled);
  }, []);

  // Toggle high contrast mode
  const toggleHighContrast = useCallback(() => {
    setHighContrast(!isHighContrast);
  }, [isHighContrast, setHighContrast]);

  // Enable high contrast mode
  const enableHighContrast = useCallback(() => {
    setHighContrast(true);
  }, [setHighContrast]);

  // Disable high contrast mode
  const disableHighContrast = useCallback(() => {
    setHighContrast(false);
  }, [setHighContrast]);

  return {
    isHighContrast,
    toggleHighContrast,
    enableHighContrast,
    disableHighContrast,
    setHighContrast,
  };
}

/**
 * Check if high contrast is currently enabled (non-hook version)
 * Useful for server-side rendering or non-React contexts
 */
export function isHighContrastEnabled(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains(HIGH_CONTRAST_CLASS);
}

export default useHighContrast;
