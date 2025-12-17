import { useState, useEffect } from 'react';

/* =============================================================================
   useReducedMotion Hook

   Detects user's reduced motion preference and respects accessibility settings.
   Returns true if the user prefers reduced motion.
   ============================================================================= */

export const useReducedMotion = (): boolean => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    // Check if window is available (for SSR compatibility)
    if (typeof window === 'undefined') return false;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    return mediaQuery.matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    // Modern browsers
    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  return prefersReducedMotion;
};

export default useReducedMotion;
