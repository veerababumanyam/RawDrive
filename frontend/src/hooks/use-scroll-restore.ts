"use client";

/**
 * useScrollRestore — GAL-FR-091
 *
 * Saves and restores window scroll position around a modal open/close cycle.
 * The gallery lightbox sets body overflow: hidden while open, which resets
 * the scroll position on some browsers when the modal unmounts. This hook
 * captures the scroll-Y on open and scrolls back to it on close.
 *
 * Usage:
 *   const { save, restore } = useScrollRestore();
 *   // when opening the lightbox:
 *   save();
 *   // when closing:
 *   restore();
 *
 * Implementation notes:
 *   - We store the scroll value in a ref rather than a scroll-position URL
 *     fragment because the lightbox keeps the same route — a fragment would
 *     persist across reloads and pollute browser history.
 *   - The restore runs inside a rAF double-tick so it lands after React
 *     paints the restored DOM; a synchronous scroll can race the layout
 *     recalculation when the gallery grid virtualisation rehydrates.
 */

import { useCallback, useRef } from "react";

export function useScrollRestore() {
  const savedY = useRef<number | null>(null);

  const save = useCallback(() => {
    if (typeof window === "undefined") return;
    savedY.current = window.scrollY;
  }, []);

  const restore = useCallback(() => {
    if (typeof window === "undefined" || savedY.current == null) return;
    const y = savedY.current;
    // Double rAF: first tick lands after React's commit, second lands after
    // browser paint, so the scroll target has been laid out.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior });
      });
    });
    savedY.current = null;
  }, []);

  return { save, restore };
}
