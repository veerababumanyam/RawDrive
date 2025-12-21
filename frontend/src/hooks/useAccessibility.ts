/**
 * Accessibility Hooks
 *
 * Collection of hooks for ensuring WCAG 2.1 AA compliance
 * in the profile editor including focus management, screen
 * reader announcements, and keyboard navigation.
 *
 * Requirements: 12.1, 12.3, 12.4, 12.7, 12.8, 12.9
 */

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';

// =============================================================================
// Types
// =============================================================================

export interface FocusTrapOptions {
  /** Initial focus element selector */
  initialFocus?: string;
  /** Return focus to element when trap is released */
  returnFocus?: boolean;
  /** Allow escape key to release trap */
  escapeDeactivates?: boolean;
  /** Callback when escape is pressed */
  onEscape?: () => void;
}

export interface LiveRegionOptions {
  /** Politeness level */
  politeness?: 'polite' | 'assertive';
  /** Clear message after timeout (ms) */
  clearAfter?: number;
}

export interface KeyboardNavigationOptions {
  /** Orientation for arrow key navigation */
  orientation?: 'horizontal' | 'vertical' | 'both';
  /** Wrap around at ends */
  wrap?: boolean;
  /** Allow home/end keys */
  allowHomeEnd?: boolean;
}

export interface ContrastCheckResult {
  ratio: number;
  passes: {
    aa: boolean;
    aaLarge: boolean;
    aaa: boolean;
    aaaLarge: boolean;
  };
}

// =============================================================================
// useFocusTrap Hook
// =============================================================================

/**
 * Trap focus within a container (for modals, dialogs)
 * Requirement 12.4: Focus management
 */
export function useFocusTrap(
  isActive: boolean,
  options: FocusTrapOptions = {}
): React.RefObject<HTMLDivElement> {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    // Store previous focus
    previousFocusRef.current = document.activeElement as HTMLElement;

    // Get focusable elements
    const getFocusableElements = (): HTMLElement[] => {
      if (!containerRef.current) return [];
      const selector =
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
      return Array.from(
        containerRef.current.querySelectorAll<HTMLElement>(selector)
      ).filter(
        (el) => !el.hasAttribute('disabled') && el.offsetParent !== null
      );
    };

    // Set initial focus
    const focusableElements = getFocusableElements();
    if (options.initialFocus) {
      const initialElement = containerRef.current?.querySelector<HTMLElement>(
        options.initialFocus
      );
      initialElement?.focus();
    } else if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }

    // Handle tab key
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const focusable = getFocusableElements();
        if (focusable.length === 0) return;

        const firstElement = focusable[0];
        const lastElement = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }

      if (e.key === 'Escape' && options.escapeDeactivates !== false) {
        options.onEscape?.();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);

      // Return focus
      if (options.returnFocus !== false && previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
    };
  }, [isActive, options]);

  return containerRef;
}

// =============================================================================
// useLiveRegion Hook
// =============================================================================

/**
 * Announce messages to screen readers
 * Requirement 12.3: Screen reader announcements
 */
export function useLiveRegion(
  options: LiveRegionOptions = {}
): {
  announce: (message: string) => void;
  clear: () => void;
  regionProps: {
    role: string;
    'aria-live': 'polite' | 'assertive';
    'aria-atomic': boolean;
  };
  message: string;
} {
  const { politeness = 'polite', clearAfter = 5000 } = options;
  const [message, setMessage] = useState('');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const announce = useCallback(
    (newMessage: string) => {
      // Clear any pending timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Clear and set to force re-announcement
      setMessage('');
      requestAnimationFrame(() => {
        setMessage(newMessage);
      });

      // Auto-clear after timeout
      if (clearAfter > 0) {
        timeoutRef.current = setTimeout(() => {
          setMessage('');
        }, clearAfter);
      }
    },
    [clearAfter]
  );

  const clear = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setMessage('');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const regionProps = useMemo(
    () => ({
      role: 'status' as const,
      'aria-live': politeness,
      'aria-atomic': true as const,
    }),
    [politeness]
  );

  return { announce, clear, regionProps, message };
}

// =============================================================================
// useKeyboardNavigation Hook
// =============================================================================

/**
 * Keyboard navigation for lists and grids
 * Requirement 12.4: Keyboard navigation support
 */
export function useKeyboardNavigation<T extends HTMLElement>(
  itemsCount: number,
  options: KeyboardNavigationOptions = {}
): {
  currentIndex: number;
  setCurrentIndex: (index: number) => void;
  getItemProps: (index: number) => {
    tabIndex: number;
    onKeyDown: (e: React.KeyboardEvent) => void;
    ref: (el: T | null) => void;
    'aria-selected': boolean;
  };
  focusItem: (index: number) => void;
} {
  const { orientation = 'vertical', wrap = true, allowHomeEnd = true } = options;
  const [currentIndex, setCurrentIndex] = useState(0);
  const itemsRef = useRef<Map<number, T>>(new Map());

  const focusItem = useCallback((index: number) => {
    const item = itemsRef.current.get(index);
    item?.focus();
  }, []);

  const navigate = useCallback(
    (direction: 'prev' | 'next' | 'first' | 'last') => {
      let newIndex = currentIndex;

      switch (direction) {
        case 'prev':
          newIndex = currentIndex - 1;
          if (newIndex < 0) {
            newIndex = wrap ? itemsCount - 1 : 0;
          }
          break;
        case 'next':
          newIndex = currentIndex + 1;
          if (newIndex >= itemsCount) {
            newIndex = wrap ? 0 : itemsCount - 1;
          }
          break;
        case 'first':
          newIndex = 0;
          break;
        case 'last':
          newIndex = itemsCount - 1;
          break;
      }

      setCurrentIndex(newIndex);
      focusItem(newIndex);
    },
    [currentIndex, itemsCount, wrap, focusItem]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      let handled = false;

      switch (e.key) {
        case 'ArrowUp':
          if (orientation === 'vertical' || orientation === 'both') {
            navigate('prev');
            handled = true;
          }
          break;
        case 'ArrowDown':
          if (orientation === 'vertical' || orientation === 'both') {
            navigate('next');
            handled = true;
          }
          break;
        case 'ArrowLeft':
          if (orientation === 'horizontal' || orientation === 'both') {
            navigate('prev');
            handled = true;
          }
          break;
        case 'ArrowRight':
          if (orientation === 'horizontal' || orientation === 'both') {
            navigate('next');
            handled = true;
          }
          break;
        case 'Home':
          if (allowHomeEnd) {
            navigate('first');
            handled = true;
          }
          break;
        case 'End':
          if (allowHomeEnd) {
            navigate('last');
            handled = true;
          }
          break;
      }

      if (handled) {
        e.preventDefault();
      }
    },
    [orientation, allowHomeEnd, navigate]
  );

  const getItemProps = useCallback(
    (index: number) => ({
      tabIndex: index === currentIndex ? 0 : -1,
      onKeyDown: handleKeyDown,
      ref: (el: T | null) => {
        if (el) {
          itemsRef.current.set(index, el);
        } else {
          itemsRef.current.delete(index);
        }
      },
      'aria-selected': index === currentIndex,
    }),
    [currentIndex, handleKeyDown]
  );

  return {
    currentIndex,
    setCurrentIndex,
    getItemProps,
    focusItem,
  };
}

// =============================================================================
// useReducedMotion Hook
// =============================================================================

/**
 * Detect user's motion preference
 * Requirement 12.8: Respect reduced motion preferences
 */
export function useReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return prefersReducedMotion;
}

// =============================================================================
// useColorContrast Hook
// =============================================================================

/**
 * Check color contrast ratios for WCAG compliance
 * Requirement 12.1: WCAG 2.1 AA compliance
 */
export function useColorContrast(): {
  checkContrast: (foreground: string, background: string) => ContrastCheckResult;
  getSuggestions: (foreground: string, background: string) => string[];
} {
  const parseColor = useCallback((color: string): [number, number, number] => {
    // Remove # if present
    const hex = color.replace('#', '');

    // Handle shorthand hex
    const fullHex =
      hex.length === 3
        ? hex
            .split('')
            .map((c) => c + c)
            .join('')
        : hex;

    const r = parseInt(fullHex.slice(0, 2), 16);
    const g = parseInt(fullHex.slice(2, 4), 16);
    const b = parseInt(fullHex.slice(4, 6), 16);

    return [r, g, b];
  }, []);

  const getLuminance = useCallback((r: number, g: number, b: number): number => {
    const [rs, gs, bs] = [r, g, b].map((c) => {
      const sRGB = c / 255;
      return sRGB <= 0.03928
        ? sRGB / 12.92
        : Math.pow((sRGB + 0.055) / 1.055, 2.4);
    });

    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  }, []);

  const getContrastRatio = useCallback(
    (color1: string, color2: string): number => {
      const [r1, g1, b1] = parseColor(color1);
      const [r2, g2, b2] = parseColor(color2);

      const l1 = getLuminance(r1, g1, b1);
      const l2 = getLuminance(r2, g2, b2);

      const lighter = Math.max(l1, l2);
      const darker = Math.min(l1, l2);

      return (lighter + 0.05) / (darker + 0.05);
    },
    [parseColor, getLuminance]
  );

  const checkContrast = useCallback(
    (foreground: string, background: string): ContrastCheckResult => {
      const ratio = getContrastRatio(foreground, background);

      return {
        ratio,
        passes: {
          aa: ratio >= 4.5,
          aaLarge: ratio >= 3,
          aaa: ratio >= 7,
          aaaLarge: ratio >= 4.5,
        },
      };
    },
    [getContrastRatio]
  );

  const getSuggestions = useCallback(
    (foreground: string, background: string): string[] => {
      const result = checkContrast(foreground, background);
      const suggestions: string[] = [];

      if (!result.passes.aa) {
        const [r, g, b] = parseColor(foreground);
        const [br, bg, bb] = parseColor(background);

        // Suggest darker or lighter foreground
        const bgLum = getLuminance(br, bg, bb);
        if (bgLum > 0.5) {
          suggestions.push('Try a darker foreground color');
          // Calculate suggested dark color
          const darkerFg = `#${Math.max(0, r - 50)
            .toString(16)
            .padStart(2, '0')}${Math.max(0, g - 50)
            .toString(16)
            .padStart(2, '0')}${Math.max(0, b - 50)
            .toString(16)
            .padStart(2, '0')}`;
          suggestions.push(`Suggested: ${darkerFg}`);
        } else {
          suggestions.push('Try a lighter foreground color');
          const lighterFg = `#${Math.min(255, r + 50)
            .toString(16)
            .padStart(2, '0')}${Math.min(255, g + 50)
            .toString(16)
            .padStart(2, '0')}${Math.min(255, b + 50)
            .toString(16)
            .padStart(2, '0')}`;
          suggestions.push(`Suggested: ${lighterFg}`);
        }
      }

      return suggestions;
    },
    [checkContrast, parseColor, getLuminance]
  );

  return { checkContrast, getSuggestions };
}

// =============================================================================
// useSkipLink Hook
// =============================================================================

/**
 * Create skip link for keyboard users
 * Requirement 12.4: Skip navigation support
 */
export function useSkipLink(
  targetId: string
): {
  skipLinkProps: {
    href: string;
    onClick: (e: React.MouseEvent) => void;
    className: string;
  };
  targetProps: {
    id: string;
    tabIndex: number;
  };
} {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const target = document.getElementById(targetId);
      if (target) {
        target.focus();
        target.scrollIntoView({ behavior: 'smooth' });
      }
    },
    [targetId]
  );

  return {
    skipLinkProps: {
      href: `#${targetId}`,
      onClick: handleClick,
      className:
        'sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-3 focus:bg-accent focus:text-white focus:rounded-md',
    },
    targetProps: {
      id: targetId,
      tabIndex: -1,
    },
  };
}

// =============================================================================
// useFocusVisible Hook
// =============================================================================

/**
 * Detect if focus should be visible (keyboard navigation)
 */
export function useFocusVisible(): boolean {
  const [focusVisible, setFocusVisible] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        setFocusVisible(true);
      }
    };

    const handleMouseDown = () => {
      setFocusVisible(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, []);

  return focusVisible;
}

// =============================================================================
// useZoomLevel Hook
// =============================================================================

/**
 * Detect browser zoom level
 * Requirement 12.7: Support browser zoom to 200%
 */
export function useZoomLevel(): number {
  const [zoomLevel, setZoomLevel] = useState(100);

  useEffect(() => {
    const updateZoom = () => {
      const zoom = Math.round(window.devicePixelRatio * 100);
      setZoomLevel(zoom);
    };

    updateZoom();

    // Listen for resize (zoom changes trigger resize)
    window.addEventListener('resize', updateZoom);
    return () => window.removeEventListener('resize', updateZoom);
  }, []);

  return zoomLevel;
}

// =============================================================================
// useAltText Hook
// =============================================================================

/**
 * Generate accessible alt text for images
 * Requirement 12.9: Image alt text
 */
export function useAltText(): {
  generateAltText: (context: {
    type: 'logo' | 'photo' | 'icon' | 'decorative';
    label?: string;
    description?: string;
  }) => string;
} {
  const generateAltText = useCallback(
    (context: {
      type: 'logo' | 'photo' | 'icon' | 'decorative';
      label?: string;
      description?: string;
    }): string => {
      const { type, label, description } = context;

      // Decorative images should have empty alt
      if (type === 'decorative') {
        return '';
      }

      // If description provided, use it
      if (description) {
        return description;
      }

      // Generate based on type
      switch (type) {
        case 'logo':
          return label ? `${label} logo` : 'Company logo';
        case 'photo':
          return label || 'Photo';
        case 'icon':
          return label || 'Icon';
        default:
          return label || 'Image';
      }
    },
    []
  );

  return { generateAltText };
}
