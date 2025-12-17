import { useRef, useEffect, useCallback } from 'react';

/* =============================================================================
   useFocusTrap Hook

   Traps focus within a container element for accessibility (e.g., modals).
   Ensures keyboard users cannot tab outside the container.
   ============================================================================= */

interface UseFocusTrapOptions {
  /** Whether focus trap is active */
  enabled?: boolean;
  /** Callback when Escape key is pressed */
  onEscape?: () => void;
  /** Return focus to trigger element on deactivation */
  returnFocusOnDeactivate?: boolean;
}

export const useFocusTrap = <T extends HTMLElement = HTMLDivElement>(
  options: UseFocusTrapOptions = {}
) => {
  const {
    enabled = true,
    onEscape,
    returnFocusOnDeactivate = true,
  } = options;

  const containerRef = useRef<T>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const getFocusableElements = useCallback(() => {
    if (!containerRef.current) return [];

    const focusableSelectors = [
      'a[href]',
      'button:not([disabled])',
      'textarea:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ];

    const elements = containerRef.current.querySelectorAll<HTMLElement>(
      focusableSelectors.join(', ')
    );

    return Array.from(elements).filter(
      (el) => !el.hasAttribute('disabled') && el.offsetParent !== null
    );
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Handle Escape key
      if (event.key === 'Escape' && onEscape) {
        event.preventDefault();
        onEscape();
        return;
      }

      // Handle Tab key for focus trapping
      if (event.key !== 'Tab') return;

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      // Shift + Tab (backwards)
      if (event.shiftKey) {
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab (forwards)
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    },
    [enabled, onEscape, getFocusableElements]
  );

  useEffect(() => {
    if (!enabled) return;

    // Store the previously focused element
    previousFocusRef.current = document.activeElement as HTMLElement;

    // Focus the first focusable element in the container
    const focusableElements = getFocusableElements();
    if (focusableElements.length > 0) {
      // Small delay to ensure the container is rendered
      requestAnimationFrame(() => {
        focusableElements[0].focus();
      });
    }

    // Add event listener
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);

      // Return focus to the previously focused element
      if (returnFocusOnDeactivate && previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
    };
  }, [enabled, handleKeyDown, getFocusableElements, returnFocusOnDeactivate]);

  return containerRef;
};

export default useFocusTrap;
