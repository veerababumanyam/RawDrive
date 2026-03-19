/**
 * useLightboxGestures Hook
 * Enhanced gesture handling using @use-gesture/react.
 * Auth-agnostic: accepts callbacks via parameters, usable by both
 * workspace Lightbox and public GalleryPlayer.
 * Provides smooth swipe navigation and pinch-to-zoom with momentum.
 */

import { useCallback, useRef, useState } from 'react';
import { useGesture } from '@use-gesture/react';

export interface UseLightboxGesturesOptions {
  /** Whether gestures are enabled */
  enabled?: boolean;
  /** Current zoom level */
  zoom: number;
  /** Set zoom level */
  setZoom: (zoom: number) => void;
  /** Current pan position */
  pan: { x: number; y: number };
  /** Set pan position */
  setPan: (pan: { x: number; y: number }) => void;
  /** Go to previous image */
  onPrevious: () => void;
  /** Go to next image */
  onNext: () => void;
  /** Whether there is a previous image */
  canGoPrevious: boolean;
  /** Whether there is a next image */
  canGoNext: boolean;
  /** Minimum zoom level (default: 1) */
  minZoom?: number;
  /** Maximum zoom level (default: 5) */
  maxZoom?: number;
  /** Swipe threshold in pixels (default: 50) */
  swipeThreshold?: number;
  /** Swipe velocity threshold (default: 0.3) */
  swipeVelocityThreshold?: number;
  /** Container ref for bounds calculation */
  containerRef?: React.RefObject<HTMLElement>;
  /** Callback when double-tap detected */
  onDoubleTap?: () => void;
}

export interface UseLightboxGesturesReturn {
  /** Bind these handlers to your gesture target element */
  bind: ReturnType<typeof useGesture>;
  /** Whether a drag/swipe is in progress */
  isDragging: boolean;
  /** Whether pinch gesture is in progress */
  isPinching: boolean;
  /** Gesture state for animation */
  gestureState: {
    /** Current gesture offset X */
    offsetX: number;
    /** Current gesture offset Y */
    offsetY: number;
    /** Current gesture scale */
    scale: number;
    /** Gesture velocity */
    velocity: number;
  };
}

/**
 * useLightboxGestures - Enhanced gesture handling for lightbox
 *
 * @example
 * ```tsx
 * const { bind, isDragging } = useLightboxGestures({
 *   zoom,
 *   setZoom,
 *   pan,
 *   setPan,
 *   onPrevious: goToPrevious,
 *   onNext: goToNext,
 *   canGoPrevious,
 *   canGoNext,
 * });
 *
 * return <div {...bind()} className={isDragging ? 'dragging' : ''}>...</div>;
 * ```
 */
export function useLightboxGestures(options: UseLightboxGesturesOptions): UseLightboxGesturesReturn {
  const {
    enabled = true,
    zoom,
    setZoom,
    pan,
    setPan,
    onPrevious,
    onNext,
    canGoPrevious,
    canGoNext,
    minZoom = 1,
    maxZoom = 5,
    swipeThreshold = 50,
    swipeVelocityThreshold = 0.3,
    onDoubleTap,
  } = options;

  // Gesture state
  const [isDragging, setIsDragging] = useState(false);
  const [isPinching, setIsPinching] = useState(false);
  const [gestureState, setGestureState] = useState({
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    velocity: 0,
  });

  // Track initial values for pinch
  const initialZoomRef = useRef(zoom);
  const initialPanRef = useRef(pan);
  const lastTapTimeRef = useRef(0);

  // Clamp zoom within bounds
  const clampZoom = useCallback(
    (z: number) => Math.min(Math.max(z, minZoom), maxZoom),
    [minZoom, maxZoom]
  );

  // Handle swipe navigation
  const handleSwipe = useCallback(
    (direction: 'left' | 'right') => {
      // Only swipe when not zoomed in
      if (zoom > 1) return;

      if (direction === 'left' && canGoNext) {
        onNext();
      } else if (direction === 'right' && canGoPrevious) {
        onPrevious();
      }
    },
    [zoom, canGoNext, canGoPrevious, onNext, onPrevious]
  );

  // Handle double tap to zoom
  const handleDoubleTap = useCallback(() => {
    if (onDoubleTap) {
      onDoubleTap();
    } else {
      // Default: toggle between 1x and 2x zoom
      if (zoom > 1) {
        setZoom(1);
        setPan({ x: 0, y: 0 });
      } else {
        setZoom(2);
      }
    }
  }, [zoom, setZoom, setPan, onDoubleTap]);

  // Use gesture hook
  const bind = useGesture(
    {
      // Drag/pan gesture
      onDrag: ({ movement: [mx, my], velocity: [vx], direction: [dx], first, last, active, memo }) => {
        if (!enabled) return memo;

        if (first) {
          setIsDragging(true);
          initialPanRef.current = pan;
          return { startPan: pan };
        }

        const startPan = memo?.startPan || { x: 0, y: 0 };

        if (last) {
          setIsDragging(false);

          // Check for swipe gesture (only when not zoomed)
          if (zoom <= 1) {
            const isSwipe = Math.abs(mx) > swipeThreshold && Math.abs(vx) > swipeVelocityThreshold;
            if (isSwipe) {
              handleSwipe(dx > 0 ? 'right' : 'left');
              return memo;
            }
          }

          // Finalize pan position
          if (zoom > 1) {
            setPan({
              x: startPan.x + mx,
              y: startPan.y + my,
            });
          }

          setGestureState((prev) => ({ ...prev, offsetX: 0, offsetY: 0 }));
          return memo;
        }

        // During drag
        if (active) {
          setGestureState((prev) => ({
            ...prev,
            offsetX: mx,
            offsetY: my,
            velocity: Math.abs(vx),
          }));

          // Update pan in real-time when zoomed
          if (zoom > 1) {
            setPan({
              x: startPan.x + mx,
              y: startPan.y + my,
            });
          }
        }

        return memo;
      },

      // Pinch-to-zoom gesture
      onPinch: ({ origin: [ox, oy], first, movement: [ms], last, memo }) => {
        if (!enabled) return memo;

        if (first) {
          setIsPinching(true);
          initialZoomRef.current = zoom;
          initialPanRef.current = pan;
          return { startZoom: zoom, startPan: pan, origin: [ox, oy] };
        }

        const startZoom = memo?.startZoom || 1;

        if (last) {
          setIsPinching(false);
          setGestureState((prev) => ({ ...prev, scale: 1 }));
          return memo;
        }

        // Calculate new zoom
        const newZoom = clampZoom(startZoom * ms);
        setZoom(newZoom);

        setGestureState((prev) => ({ ...prev, scale: ms }));

        return memo;
      },

      // Wheel zoom
      onWheel: ({ delta: [, dy], ctrlKey }) => {
        if (!enabled) return;

        // Only zoom when Ctrl is held (to not interfere with scroll)
        if (!ctrlKey) return;

        const zoomDelta = dy > 0 ? -0.1 : 0.1;
        const newZoom = clampZoom(zoom + zoomDelta);
        setZoom(newZoom);
      },

      // Handle tap/click for double-tap detection
      onClick: ({ event }) => {
        if (!enabled) return;

        const now = Date.now();
        const timeSinceLastTap = now - lastTapTimeRef.current;

        if (timeSinceLastTap < 300) {
          // Double tap detected
          event.preventDefault();
          handleDoubleTap();
          lastTapTimeRef.current = 0; // Reset to prevent triple-tap
        } else {
          lastTapTimeRef.current = now;
        }
      },
    },
    {
      // Gesture config
      drag: {
        from: () => [0, 0],
        filterTaps: true,
        threshold: 10,
      },
      pinch: {
        scaleBounds: { min: minZoom, max: maxZoom },
        rubberband: true,
      },
      wheel: {
        eventOptions: { passive: false },
      },
    }
  );

  return {
    bind: enabled ? bind : (() => ({})) as typeof bind,
    isDragging,
    isPinching,
    gestureState,
  };
}

export default useLightboxGestures;
