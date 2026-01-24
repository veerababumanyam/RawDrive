/**
 * useTouchGestures Hook
 *
 * Handles touch gesture detection for the Avatar Editor.
 * Provides two-finger rotation detection using @use-gesture/react.
 */

import { useRef, useMemo } from 'react';
import { useGesture } from '@use-gesture/react';

// =============================================================================
// Types
// =============================================================================

export interface UseTouchGesturesOptions {
  /** Callback when rotation gesture detected */
  onRotate?: (angleDelta: number) => void;

  /** Callback when pinch gesture detected */
  onPinch?: (scaleDelta: number) => void;

  /** Whether gestures are enabled */
  enabled?: boolean;

  /** Minimum rotation angle (in degrees) before triggering callback */
  rotationThreshold?: number;

  /** Sensitivity multiplier for rotation */
  rotationSensitivity?: number;
}

export interface UseTouchGesturesReturn {
  /** Bind props for the gesture target element */
  bind: () => React.HTMLAttributes<HTMLElement> & { ref?: React.RefCallback<HTMLElement> };

  /** Whether a gesture is currently active */
  isGestureActive: boolean;
}

// =============================================================================
// Hook
// =============================================================================

export const useTouchGestures = (
  options: UseTouchGesturesOptions = {}
): UseTouchGesturesReturn => {
  const {
    onRotate,
    onPinch,
    enabled = true,
    rotationThreshold = 5,
    rotationSensitivity = 1,
  } = options;

  const isActiveRef = useRef(false);
  const lastAngleRef = useRef<number | null>(null);
  const accumulatedRotationRef = useRef(0);

  /**
   * Handle gesture events using use-gesture
   */
  const bind = useGesture(
    {
      onPinch: ({ da: [, angle], movement: [scale], first, last, memo }) => {
        if (!enabled) return memo;

        if (first) {
          isActiveRef.current = true;
          lastAngleRef.current = angle;
          accumulatedRotationRef.current = 0;
          return { initialAngle: angle, initialScale: 1 };
        }

        if (last) {
          isActiveRef.current = false;
          lastAngleRef.current = null;
          return memo;
        }

        // Handle rotation
        if (onRotate && lastAngleRef.current !== null) {
          let angleDelta = angle - lastAngleRef.current;

          // Handle angle wrap-around
          if (angleDelta > 180) angleDelta -= 360;
          if (angleDelta < -180) angleDelta += 360;

          accumulatedRotationRef.current += angleDelta * rotationSensitivity;

          // Only trigger callback if threshold exceeded
          if (Math.abs(accumulatedRotationRef.current) >= rotationThreshold) {
            onRotate(accumulatedRotationRef.current);
            accumulatedRotationRef.current = 0;
          }

          lastAngleRef.current = angle;
        }

        // Handle pinch zoom
        if (onPinch && memo) {
          const scaleDelta = scale;
          onPinch(scaleDelta);
        }

        return memo;
      },

      onPinchEnd: () => {
        isActiveRef.current = false;
        lastAngleRef.current = null;
        accumulatedRotationRef.current = 0;
      },
    },
    {
      enabled,
      pinch: {
        // Prevent browser default pinch-zoom
        preventDefault: true,
        // Filter function to ensure we're using touch events
        filterTaps: true,
      },
    }
  );

  const isGestureActive = isActiveRef.current;

  return useMemo(
    () => ({
      bind: bind as () => React.HTMLAttributes<HTMLElement> & { ref?: React.RefCallback<HTMLElement> },
      isGestureActive,
    }),
    [bind, isGestureActive]
  );
};

export default useTouchGestures;
