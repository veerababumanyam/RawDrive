/**
 * useCommandBar Hook
 *
 * Global state management for the Command Bar (Cmd+K)
 * Provides open/close functionality with keyboard shortcut support.
 *
 * Feature: AI & Search Features (GEO)
 */

import { useState, useEffect, useCallback } from 'react';

export interface UseCommandBarReturn {
  /** Whether the command bar is open */
  isOpen: boolean;
  /** Open the command bar */
  open: () => void;
  /** Close the command bar */
  close: () => void;
  /** Toggle the command bar */
  toggle: () => void;
}

/**
 * Hook to manage command bar state with Cmd+K (or Ctrl+K) keyboard shortcut
 */
export function useCommandBar(): UseCommandBarReturn {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  // Global keyboard shortcut handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K (Mac) or Ctrl+K (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggle();
      }

      // Also support "/" when not in an input
      if (
        e.key === '/' &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(
          (e.target as HTMLElement).tagName
        )
      ) {
        e.preventDefault();
        open();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [toggle, open]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return {
    isOpen,
    open,
    close,
    toggle,
  };
}

export default useCommandBar;
