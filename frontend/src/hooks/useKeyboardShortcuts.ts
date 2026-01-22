/**
 * useKeyboardShortcuts Hook
 * Keyboard shortcut management for Pro Review Mode
 * Feature: 029-pro-review-xmp-sync
 * Task: T021
 *
 * Shortcuts:
 * - 0-5: Set rating (0 removes rating)
 * - P: Flag as pick
 * - U: Unflag
 * - X: Reject
 * - 6-9: Color labels (red, yellow, green, blue)
 * - Arrow keys: Navigate
 * - C: Compare mode
 * - ?: Show help
 * - Escape: Exit
 */

import { useCallback, useEffect, useMemo } from 'react';
import { useHotkeys, Options } from 'react-hotkeys-hook';
import type { AssetRating, AssetFlag, ColorLabel, ReviewAction } from '../types/reviewMode';
import { KEYBOARD_SHORTCUTS } from '../types/reviewMode';

export interface UseKeyboardShortcutsProps {
  /** Whether shortcuts are enabled */
  enabled?: boolean;
  /** Callback when rating is set */
  onRating?: (rating: AssetRating) => void;
  /** Callback when flag is set */
  onFlag?: (flag: AssetFlag) => void;
  /** Callback when color label is set */
  onColorLabel?: (label: ColorLabel) => void;
  /** Callback when navigating */
  onNavigate?: (direction: 'prev' | 'next') => void;
  /** Callback when toggling compare mode */
  onCompare?: () => void;
  /** Callback when toggling help */
  onHelp?: () => void;
  /** Callback when zooming */
  onZoom?: (action: 'in' | 'out' | 'fit') => void;
  /** Callback when exiting */
  onEscape?: () => void;
  /** Auto-advance to next photo after action */
  autoAdvance?: boolean;
}

export interface UseKeyboardShortcutsReturn {
  /** Whether shortcuts are currently enabled */
  enabled: boolean;
  /** Current shortcut being pressed (for UI feedback) */
  activeShortcut: string | null;
  /** All available shortcuts for help display */
  shortcuts: typeof KEYBOARD_SHORTCUTS;
}

/**
 * Hook for managing keyboard shortcuts in Review Mode
 * Uses react-hotkeys-hook for robust keyboard handling
 */
export function useKeyboardShortcuts({
  enabled = true,
  onRating,
  onFlag,
  onColorLabel,
  onNavigate,
  onCompare,
  onHelp,
  onZoom,
  onEscape,
  autoAdvance = true,
}: UseKeyboardShortcutsProps): UseKeyboardShortcutsReturn {
  // Common options for hotkeys
  const hotkeyOptions: Options = useMemo(() => ({
    enabled,
    preventDefault: true,
    enableOnFormTags: false,
  }), [enabled]);

  // Rating shortcuts (0-5)
  const handleRating = useCallback((rating: AssetRating) => {
    if (onRating) {
      onRating(rating);
      if (autoAdvance && rating > 0 && onNavigate) {
        // Small delay to allow UI feedback
        setTimeout(() => onNavigate('next'), 150);
      }
    }
  }, [onRating, onNavigate, autoAdvance]);

  useHotkeys('0', () => handleRating(0), hotkeyOptions, [handleRating]);
  useHotkeys('1', () => handleRating(1), hotkeyOptions, [handleRating]);
  useHotkeys('2', () => handleRating(2), hotkeyOptions, [handleRating]);
  useHotkeys('3', () => handleRating(3), hotkeyOptions, [handleRating]);
  useHotkeys('4', () => handleRating(4), hotkeyOptions, [handleRating]);
  useHotkeys('5', () => handleRating(5), hotkeyOptions, [handleRating]);

  // Flag shortcuts (P, U, X)
  const handleFlag = useCallback((flag: AssetFlag) => {
    if (onFlag) {
      onFlag(flag);
      if (autoAdvance && flag !== 'unflagged' && onNavigate) {
        setTimeout(() => onNavigate('next'), 150);
      }
    }
  }, [onFlag, onNavigate, autoAdvance]);

  useHotkeys('p', () => handleFlag('pick'), hotkeyOptions, [handleFlag]);
  useHotkeys('u', () => handleFlag('unflagged'), hotkeyOptions, [handleFlag]);
  useHotkeys('x', () => handleFlag('reject'), hotkeyOptions, [handleFlag]);

  // Color label shortcuts (6-9 for red, yellow, green, blue)
  const handleColorLabel = useCallback((label: ColorLabel) => {
    if (onColorLabel) {
      onColorLabel(label);
    }
  }, [onColorLabel]);

  useHotkeys('6', () => handleColorLabel('red'), hotkeyOptions, [handleColorLabel]);
  useHotkeys('7', () => handleColorLabel('yellow'), hotkeyOptions, [handleColorLabel]);
  useHotkeys('8', () => handleColorLabel('green'), hotkeyOptions, [handleColorLabel]);
  useHotkeys('9', () => handleColorLabel('blue'), hotkeyOptions, [handleColorLabel]);

  // Navigation shortcuts
  useHotkeys('left', () => onNavigate?.('prev'), hotkeyOptions, [onNavigate]);
  useHotkeys('right', () => onNavigate?.('next'), hotkeyOptions, [onNavigate]);
  useHotkeys(',', () => onNavigate?.('prev'), hotkeyOptions, [onNavigate]);
  useHotkeys('.', () => onNavigate?.('next'), hotkeyOptions, [onNavigate]);

  // Action shortcuts
  useHotkeys('c', () => onCompare?.(), hotkeyOptions, [onCompare]);
  useHotkeys('shift+/', () => onHelp?.(), hotkeyOptions, [onHelp]); // ? key
  useHotkeys('escape', () => onEscape?.(), hotkeyOptions, [onEscape]);

  // Zoom shortcuts
  useHotkeys('=', () => onZoom?.('in'), hotkeyOptions, [onZoom]);
  useHotkeys('+', () => onZoom?.('in'), hotkeyOptions, [onZoom]);
  useHotkeys('-', () => onZoom?.('out'), hotkeyOptions, [onZoom]);
  useHotkeys('f', () => onZoom?.('fit'), hotkeyOptions, [onZoom]);

  return {
    enabled,
    activeShortcut: null, // Could track this with state if needed for UI feedback
    shortcuts: KEYBOARD_SHORTCUTS,
  };
}

export default useKeyboardShortcuts;
