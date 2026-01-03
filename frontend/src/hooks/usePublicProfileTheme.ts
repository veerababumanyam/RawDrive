import { useState, useEffect, useCallback } from 'react';

/* =============================================================================
   usePublicProfileTheme Hook

   Manages theme (light/dark) for public profile pages with:
   - System preference detection (prefers-color-scheme)
   - Manual toggle support
   - localStorage persistence per profile
   
   This is separate from the main app theme to allow public profiles
   to have independent theme control.
   ============================================================================= */

export type PublicProfileTheme = 'light' | 'dark';

interface UsePublicProfileThemeReturn {
  /** Current theme ('light' or 'dark') */
  theme: PublicProfileTheme;
  /** Set the theme explicitly */
  setTheme: (theme: PublicProfileTheme) => void;
  /** Toggle between light and dark */
  toggleTheme: () => void;
  /** Whether the current theme matches system preference */
  isSystemTheme: boolean;
  /** The system's color scheme preference */
  systemPreference: PublicProfileTheme;
}

const STORAGE_KEY = 'rawdrive-public-profile-theme';

/**
 * Get the system's preferred color scheme
 */
const getSystemPreference = (): PublicProfileTheme => {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

/**
 * Get stored theme preference from localStorage
 */
const getStoredTheme = (): PublicProfileTheme | null => {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
  } catch {
    // localStorage not available
  }
  return null;
};

/**
 * Store theme preference in localStorage
 */
const storeTheme = (theme: PublicProfileTheme): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // localStorage not available
  }
};

/**
 * Hook for managing public profile page theme
 * 
 * @example
 * ```tsx
 * const { theme, toggleTheme } = usePublicProfileTheme();
 * 
 * return (
 *   <div data-theme={theme}>
 *     <button onClick={toggleTheme}>Toggle Theme</button>
 *   </div>
 * );
 * ```
 */
export const usePublicProfileTheme = (): UsePublicProfileThemeReturn => {
  // Initialize with stored preference or system preference
  const [systemPreference, setSystemPreference] = useState<PublicProfileTheme>(
    () => getSystemPreference()
  );
  
  const [manualTheme, setManualTheme] = useState<PublicProfileTheme | null>(
    () => getStoredTheme()
  );

  // Effective theme: manual preference takes precedence over system
  const theme: PublicProfileTheme = manualTheme ?? systemPreference;
  const isSystemTheme = manualTheme === null;

  // Listen for system preference changes
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemPreference(e.matches ? 'dark' : 'light');
    };

    // Modern browsers
    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  // Set theme explicitly
  const setTheme = useCallback((newTheme: PublicProfileTheme) => {
    setManualTheme(newTheme);
    storeTheme(newTheme);
  }, []);

  // Toggle between light and dark
  const toggleTheme = useCallback(() => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setManualTheme(newTheme);
    storeTheme(newTheme);
  }, [theme]);

  return {
    theme,
    setTheme,
    toggleTheme,
    isSystemTheme,
    systemPreference,
  };
};

export default usePublicProfileTheme;
