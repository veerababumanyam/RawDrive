import { useState, useEffect } from 'react';

type ColorScheme = 'light' | 'dark';

/**
 * Reactively detects the user's preferred color scheme via
 * `prefers-color-scheme` media query.
 *
 * - SSR-safe: returns 'light' when `window` is unavailable.
 * - Initialises synchronously from matchMedia (no flash).
 * - Listens for live changes and updates state.
 */
export function useColorScheme(): ColorScheme {
  const getScheme = (): ColorScheme => {
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  };

  const [scheme, setScheme] = useState<ColorScheme>(getScheme);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      setScheme(e.matches ? 'dark' : 'light');
    };

    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return scheme;
}
