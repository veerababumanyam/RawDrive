import { useCallback, useRef, useState, useEffect } from 'react';
import { useGesture } from '@use-gesture/react';

/* =============================================================================
   Gallery Gestures Hook

   Enhanced touch gesture support for gallery viewing including:
   - Pinch-to-zoom with momentum
   - Swipe navigation between images
   - Double-tap to zoom
   - Pan when zoomed
   - Pull-to-refresh
   - Edge swipe to go back
   ============================================================================= */

/**
 * Gesture state for the gallery
 */
export interface GestureState {
  zoom: number;
  pan: { x: number; y: number };
  isDragging: boolean;
  isPinching: boolean;
  isAnimating: boolean;
  velocity: { x: number; y: number };
}

/**
 * Configuration options for gallery gestures
 */
export interface UseGalleryGesturesOptions {
  /**
   * Whether gestures are enabled
   * @default true
   */
  enabled?: boolean;

  /**
   * Minimum zoom level
   * @default 1
   */
  minZoom?: number;

  /**
   * Maximum zoom level
   * @default 5
   */
  maxZoom?: number;

  /**
   * Double-tap zoom level
   * @default 2
   */
  doubleTapZoom?: number;

  /**
   * Swipe threshold in pixels
   * @default 50
   */
  swipeThreshold?: number;

  /**
   * Swipe velocity threshold
   * @default 0.5
   */
  swipeVelocity?: number;

  /**
   * Enable edge swipe to navigate back
   * @default true
   */
  enableEdgeSwipe?: boolean;

  /**
   * Edge swipe threshold in pixels
   * @default 20
   */
  edgeSwipeThreshold?: number;

  /**
   * Enable pull-to-refresh gesture
   * @default false
   */
  enablePullToRefresh?: boolean;

  /**
   * Pull distance to trigger refresh
   * @default 100
   */
  pullToRefreshThreshold?: number;

  /**
   * Callback when navigating to previous item
   */
  onPrevious?: () => void;

  /**
   * Callback when navigating to next item
   */
  onNext?: () => void;

  /**
   * Callback when pull-to-refresh is triggered
   */
  onRefresh?: () => Promise<void>;

  /**
   * Callback when edge swipe back is triggered
   */
  onEdgeSwipeBack?: () => void;

  /**
   * Callback when zoom changes
   */
  onZoomChange?: (zoom: number) => void;

  /**
   * Callback when pan changes
   */
  onPanChange?: (pan: { x: number; y: number }) => void;

  /**
   * Reference to the container element
   */
  containerRef?: React.RefObject<HTMLElement>;

  /**
   * Whether there's a previous item
   */
  hasPrevious?: boolean;

  /**
   * Whether there's a next item
   */
  hasNext?: boolean;

  /**
   * Image dimensions for pan boundary calculation
   */
  imageDimensions?: {
    width: number;
    height: number;
  };
}

/**
 * Return type for useGalleryGestures hook
 */
export interface UseGalleryGesturesReturn {
  /**
   * Current gesture state
   */
  state: GestureState;

  /**
   * Bind props to apply to the target element
   */
  bind: ReturnType<typeof useGesture>;

  /**
   * Reset zoom and pan to default
   */
  resetTransform: () => void;

  /**
   * Set zoom level programmatically
   */
  setZoom: (zoom: number) => void;

  /**
   * Set pan position programmatically
   */
  setPan: (pan: { x: number; y: number }) => void;

  /**
   * Zoom to a specific point
   */
  zoomToPoint: (zoom: number, point: { x: number; y: number }) => void;

  /**
   * Whether currently zoomed in
   */
  isZoomed: boolean;

  /**
   * Pull-to-refresh state
   */
  pullToRefresh: {
    isPulling: boolean;
    isRefreshing: boolean;
    pullProgress: number;
  };
}

/**
 * Default state
 */
const DEFAULT_STATE: GestureState = {
  zoom: 1,
  pan: { x: 0, y: 0 },
  isDragging: false,
  isPinching: false,
  isAnimating: false,
  velocity: { x: 0, y: 0 },
};

/**
 * Clamp a value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Calculate pan boundaries based on zoom level and container/image dimensions
 */
function calculatePanBoundaries(
  zoom: number,
  containerWidth: number,
  containerHeight: number,
  imageWidth?: number,
  imageHeight?: number
): { minX: number; maxX: number; minY: number; maxY: number } {
  // If image dimensions are provided, use them
  const effectiveWidth = imageWidth || containerWidth;
  const effectiveHeight = imageHeight || containerHeight;

  // Calculate the extra space when zoomed
  const extraWidth = (effectiveWidth * zoom - containerWidth) / 2;
  const extraHeight = (effectiveHeight * zoom - containerHeight) / 2;

  return {
    minX: -Math.max(0, extraWidth),
    maxX: Math.max(0, extraWidth),
    minY: -Math.max(0, extraHeight),
    maxY: Math.max(0, extraHeight),
  };
}

/**
 * Gallery Gestures Hook
 */
export function useGalleryGestures(options: UseGalleryGesturesOptions = {}): UseGalleryGesturesReturn {
  const {
    enabled = true,
    minZoom = 1,
    maxZoom = 5,
    doubleTapZoom = 2,
    swipeThreshold = 50,
    swipeVelocity = 0.5,
    enableEdgeSwipe = true,
    edgeSwipeThreshold = 20,
    enablePullToRefresh = false,
    pullToRefreshThreshold = 100,
    onPrevious,
    onNext,
    onRefresh,
    onEdgeSwipeBack,
    onZoomChange,
    onPanChange,
    containerRef,
    hasPrevious = true,
    hasNext = true,
    imageDimensions,
  } = options;

  // State
  const [state, setState] = useState<GestureState>(DEFAULT_STATE);
  const [pullToRefreshState, setPullToRefreshState] = useState({
    isPulling: false,
    isRefreshing: false,
    pullProgress: 0,
  });

  // Refs for gesture handling
  const lastTapTimeRef = useRef(0);
  const lastTapPositionRef = useRef({ x: 0, y: 0 });
  const startPositionRef = useRef({ x: 0, y: 0 });
  const isEdgeSwipeRef = useRef(false);
  const isPullStartRef = useRef(false);

  // Reset transform
  const resetTransform = useCallback(() => {
    setState({
      ...DEFAULT_STATE,
      isAnimating: true,
    });
    onZoomChange?.(1);
    onPanChange?.({ x: 0, y: 0 });

    // Clear animating flag
    setTimeout(() => {
      setState(prev => ({ ...prev, isAnimating: false }));
    }, 300);
  }, [onZoomChange, onPanChange]);

  // Set zoom level
  const setZoom = useCallback((newZoom: number) => {
    const clampedZoom = clamp(newZoom, minZoom, maxZoom);
    setState(prev => ({
      ...prev,
      zoom: clampedZoom,
      // Reset pan if zooming out to min
      pan: clampedZoom === minZoom ? { x: 0, y: 0 } : prev.pan,
    }));
    onZoomChange?.(clampedZoom);
  }, [minZoom, maxZoom, onZoomChange]);

  // Set pan position
  const setPan = useCallback((newPan: { x: number; y: number }) => {
    setState(prev => ({
      ...prev,
      pan: newPan,
    }));
    onPanChange?.(newPan);
  }, [onPanChange]);

  // Zoom to a specific point
  const zoomToPoint = useCallback((newZoom: number, point: { x: number; y: number }) => {
    const clampedZoom = clamp(newZoom, minZoom, maxZoom);

    setState(prev => {
      // Calculate new pan to keep the point centered
      const zoomDelta = clampedZoom / prev.zoom;
      const newPan = {
        x: point.x - (point.x - prev.pan.x) * zoomDelta,
        y: point.y - (point.y - prev.pan.y) * zoomDelta,
      };

      return {
        ...prev,
        zoom: clampedZoom,
        pan: clampedZoom === minZoom ? { x: 0, y: 0 } : newPan,
        isAnimating: true,
      };
    });

    onZoomChange?.(clampedZoom);

    // Clear animating flag
    setTimeout(() => {
      setState(prev => ({ ...prev, isAnimating: false }));
    }, 300);
  }, [minZoom, maxZoom, onZoomChange]);

  // Gesture bindings
  const bind = useGesture(
    {
      // Drag gesture (pan when zoomed, swipe when not)
      onDrag: ({ offset: [ox, oy], velocity: [vx, vy], direction: [dx, dy], first, last, cancel, memo, event }) => {
        if (!enabled) return;

        // Get container dimensions
        const container = containerRef?.current;
        const containerWidth = container?.clientWidth || window.innerWidth;
        const containerHeight = container?.clientHeight || window.innerHeight;

        // On first touch
        if (first) {
          startPositionRef.current = { x: event instanceof TouchEvent ? event.touches[0].clientX : (event as MouseEvent).clientX, y: event instanceof TouchEvent ? event.touches[0].clientY : (event as MouseEvent).clientY };
          isEdgeSwipeRef.current = enableEdgeSwipe && startPositionRef.current.x < edgeSwipeThreshold;
          isPullStartRef.current = enablePullToRefresh && startPositionRef.current.y < 50 && state.zoom === 1;

          setState(prev => ({ ...prev, isDragging: true }));
        }

        // Edge swipe handling
        if (isEdgeSwipeRef.current && dx > 0 && vx > swipeVelocity) {
          onEdgeSwipeBack?.();
          cancel();
          return;
        }

        // Pull-to-refresh handling
        if (isPullStartRef.current && dy > 0 && state.zoom === 1) {
          const pullDistance = Math.max(0, oy);
          setPullToRefreshState({
            isPulling: pullDistance > 0,
            isRefreshing: false,
            pullProgress: Math.min(pullDistance / pullToRefreshThreshold, 1),
          });

          if (last && pullDistance >= pullToRefreshThreshold) {
            setPullToRefreshState(prev => ({ ...prev, isRefreshing: true }));
            onRefresh?.().finally(() => {
              setPullToRefreshState({ isPulling: false, isRefreshing: false, pullProgress: 0 });
            });
          } else if (last) {
            setPullToRefreshState({ isPulling: false, isRefreshing: false, pullProgress: 0 });
          }
          return;
        }

        // If zoomed, handle panning
        if (state.zoom > 1) {
          const boundaries = calculatePanBoundaries(
            state.zoom,
            containerWidth,
            containerHeight,
            imageDimensions?.width,
            imageDimensions?.height
          );

          const newPan = {
            x: clamp(ox, boundaries.minX, boundaries.maxX),
            y: clamp(oy, boundaries.minY, boundaries.maxY),
          };

          setState(prev => ({
            ...prev,
            pan: newPan,
            velocity: { x: vx, y: vy },
          }));

          onPanChange?.(newPan);

          if (last) {
            setState(prev => ({ ...prev, isDragging: false }));
          }

          return memo ?? state.pan;
        }

        // Not zoomed - handle swipe navigation
        if (last) {
          setState(prev => ({ ...prev, isDragging: false }));

          // Check for swipe
          const isSwipe = Math.abs(ox) > swipeThreshold || Math.abs(vx) > swipeVelocity;

          if (isSwipe && Math.abs(dx) > Math.abs(dy)) {
            if (dx < 0 && hasNext) {
              onNext?.();
            } else if (dx > 0 && hasPrevious) {
              onPrevious?.();
            }
          }
        }

        return memo;
      },

      // Pinch gesture (zoom)
      onPinch: ({ offset: [scale], origin: [ox, oy], first, last }) => {
        if (!enabled) return;

        if (first) {
          setState(prev => ({ ...prev, isPinching: true }));
        }

        const newZoom = clamp(scale, minZoom, maxZoom);

        // Get container position for origin calculation
        const container = containerRef?.current;
        const rect = container?.getBoundingClientRect();
        const centerX = (ox - (rect?.left || 0)) - (rect?.width || window.innerWidth) / 2;
        const centerY = (oy - (rect?.top || 0)) - (rect?.height || window.innerHeight) / 2;

        setState(prev => {
          // Calculate pan adjustment to zoom toward pinch point
          const zoomDelta = newZoom / prev.zoom;
          const newPan = {
            x: centerX - (centerX - prev.pan.x) * zoomDelta,
            y: centerY - (centerY - prev.pan.y) * zoomDelta,
          };

          return {
            ...prev,
            zoom: newZoom,
            pan: newZoom === minZoom ? { x: 0, y: 0 } : newPan,
          };
        });

        onZoomChange?.(newZoom);

        if (last) {
          setState(prev => ({ ...prev, isPinching: false }));

          // Snap to min zoom if close
          if (newZoom < minZoom + 0.1) {
            setState(prev => ({
              ...prev,
              zoom: minZoom,
              pan: { x: 0, y: 0 },
              isAnimating: true,
            }));
            onZoomChange?.(minZoom);
            onPanChange?.({ x: 0, y: 0 });

            setTimeout(() => {
              setState(prev => ({ ...prev, isAnimating: false }));
            }, 300);
          }
        }
      },

      // Wheel gesture (zoom with mouse wheel)
      onWheel: ({ event, delta: [, dy], ctrlKey }) => {
        if (!enabled) return;

        // Only zoom on ctrl+wheel (trackpad pinch) or shift+wheel
        if (!ctrlKey && !event.shiftKey) return;

        event.preventDefault();

        const zoomDelta = -dy * 0.01;
        const newZoom = clamp(state.zoom + zoomDelta, minZoom, maxZoom);

        // Get pointer position for zoom origin
        const container = containerRef?.current;
        const rect = container?.getBoundingClientRect();
        const centerX = event.clientX - (rect?.left || 0) - (rect?.width || window.innerWidth) / 2;
        const centerY = event.clientY - (rect?.top || 0) - (rect?.height || window.innerHeight) / 2;

        setState(prev => {
          const zoomRatio = newZoom / prev.zoom;
          const newPan = {
            x: centerX - (centerX - prev.pan.x) * zoomRatio,
            y: centerY - (centerY - prev.pan.y) * zoomRatio,
          };

          return {
            ...prev,
            zoom: newZoom,
            pan: newZoom === minZoom ? { x: 0, y: 0 } : newPan,
          };
        });

        onZoomChange?.(newZoom);
      },
    },
    {
      target: containerRef,
      drag: {
        from: () => [state.pan.x, state.pan.y],
        bounds: state.zoom > 1 ? undefined : { left: -100, right: 100, top: -50, bottom: 50 },
        rubberband: true,
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

  // Double-tap handling (separate from drag/pinch)
  useEffect(() => {
    if (!enabled) return;

    const container = containerRef?.current;
    if (!container) return;

    const handleDoubleTap = (event: TouchEvent | MouseEvent) => {
      const now = Date.now();
      const timeDelta = now - lastTapTimeRef.current;

      const clientX = event instanceof TouchEvent ? event.touches[0]?.clientX || event.changedTouches[0]?.clientX : event.clientX;
      const clientY = event instanceof TouchEvent ? event.touches[0]?.clientY || event.changedTouches[0]?.clientY : event.clientY;

      const distanceX = Math.abs(clientX - lastTapPositionRef.current.x);
      const distanceY = Math.abs(clientY - lastTapPositionRef.current.y);

      // Check for double tap (within 300ms and 50px)
      if (timeDelta < 300 && distanceX < 50 && distanceY < 50) {
        event.preventDefault();

        const rect = container.getBoundingClientRect();
        const point = {
          x: clientX - rect.left - rect.width / 2,
          y: clientY - rect.top - rect.height / 2,
        };

        // Toggle between min zoom and double-tap zoom
        if (state.zoom > minZoom + 0.1) {
          resetTransform();
        } else {
          zoomToPoint(doubleTapZoom, point);
        }

        lastTapTimeRef.current = 0;
      } else {
        lastTapTimeRef.current = now;
        lastTapPositionRef.current = { x: clientX, y: clientY };
      }
    };

    container.addEventListener('touchend', handleDoubleTap, { passive: false });
    container.addEventListener('dblclick', handleDoubleTap);

    return () => {
      container.removeEventListener('touchend', handleDoubleTap);
      container.removeEventListener('dblclick', handleDoubleTap);
    };
  }, [enabled, containerRef, state.zoom, minZoom, doubleTapZoom, resetTransform, zoomToPoint]);

  return {
    state,
    bind,
    resetTransform,
    setZoom,
    setPan,
    zoomToPoint,
    isZoomed: state.zoom > minZoom + 0.1,
    pullToRefresh: pullToRefreshState,
  };
}

export default useGalleryGestures;
