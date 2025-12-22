/**
 * Theme Undo/Redo Hook
 *
 * Provides undo/redo functionality for theme customization:
 * - Tracks history of up to 10 actions
 * - Supports undo and redo operations
 * - Auto-save with visual confirmation
 * - Reset to default capability
 *
 * Requirements: 8.5, 8.6, 8.15
 */

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import type { ThemeCustomization } from '@/types/profileEditor';

// =============================================================================
// Deep Equality Utility (avoids lodash dependency for bundle size)
// =============================================================================

/**
 * Deep equality check for theme customization objects
 * More reliable than JSON.stringify (handles key ordering)
 */
function isDeepEqual(obj1: unknown, obj2: unknown): boolean {
  if (obj1 === obj2) return true;
  if (obj1 === null || obj2 === null) return obj1 === obj2;
  if (typeof obj1 !== 'object' || typeof obj2 !== 'object') return obj1 === obj2;

  const keys1 = Object.keys(obj1 as object);
  const keys2 = Object.keys(obj2 as object);

  if (keys1.length !== keys2.length) return false;

  for (const key of keys1) {
    if (!keys2.includes(key)) return false;
    if (!isDeepEqual((obj1 as Record<string, unknown>)[key], (obj2 as Record<string, unknown>)[key])) {
      return false;
    }
  }

  return true;
}

// =============================================================================
// Types
// =============================================================================

export interface UndoRedoState<T> {
  past: T[];
  present: T;
  future: T[];
}

export interface UseThemeUndoRedoOptions {
  /** Maximum number of history entries to keep */
  maxHistory?: number;
  /** Callback when state changes (for auto-save) */
  onChange?: (state: Partial<ThemeCustomization> | null) => void;
  /** Debounce time for auto-save in ms */
  autoSaveDebounce?: number;
}

export interface UseThemeUndoRedoReturn {
  /** Current customization state */
  state: Partial<ThemeCustomization> | null;
  /** Update customization state (pushes to history) */
  update: (changes: Partial<ThemeCustomization>) => void;
  /** Undo last change */
  undo: () => void;
  /** Redo previously undone change */
  redo: () => void;
  /** Reset to initial state (clears history) */
  reset: () => void;
  /** Whether undo is available */
  canUndo: boolean;
  /** Whether redo is available */
  canRedo: boolean;
  /** Number of undo steps available */
  undoCount: number;
  /** Number of redo steps available */
  redoCount: number;
  /** Whether state has been modified from initial */
  isDirty: boolean;
  /** Clear all history without resetting state */
  clearHistory: () => void;
  /** Last save timestamp */
  lastSaveTime: Date | null;
  /** Whether auto-save is pending */
  isSavePending: boolean;
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useThemeUndoRedo(
  initialState: Partial<ThemeCustomization> | null = null,
  options: UseThemeUndoRedoOptions = {}
): UseThemeUndoRedoReturn {
  const {
    maxHistory = 10,
    onChange,
    autoSaveDebounce = 1000,
  } = options;

  // State
  const [history, setHistory] = useState<UndoRedoState<Partial<ThemeCustomization> | null>>({
    past: [],
    present: initialState,
    future: [],
  });

  const [lastSaveTime, setLastSaveTime] = useState<Date | null>(null);
  const [isSavePending, setIsSavePending] = useState(false);

  // Refs for debouncing
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialStateRef = useRef(initialState);
  const isMountedRef = useRef(true);

  // Cleanup timeout on unmount to prevent memory leaks and state updates on unmounted component
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, []);

  // Update state and push to history
  const update = useCallback(
    (changes: Partial<ThemeCustomization>) => {
      setHistory((prev) => {
        // Merge changes with current state
        const newPresent = {
          ...prev.present,
          ...changes,
        };

        // Limit history size
        const newPast = [...prev.past, prev.present].slice(-maxHistory);

        return {
          past: newPast,
          present: newPresent,
          future: [], // Clear future on new action
        };
      });

      // Handle auto-save debouncing
      if (onChange) {
        setIsSavePending(true);

        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = setTimeout(() => {
          // Guard against state updates on unmounted component
          if (!isMountedRef.current) return;

          setHistory((current) => {
            onChange(current.present);
            if (isMountedRef.current) {
              setLastSaveTime(new Date());
              setIsSavePending(false);
            }
            return current;
          });
        }, autoSaveDebounce);
      }
    },
    [maxHistory, onChange, autoSaveDebounce]
  );

  // Undo last action
  const undo = useCallback(() => {
    setHistory((prev) => {
      if (prev.past.length === 0) return prev;

      const newPast = [...prev.past];
      const newPresent = newPast.pop()!;
      const newFuture = [prev.present, ...prev.future];

      // Notify onChange
      if (onChange) {
        onChange(newPresent);
        setLastSaveTime(new Date());
      }

      return {
        past: newPast,
        present: newPresent,
        future: newFuture,
      };
    });
  }, [onChange]);

  // Redo previously undone action
  const redo = useCallback(() => {
    setHistory((prev) => {
      if (prev.future.length === 0) return prev;

      const newFuture = [...prev.future];
      const newPresent = newFuture.shift()!;
      const newPast = [...prev.past, prev.present];

      // Notify onChange
      if (onChange) {
        onChange(newPresent);
        setLastSaveTime(new Date());
      }

      return {
        past: newPast,
        present: newPresent,
        future: newFuture,
      };
    });
  }, [onChange]);

  // Reset to initial state
  const reset = useCallback(() => {
    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    setHistory({
      past: [],
      present: initialStateRef.current,
      future: [],
    });

    setIsSavePending(false);

    // Notify onChange
    if (onChange) {
      onChange(initialStateRef.current);
      setLastSaveTime(new Date());
    }
  }, [onChange]);

  // Clear history without changing state
  const clearHistory = useCallback(() => {
    setHistory((prev) => ({
      past: [],
      present: prev.present,
      future: [],
    }));
  }, []);

  // Computed values
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;
  const undoCount = history.past.length;
  const redoCount = history.future.length;

  const isDirty = useMemo(() => {
    // Compare current state with initial state using deep equality
    return !isDeepEqual(initialStateRef.current, history.present);
  }, [history.present]);

  return {
    state: history.present,
    update,
    undo,
    redo,
    reset,
    canUndo,
    canRedo,
    undoCount,
    redoCount,
    isDirty,
    clearHistory,
    lastSaveTime,
    isSavePending,
  };
}

/**
 * Helper component for Undo/Redo buttons
 */
export interface UndoRedoButtonsProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  undoCount?: number;
  redoCount?: number;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

export default useThemeUndoRedo;
