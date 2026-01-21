/**
 * useLightboxNavigation Hook
 * Manages navigation state and keyboard shortcuts for the lightbox
 * Extracted from Lightbox.tsx for reusability
 */

import { useCallback, useEffect } from 'react';

export interface UseLightboxNavigationOptions {
  /** Current asset index */
  currentIndex: number;
  /** Total number of assets */
  totalAssets: number;
  /** Whether the lightbox is open */
  isOpen: boolean;
  /** Callback to navigate to a specific index */
  onNavigate: (index: number) => void;
  /** Callback when close is requested */
  onClose: () => void;
  /** Callback for zoom in (keyboard shortcut) */
  onZoomIn?: () => void;
  /** Callback for zoom out (keyboard shortcut) */
  onZoomOut?: () => void;
  /** Callback for reset zoom (keyboard shortcut) */
  onResetZoom?: () => void;
  /** Callback for toggle metadata (keyboard shortcut) */
  onToggleMetadata?: () => void;
  /** Callback for rotate (keyboard shortcut) */
  onRotate?: () => void;
  /** Enable keyboard navigation (default: true) */
  enableKeyboard?: boolean;
}

export interface UseLightboxNavigationReturn {
  /** Navigate to previous asset */
  goToPrevious: () => void;
  /** Navigate to next asset */
  goToNext: () => void;
  /** Navigate to first asset */
  goToFirst: () => void;
  /** Navigate to last asset */
  goToLast: () => void;
  /** Navigate to specific index */
  goToIndex: (index: number) => void;
  /** Whether previous navigation is available */
  canGoPrevious: boolean;
  /** Whether next navigation is available */
  canGoNext: boolean;
  /** Current position string (e.g., "5 / 20") */
  positionLabel: string;
}

export function useLightboxNavigation(
  options: UseLightboxNavigationOptions
): UseLightboxNavigationReturn {
  const {
    currentIndex,
    totalAssets,
    isOpen,
    onNavigate,
    onClose,
    onZoomIn,
    onZoomOut,
    onResetZoom,
    onToggleMetadata,
    onRotate,
    enableKeyboard = true,
  } = options;

  // Navigation state
  const canGoPrevious = currentIndex > 0;
  const canGoNext = currentIndex < totalAssets - 1;
  const positionLabel = `${currentIndex + 1} / ${totalAssets}`;

  // Navigation handlers
  const goToPrevious = useCallback(() => {
    if (canGoPrevious) {
      onNavigate(currentIndex - 1);
    }
  }, [canGoPrevious, currentIndex, onNavigate]);

  const goToNext = useCallback(() => {
    if (canGoNext) {
      onNavigate(currentIndex + 1);
    }
  }, [canGoNext, currentIndex, onNavigate]);

  const goToFirst = useCallback(() => {
    if (totalAssets > 0) {
      onNavigate(0);
    }
  }, [totalAssets, onNavigate]);

  const goToLast = useCallback(() => {
    if (totalAssets > 0) {
      onNavigate(totalAssets - 1);
    }
  }, [totalAssets, onNavigate]);

  const goToIndex = useCallback(
    (index: number) => {
      if (index >= 0 && index < totalAssets) {
        onNavigate(index);
      }
    },
    [totalAssets, onNavigate]
  );

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen || !enableKeyboard) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent default browser behavior for navigation keys
      const navigationKeys = [
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        'Home',
        'End',
        'Escape',
        '+',
        '-',
        '=',
        '0',
      ];

      if (navigationKeys.includes(e.key)) {
        e.preventDefault();
      }

      switch (e.key) {
        case 'Escape':
          onClose();
          break;

        case 'ArrowLeft':
        case 'ArrowUp':
          goToPrevious();
          break;

        case 'ArrowRight':
        case 'ArrowDown':
          goToNext();
          break;

        case 'Home':
          goToFirst();
          break;

        case 'End':
          goToLast();
          break;

        case '+':
        case '=':
          onZoomIn?.();
          break;

        case '-':
          onZoomOut?.();
          break;

        case '0':
          onResetZoom?.();
          break;

        case 'm':
        case 'M':
          onToggleMetadata?.();
          break;

        case 'r':
        case 'R':
          onRotate?.();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    isOpen,
    enableKeyboard,
    onClose,
    goToPrevious,
    goToNext,
    goToFirst,
    goToLast,
    onZoomIn,
    onZoomOut,
    onResetZoom,
    onToggleMetadata,
    onRotate,
  ]);

  // Prevent body scroll when lightbox is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  return {
    goToPrevious,
    goToNext,
    goToFirst,
    goToLast,
    goToIndex,
    canGoPrevious,
    canGoNext,
    positionLabel,
  };
}
