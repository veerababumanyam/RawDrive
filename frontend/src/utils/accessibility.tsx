/**
 * Accessibility Utilities
 *
 * Provides hooks and utilities for improved accessibility:
 * - Focus management
 * - Keyboard navigation
 * - Screen reader announcements
 * - High contrast mode detection
 * - Reduced motion preferences
 *
 * Feature: 016-save-the-date Phase 13
 */

import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Hook to detect user's high contrast mode preference
 */
export const useHighContrastMode = (): boolean => {
  const [isHighContrast, setIsHighContrast] = useState(false);

  useEffect(() => {
    // Check for forced-colors media query (Windows High Contrast)
    const mediaQuery = window.matchMedia('(forced-colors: active)');
    setIsHighContrast(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setIsHighContrast(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return isHighContrast;
};

/**
 * Hook to detect user's reduced motion preference
 */
export const useReducedMotion = (): boolean => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return prefersReducedMotion;
};

/**
 * Hook to manage focus trap within a container
 */
export const useFocusTrap = (isActive: boolean = true) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    const container = containerRef.current;
    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    firstElement?.focus();

    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [isActive]);

  return containerRef;
};

/**
 * Hook for keyboard navigation in lists/grids
 */
export const useArrowKeyNavigation = (
  itemCount: number,
  options: {
    orientation?: 'horizontal' | 'vertical' | 'both';
    wrap?: boolean;
    onSelect?: (index: number) => void;
  } = {}
) => {
  const { orientation = 'vertical', wrap = true, onSelect } = options;
  const [focusedIndex, setFocusedIndex] = useState(0);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      let newIndex = focusedIndex;

      switch (e.key) {
        case 'ArrowUp':
          if (orientation === 'horizontal') return;
          e.preventDefault();
          newIndex = focusedIndex - 1;
          break;
        case 'ArrowDown':
          if (orientation === 'horizontal') return;
          e.preventDefault();
          newIndex = focusedIndex + 1;
          break;
        case 'ArrowLeft':
          if (orientation === 'vertical') return;
          e.preventDefault();
          newIndex = focusedIndex - 1;
          break;
        case 'ArrowRight':
          if (orientation === 'vertical') return;
          e.preventDefault();
          newIndex = focusedIndex + 1;
          break;
        case 'Home':
          e.preventDefault();
          newIndex = 0;
          break;
        case 'End':
          e.preventDefault();
          newIndex = itemCount - 1;
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          onSelect?.(focusedIndex);
          return;
        default:
          return;
      }

      if (wrap) {
        if (newIndex < 0) newIndex = itemCount - 1;
        if (newIndex >= itemCount) newIndex = 0;
      } else {
        newIndex = Math.max(0, Math.min(itemCount - 1, newIndex));
      }

      setFocusedIndex(newIndex);
    },
    [focusedIndex, itemCount, orientation, wrap, onSelect]
  );

  return { focusedIndex, setFocusedIndex, handleKeyDown };
};

/**
 * Screen reader announcer - announces messages to assistive technology
 */
let announcer: HTMLDivElement | null = null;

const getAnnouncer = (): HTMLDivElement => {
  if (announcer) return announcer;

  announcer = document.createElement('div');
  announcer.setAttribute('aria-live', 'polite');
  announcer.setAttribute('aria-atomic', 'true');
  announcer.setAttribute('role', 'status');
  announcer.style.cssText = `
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  `;
  document.body.appendChild(announcer);
  return announcer;
};

export const announce = (message: string, priority: 'polite' | 'assertive' = 'polite') => {
  const el = getAnnouncer();
  el.setAttribute('aria-live', priority);
  
  // Clear and set message to trigger announcement
  el.textContent = '';
  requestAnimationFrame(() => {
    el.textContent = message;
  });
};

/**
 * Hook for announcing dynamic content changes
 */
export const useAnnouncer = () => {
  return useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    announce(message, priority);
  }, []);
};

/**
 * Skip link for keyboard navigation
 */
export const SkipLink: React.FC<{ targetId: string; children: React.ReactNode }> = ({
  targetId,
  children,
}) => {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const target = document.getElementById(targetId);
    if (target) {
      target.focus();
      target.scrollIntoView();
    }
  };

  return (
    <a
      href={`#${targetId}`}
      onClick={handleClick}
      className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-primary focus:text-white focus:top-0 focus:left-0"
    >
      {children}
    </a>
  );
};

/**
 * Visually hidden component for screen readers only
 */
export const VisuallyHidden: React.FC<{
  children: React.ReactNode;
  as?: keyof JSX.IntrinsicElements;
}> = ({ children, as: Component = 'span' }) => {
  return (
    <Component className="sr-only">
      {children}
    </Component>
  );
};

/**
 * Hook to manage document title with suffix
 */
export const useDocumentTitle = (title: string, suffix: string = 'Digital Invitations') => {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title ? `${title} | ${suffix}` : suffix;
    return () => {
      document.title = previousTitle;
    };
  }, [title, suffix]);
};

/**
 * Get color with sufficient contrast
 */
export const ensureContrastRatio = (
  foreground: string,
  background: string,
  targetRatio: number = 4.5
): string => {
  // Parse hex colors
  const hexToRgb = (hex: string): [number, number, number] => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
      : [0, 0, 0];
  };

  // Calculate relative luminance
  const getLuminance = (r: number, g: number, b: number): number => {
    const [rs, gs, bs] = [r, g, b].map((c) => {
      c = c / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  };

  // Calculate contrast ratio
  const getContrastRatio = (l1: number, l2: number): number => {
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  };

  const fgRgb = hexToRgb(foreground);
  const bgRgb = hexToRgb(background);
  const fgLum = getLuminance(...fgRgb);
  const bgLum = getLuminance(...bgRgb);
  const ratio = getContrastRatio(fgLum, bgLum);

  if (ratio >= targetRatio) {
    return foreground;
  }

  // Return black or white based on background luminance
  return bgLum > 0.5 ? '#000000' : '#ffffff';
};

export default {
  useHighContrastMode,
  useReducedMotion,
  useFocusTrap,
  useArrowKeyNavigation,
  announce,
  useAnnouncer,
  SkipLink,
  VisuallyHidden,
  useDocumentTitle,
  ensureContrastRatio,
};
