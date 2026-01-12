/**
 * useLongPress Hook
 *
 * Detects long-press gestures for touch and mouse interactions.
 * Useful for triggering context menus or secondary actions on mobile devices.
 *
 * Features:
 * - Configurable delay (default 500ms)
 * - Touch and mouse support
 * - Cancellation on movement (prevents accidental triggers during scroll)
 * - Haptic feedback support (if available)
 *
 * @example
 * const longPressProps = useLongPress({
 *   onLongPress: () => setShowContextMenu(true),
 *   delay: 500,
 *   threshold: 10, // pixels of movement allowed
 * });
 *
 * return <div {...longPressProps}>Long press me</div>;
 */

import { useCallback, useRef } from 'react';

export interface UseLongPressOptions {
  /** Callback fired when long press is detected */
  onLongPress: (event: React.TouchEvent | React.MouseEvent) => void;
  /** Optional callback for regular click (short press) */
  onClick?: (event: React.TouchEvent | React.MouseEvent) => void;
  /** Long press delay in milliseconds (default: 500) */
  delay?: number;
  /** Movement threshold in pixels before cancelling (default: 10) */
  threshold?: number;
  /** Whether to trigger haptic feedback on long press (default: true) */
  hapticFeedback?: boolean;
  /** Disable long press detection */
  disabled?: boolean;
}

export interface UseLongPressResult {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseUp: (e: React.MouseEvent) => void;
  onMouseLeave: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export function useLongPress({
  onLongPress,
  onClick,
  delay = 500,
  threshold = 10,
  hapticFeedback = true,
  disabled = false,
}: UseLongPressOptions): UseLongPressResult {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = useRef(false);
  const startPositionRef = useRef<{ x: number; y: number } | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const triggerHapticFeedback = useCallback(() => {
    if (hapticFeedback && 'vibrate' in navigator) {
      try {
        navigator.vibrate(50); // Short vibration
      } catch {
        // Haptic feedback not available, ignore
      }
    }
  }, [hapticFeedback]);

  const handleStart = useCallback(
    (clientX: number, clientY: number, event: React.TouchEvent | React.MouseEvent) => {
      if (disabled) return;

      isLongPressRef.current = false;
      startPositionRef.current = { x: clientX, y: clientY };

      timerRef.current = setTimeout(() => {
        isLongPressRef.current = true;
        triggerHapticFeedback();
        onLongPress(event);
      }, delay);
    },
    [delay, disabled, onLongPress, triggerHapticFeedback]
  );

  const handleMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!startPositionRef.current) return;

      const deltaX = Math.abs(clientX - startPositionRef.current.x);
      const deltaY = Math.abs(clientY - startPositionRef.current.y);

      // Cancel if moved beyond threshold (prevents accidental triggers during scroll)
      if (deltaX > threshold || deltaY > threshold) {
        clearTimer();
        startPositionRef.current = null;
      }
    },
    [threshold, clearTimer]
  );

  const handleEnd = useCallback(
    (event: React.TouchEvent | React.MouseEvent) => {
      clearTimer();

      // Fire onClick only if it wasn't a long press
      if (!isLongPressRef.current && onClick && startPositionRef.current) {
        onClick(event);
      }

      startPositionRef.current = null;
    },
    [clearTimer, onClick]
  );

  // Touch event handlers
  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      handleStart(touch.clientX, touch.clientY, e);
    },
    [handleStart]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      handleMove(touch.clientX, touch.clientY);
    },
    [handleMove]
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      handleEnd(e);
    },
    [handleEnd]
  );

  // Mouse event handlers (for desktop testing)
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only left click
      if (e.button !== 0) return;
      handleStart(e.clientX, e.clientY, e);
    },
    [handleStart]
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      handleMove(e.clientX, e.clientY);
    },
    [handleMove]
  );

  const onMouseUp = useCallback(
    (e: React.MouseEvent) => {
      handleEnd(e);
    },
    [handleEnd]
  );

  const onMouseLeave = useCallback(() => {
    clearTimer();
    startPositionRef.current = null;
  }, [clearTimer]);

  // Prevent native context menu on touch devices
  const onContextMenu = useCallback((e: React.MouseEvent) => {
    if (disabled) return;
    // Only prevent on touch devices where we handle long-press ourselves
    if ('ontouchstart' in window) {
      e.preventDefault();
    }
  }, [disabled]);

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onMouseLeave,
    onContextMenu,
  };
}

export default useLongPress;
