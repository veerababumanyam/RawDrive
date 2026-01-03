import { useState, useEffect } from 'react';

/* =============================================================================
   usePublicTheme Hook (Auto-Detection Only)

   A simple theme hook for public-facing pages that automatically detects
   the user's system preference (prefers-color-scheme) and responds to changes.

   Features:
   - Automatic system preference detection
   - Real-time updates when user changes system theme
   - No manual toggle or localStorage persistence (follows system only)

   Used by:
   - usePublicProfileTheme (for /p/{slug} pages)
   - usePublicInvitationTheme (for /i/{token} pages)
   ============================================================================= */

export type PublicTheme = 'light' | 'dark';

interface UsePublicThemeReturn {
  /** Current theme ('light' or 'dark') based on system preference */
  theme: PublicTheme;
  /** Whether dark mode is active */
  isDark: boolean;
}

/**
 * Get the system's preferred color scheme
 */
const getSystemPreference = (): PublicTheme => {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

/**
 * Hook for automatically detecting system theme preference on public pages.
 * The theme will automatically update when the user changes their system settings.
 *
 * @example
 * ```tsx
 * const { theme, isDark } = usePublicTheme();
 *
 * return (
 *   <div data-theme={theme} className={isDark ? 'dark' : ''}>
 *     <Content />
 *   </div>
 * );
 * ```
 */
export const usePublicTheme = (): UsePublicThemeReturn => {
  const [theme, setTheme] = useState<PublicTheme>(() => getSystemPreference());

  // Listen for system preference changes
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (e: MediaQueryListEvent) => {
      setTheme(e.matches ? 'dark' : 'light');
    };

    // Set initial value (in case it changed during SSR)
    setTheme(mediaQuery.matches ? 'dark' : 'light');

    // Listen for changes
    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  return {
    theme,
    isDark: theme === 'dark',
  };
};

export default usePublicTheme;
