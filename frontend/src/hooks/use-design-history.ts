"use client";

import { useCallback, useRef, useState } from "react";

export const MAX_HISTORY_SIZE = 50;

interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

export function useDesignHistory<T>(initialState: T) {
  const [history, setHistory] = useState<HistoryState<T>>({
    past: [],
    present: initialState,
    future: [],
  });

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const push = useCallback((newState: T) => {
    setHistory((h) => ({
      past: [...h.past, h.present].slice(-MAX_HISTORY_SIZE),
      present: newState,
      future: [],
    }));
  }, []);

  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.past.length === 0) return h;
      const previous = h.past[h.past.length - 1];
      return {
        past: h.past.slice(0, -1),
        present: previous,
        future: [h.present, ...h.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((h) => {
      if (h.future.length === 0) return h;
      const next = h.future[0];
      return {
        past: [...h.past, h.present],
        present: next,
        future: h.future.slice(1),
      };
    });
  }, []);

  const reset = useCallback((state: T) => {
    setHistory({ past: [], present: state, future: [] });
  }, []);

  const resetSection = useCallback((sectionKey: string, defaultValue: unknown) => {
    setHistory((h) => {
      const current = h.present as Record<string, unknown>;
      const newState = { ...current, [sectionKey]: defaultValue } as T;
      return {
        past: [...h.past, h.present].slice(-MAX_HISTORY_SIZE),
        present: newState,
        future: [],
      };
    });
  }, []);

  // Keyboard shortcuts ref
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(undefined);
  keyHandlerRef.current = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey) {
      e.preventDefault();
      redo();
    }
  };

  return {
    state: history.present,
    canUndo,
    canRedo,
    historySize: history.past.length,
    push,
    undo,
    redo,
    reset,
    resetSection,
    keyHandler: keyHandlerRef,
  };
}
