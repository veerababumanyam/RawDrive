"use client";

/**
 * useTouchGestures — GAL-FR-097
 *
 * Pointer-event driven gesture hook for the photo lightbox. Handles:
 *   - Pinch-to-zoom (two-finger pinch → `onPinch(delta)`)
 *   - Swipe left  → `onSwipeLeft()`  (next photo)
 *   - Swipe right → `onSwipeRight()` (previous photo)
 *   - Swipe up    → `onSwipeUp()`    (close lightbox)
 *
 * Design notes:
 *   • Uses Pointer Events rather than Touch Events so it works on pointer-
 *     capable laptops with touchscreens AND mobile devices with a single code
 *     path. Mouse drags are intentionally ignored (pointerType !== "touch")
 *     — the existing keyboard + arrow-button UI already covers desktop.
 *   • Pinch detection tracks active pointers in a Map keyed by pointerId;
 *     two simultaneous pointers trigger pinch mode and the swipe handlers
 *     are suppressed until both pointers release.
 *   • Swipe threshold = 50 px minimum travel in the dominant axis; vertical
 *     swipes also require |deltaY| > 1.5 * |deltaX| so a horizontal swipe
 *     that drifts doesn't accidentally close the lightbox.
 *   • The hook returns pointer handlers — callers spread them onto the
 *     target element rather than the hook attaching listeners itself, which
 *     keeps React's event delegation intact and avoids passive-listener
 *     warnings.
 */

import { useCallback, useRef } from "react";

export interface UseTouchGesturesOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  /** Pinch delta in raw pixel distance (positive = spread, negative = pinch). */
  onPinch?: (delta: number) => void;
  /** Minimum pixel travel to register a swipe. Defaults to 50. */
  swipeThreshold?: number;
}

interface PointerState {
  id: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export function useTouchGestures(opts: UseTouchGesturesOptions) {
  const threshold = opts.swipeThreshold ?? 50;
  const pointers = useRef<Map<number, PointerState>>(new Map());
  const pinchStartDistance = useRef<number | null>(null);

  const distanceBetween = (a: PointerState, b: PointerState) => {
    const dx = a.currentX - b.currentX;
    const dy = a.currentY - b.currentY;
    return Math.hypot(dx, dy);
  };

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return;
    pointers.current.set(e.pointerId, {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
    });
    // Entering pinch mode — capture the starting distance.
    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      pinchStartDistance.current = distanceBetween(a, b);
    }
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== "touch") return;
      const state = pointers.current.get(e.pointerId);
      if (!state) return;
      state.currentX = e.clientX;
      state.currentY = e.clientY;

      // Pinch in progress — report delta and bail out of swipe detection.
      if (pointers.current.size === 2 && pinchStartDistance.current != null) {
        const [a, b] = Array.from(pointers.current.values());
        const current = distanceBetween(a, b);
        const delta = current - pinchStartDistance.current;
        opts.onPinch?.(delta);
      }
    },
    [opts],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== "touch") return;
      const state = pointers.current.get(e.pointerId);
      if (!state) return;

      // When the second finger of a pinch lifts, reset pinch state without
      // triggering swipe — the user was intentionally zooming.
      const wasPinching = pinchStartDistance.current != null && pointers.current.size === 2;
      pointers.current.delete(e.pointerId);

      if (wasPinching) {
        if (pointers.current.size === 0) {
          pinchStartDistance.current = null;
        }
        return;
      }

      // Only a single-finger gesture qualifies as a swipe.
      if (pointers.current.size !== 0) return;

      const dx = state.currentX - state.startX;
      const dy = state.currentY - state.startY;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      // Vertical swipe (close) — require dominant vertical motion so a
      // horizontal swipe that drifts doesn't trigger close.
      if (absY >= threshold && absY > 1.5 * absX && dy < 0) {
        opts.onSwipeUp?.();
        return;
      }

      if (absX >= threshold && absX > absY) {
        if (dx < 0) {
          opts.onSwipeLeft?.();
        } else {
          opts.onSwipeRight?.();
        }
      }
    },
    [opts, threshold],
  );

  const onPointerCancel = useCallback((e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStartDistance.current = null;
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
