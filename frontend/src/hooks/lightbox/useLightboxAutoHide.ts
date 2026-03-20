/**
 * useLightboxAutoHide
 * Apple Photos-style auto-hide: controls fade after idle, reappear on interaction.
 *
 * Behavior:
 * - Controls visible on open
 * - Hide after 2.5s of no mouse movement / touch / keyboard
 * - Reappear instantly on mouse move, touch, or keyboard
 * - Touch tap toggles visibility (mobile pattern)
 * - Never hide while interacting with controls (pointer over control area)
 */
import { useState, useCallback, useRef, useEffect } from 'react';

interface UseLightboxAutoHideOptions {
  /** Whether the lightbox is open */
  isOpen: boolean;
  /** Idle timeout in ms before hiding (default: 2500) */
  idleTimeout?: number;
  /** Whether auto-hide is enabled (default: true) */
  enabled?: boolean;
}

interface UseLightboxAutoHideReturn {
  /** Whether controls should be visible */
  controlsVisible: boolean;
  /** Call on mouse move over the lightbox container */
  handleMouseMove: () => void;
  /** Call on touch start (for tap-to-toggle) */
  handleTouchStart: (e: React.TouchEvent) => void;
  /** Call on touch end (for tap-to-toggle) */
  handleTouchEnd: (e: React.TouchEvent) => void;
  /** Call when pointer enters a control area (prevents hide) */
  handleControlsEnter: () => void;
  /** Call when pointer leaves a control area */
  handleControlsLeave: () => void;
  /** Force show controls (e.g., on keyboard shortcut) */
  showControls: () => void;
  /** Force hide controls */
  hideControls: () => void;
}

export function useLightboxAutoHide({
  isOpen,
  idleTimeout = 2500,
  enabled = true,
}: UseLightboxAutoHideOptions): UseLightboxAutoHideReturn {
  const [controlsVisible, setControlsVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isOverControlsRef = useRef(false);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    if (!enabled) return;
    clearTimer();
    timerRef.current = setTimeout(() => {
      if (!isOverControlsRef.current) {
        setControlsVisible(false);
      }
    }, idleTimeout);
  }, [enabled, idleTimeout, clearTimer]);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    startTimer();
  }, [startTimer]);

  const hideControls = useCallback(() => {
    clearTimer();
    setControlsVisible(false);
  }, [clearTimer]);

  // Show controls and restart timer on mouse movement
  const handleMouseMove = useCallback(() => {
    if (!enabled) return;
    if (!controlsVisible) {
      setControlsVisible(true);
    }
    startTimer();
  }, [enabled, controlsVisible, startTimer]);

  // Touch: track start position for tap detection
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
    };
  }, []);

  // Touch: tap (short, no movement) toggles visibility
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current || e.changedTouches.length !== 1) return;
    const touch = e.changedTouches[0];
    const dx = Math.abs(touch.clientX - touchStartRef.current.x);
    const dy = Math.abs(touch.clientY - touchStartRef.current.y);
    const dt = Date.now() - touchStartRef.current.time;
    touchStartRef.current = null;

    // Only toggle on tap (short duration, minimal movement)
    if (dt < 250 && dx < 15 && dy < 15) {
      setControlsVisible(prev => {
        const next = !prev;
        if (next) startTimer();
        return next;
      });
    }
  }, [startTimer]);

  // Prevent hide while hovering over control areas
  const handleControlsEnter = useCallback(() => {
    isOverControlsRef.current = true;
    clearTimer();
  }, [clearTimer]);

  const handleControlsLeave = useCallback(() => {
    isOverControlsRef.current = false;
    startTimer();
  }, [startTimer]);

  // Show controls on keyboard activity
  useEffect(() => {
    if (!isOpen || !enabled) return;

    const handleKeyDown = () => {
      setControlsVisible(true);
      startTimer();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, enabled, startTimer]);

  // Reset on open/close
  useEffect(() => {
    if (isOpen) {
      setControlsVisible(true);
      startTimer();
    } else {
      clearTimer();
      setControlsVisible(true);
    }
  }, [isOpen, startTimer, clearTimer]);

  // Cleanup
  useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  return {
    controlsVisible,
    handleMouseMove,
    handleTouchStart,
    handleTouchEnd,
    handleControlsEnter,
    handleControlsLeave,
    showControls,
    hideControls,
  };
}
