import { useEffect, useMemo, useRef, useState, useCallback } from 'react';

/* =============================================================================
   usePublicProfileTheme Hook

   Manages theme for public profile pages with:
   - System preference detection (prefers-color-scheme)
   - Manual override (toggle/set)
   - localStorage persistence
   - Real-time updates when system preference changes
   ============================================================================= */

export type PublicProfileTheme = 'light' | 'dark';

const STORAGE_KEY = 'rawdrive-public-profile-theme';

const getSystemPreference = (): PublicProfileTheme => {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const readStoredTheme = (): PublicProfileTheme | null => {
  try {
    const stored = window.localStorage?.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch (err) {
    console.warn('[usePublicProfileTheme] Unable to read stored theme', err);
    return null;
  }
};

export const usePublicProfileTheme = () => {
  const initialSystem = getSystemPreference();
  const stored = typeof window !== 'undefined' ? readStoredTheme() : null;

  const [theme, setThemeState] = useState<PublicProfileTheme>(stored ?? initialSystem);
  const [systemPreference, setSystemPreference] = useState<PublicProfileTheme>(initialSystem);
  const [isSystemTheme, setIsSystemTheme] = useState<boolean>(!stored);

  // Keep ref to know if we should follow system changes
  const followSystemRef = useRef<boolean>(!stored);

  const persistTheme = useCallback((next: PublicProfileTheme) => {
    try {
      window.localStorage?.setItem(STORAGE_KEY, next);
    } catch (err) {
      console.warn('[usePublicProfileTheme] Unable to persist theme', err);
    }
  }, []);

  const applyTheme = useCallback(
    (next: PublicProfileTheme) => {
      setThemeState(next);
      setIsSystemTheme(false);
      followSystemRef.current = false;
      persistTheme(next);
    },
    [persistTheme]
  );

  const setTheme = useCallback((next: PublicProfileTheme) => {
    applyTheme(next);
  }, [applyTheme]);

  const toggleTheme = useCallback(() => {
    const next = theme === 'light' ? 'dark' : 'light';
    applyTheme(next);
  }, [theme, applyTheme]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (e: MediaQueryListEvent) => {
      const nextPreference = e.matches ? 'dark' : 'light';
      setSystemPreference(nextPreference);

      if (followSystemRef.current) {
        setThemeState(nextPreference);
        setIsSystemTheme(true);
      }
    };

    // Sync on mount in case preference changed after render
    const currentPreference = mediaQuery.matches ? 'dark' : 'light';
    setSystemPreference(currentPreference);
    if (followSystemRef.current) {
      setThemeState(currentPreference);
      setIsSystemTheme(true);
    }

    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  // Memoize return to avoid churn
  return useMemo(
    () => ({
      theme,
      systemPreference,
      isSystemTheme,
      isDark: theme === 'dark',
      setTheme,
      toggleTheme,
    }),
    [theme, systemPreference, isSystemTheme, setTheme, toggleTheme]
  );
};

export default usePublicProfileTheme;
