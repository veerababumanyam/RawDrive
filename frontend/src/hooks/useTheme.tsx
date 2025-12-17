import { useState, useEffect, useCallback } from 'react';

/* =============================================================================
   useTheme Hook

   Manages the application theme (light/dark mode) with system preference
   detection and localStorage persistence.
   ============================================================================= */

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface UseThemeReturn {
  /** Current theme setting ('light', 'dark', or 'system') */
  theme: Theme;
  /** Resolved theme value ('light' or 'dark') */
  resolvedTheme: ResolvedTheme;
  /** Set the theme */
  setTheme: (theme: Theme) => void;
  /** Toggle between light and dark */
  toggleTheme: () => void;
  /** Check if dark mode is active */
  isDark: boolean;
  /** System preference */
  systemTheme: ResolvedTheme;
}

const STORAGE_KEY = 'rawdrive-theme';

const getSystemTheme = (): ResolvedTheme => {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const getStoredTheme = (): Theme | null => {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }
  return null;
};

const applyTheme = (resolvedTheme: ResolvedTheme) => {
  const root = document.documentElement;

  // Remove existing theme
  root.removeAttribute('data-theme');

  // Apply new theme
  root.setAttribute('data-theme', resolvedTheme);

  // Update meta theme-color for mobile browsers
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute(
      'content',
      resolvedTheme === 'dark' ? '#0F172A' : '#F8FAFC'
    );
  }
};

export const useTheme = (defaultTheme: Theme = 'system'): UseThemeReturn => {
  const [theme, setThemeState] = useState<Theme>(() => {
    return getStoredTheme() || defaultTheme;
  });

  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => getSystemTheme());

  // Calculate resolved theme
  const resolvedTheme: ResolvedTheme = theme === 'system' ? systemTheme : theme;
  const isDark = resolvedTheme === 'dark';

  // Apply theme to document
  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  // Listen for system preference changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Set theme with persistence
  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem(STORAGE_KEY, newTheme);
  }, []);

  // Toggle between light and dark
  const toggleTheme = useCallback(() => {
    const newTheme: Theme = resolvedTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
  }, [resolvedTheme, setTheme]);

  return {
    theme,
    resolvedTheme,
    setTheme,
    toggleTheme,
    isDark,
    systemTheme,
  };
};

/* =============================================================================
   ThemeProvider Component (Optional Context-based approach)
   ============================================================================= */

import React, { createContext, useContext, ReactNode } from 'react';

interface ThemeContextType extends UseThemeReturn {}

const ThemeContext = createContext<ThemeContextType | null>(null);

export interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  defaultTheme = 'system',
}) => {
  const themeState = useTheme(defaultTheme);

  return (
    <ThemeContext.Provider value={themeState}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useThemeContext = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeContext must be used within a ThemeProvider');
  }
  return context;
};

export default useTheme;
