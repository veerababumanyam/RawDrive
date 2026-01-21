/**
 * useLightboxCompare Hook
 * Manages compare mode state with synchronized zoom/pan between two images
 */

import { useState, useCallback, useRef, useEffect } from 'react';

export interface CompareZoomState {
  /** Current zoom level */
  zoom: number;
  /** Current pan position */
  pan: { x: number; y: number };
}

export interface UseLightboxCompareOptions {
  /** Whether compare mode is enabled */
  enabled?: boolean;
  /** Primary image index */
  primaryIndex: number;
  /** Secondary image index (for comparison) */
  secondaryIndex: number | null;
  /** Whether to sync zoom between images */
  syncZoom?: boolean;
  /** Whether to sync pan between images */
  syncPan?: boolean;
  /** Minimum zoom level (default: 0.5) */
  minZoom?: number;
  /** Maximum zoom level (default: 5) */
  maxZoom?: number;
  /** Callback when primary index changes */
  onPrimaryChange?: (index: number) => void;
  /** Callback when secondary index changes */
  onSecondaryChange?: (index: number) => void;
}

export interface UseLightboxCompareReturn {
  /** Primary image zoom state */
  primaryState: CompareZoomState;
  /** Secondary image zoom state */
  secondaryState: CompareZoomState;
  /** Set primary zoom level */
  setPrimaryZoom: (zoom: number) => void;
  /** Set primary pan position */
  setPrimaryPan: (pan: { x: number; y: number }) => void;
  /** Set secondary zoom level */
  setSecondaryZoom: (zoom: number) => void;
  /** Set secondary pan position */
  setSecondaryPan: (pan: { x: number; y: number }) => void;
  /** Zoom both images in */
  zoomIn: () => void;
  /** Zoom both images out */
  zoomOut: () => void;
  /** Reset zoom and pan for both images */
  reset: () => void;
  /** Swap primary and secondary images */
  swap: () => void;
  /** Whether zoom is synced */
  isSyncedZoom: boolean;
  /** Whether pan is synced */
  isSyncedPan: boolean;
  /** Toggle zoom sync */
  toggleSyncZoom: () => void;
  /** Toggle pan sync */
  toggleSyncPan: () => void;
  /** Handle wheel event for zoom */
  handleWheel: (e: React.WheelEvent, target: 'primary' | 'secondary') => void;
  /** Handle drag start */
  handleDragStart: (e: React.MouseEvent | React.TouchEvent, target: 'primary' | 'secondary') => void;
  /** Handle drag move */
  handleDragMove: (e: React.MouseEvent | React.TouchEvent) => void;
  /** Handle drag end */
  handleDragEnd: () => void;
  /** Whether dragging is active */
  isDragging: boolean;
}

const defaultZoomState: CompareZoomState = {
  zoom: 1,
  pan: { x: 0, y: 0 },
};

/**
 * useLightboxCompare - Compare mode with synchronized zoom/pan
 *
 * @example
 * ```tsx
 * const compare = useLightboxCompare({
 *   primaryIndex: currentIndex,
 *   secondaryIndex: compareIndex,
 *   syncZoom: true,
 *   syncPan: true,
 * });
 *
 * // Use in components
 * <img style={{ transform: `scale(${compare.primaryState.zoom})` }} />
 * ```
 */
export function useLightboxCompare(options: UseLightboxCompareOptions): UseLightboxCompareReturn {
  const {
    enabled = true,
    primaryIndex,
    secondaryIndex,
    syncZoom: initialSyncZoom = true,
    syncPan: initialSyncPan = true,
    minZoom = 0.5,
    maxZoom = 5,
    onPrimaryChange,
    onSecondaryChange,
  } = options;

  // State
  const [primaryState, setPrimaryState] = useState<CompareZoomState>(defaultZoomState);
  const [secondaryState, setSecondaryState] = useState<CompareZoomState>(defaultZoomState);
  const [isSyncedZoom, setIsSyncedZoom] = useState(initialSyncZoom);
  const [isSyncedPan, setIsSyncedPan] = useState(initialSyncPan);
  const [isDragging, setIsDragging] = useState(false);

  // Refs for drag handling
  const dragTargetRef = useRef<'primary' | 'secondary' | null>(null);
  const lastPositionRef = useRef({ x: 0, y: 0 });

  // Clamp zoom within bounds
  const clampZoom = useCallback(
    (z: number) => Math.min(Math.max(z, minZoom), maxZoom),
    [minZoom, maxZoom]
  );

  // Reset when indices change
  useEffect(() => {
    if (enabled) {
      setPrimaryState(defaultZoomState);
      setSecondaryState(defaultZoomState);
    }
  }, [primaryIndex, secondaryIndex, enabled]);

  // Set primary zoom
  const setPrimaryZoom = useCallback(
    (zoom: number) => {
      const clampedZoom = clampZoom(zoom);
      setPrimaryState((prev) => ({ ...prev, zoom: clampedZoom }));

      if (isSyncedZoom) {
        setSecondaryState((prev) => ({ ...prev, zoom: clampedZoom }));
      }
    },
    [clampZoom, isSyncedZoom]
  );

  // Set primary pan
  const setPrimaryPan = useCallback(
    (pan: { x: number; y: number }) => {
      setPrimaryState((prev) => ({ ...prev, pan }));

      if (isSyncedPan) {
        setSecondaryState((prev) => ({ ...prev, pan }));
      }
    },
    [isSyncedPan]
  );

  // Set secondary zoom
  const setSecondaryZoom = useCallback(
    (zoom: number) => {
      const clampedZoom = clampZoom(zoom);
      setSecondaryState((prev) => ({ ...prev, zoom: clampedZoom }));

      if (isSyncedZoom) {
        setPrimaryState((prev) => ({ ...prev, zoom: clampedZoom }));
      }
    },
    [clampZoom, isSyncedZoom]
  );

  // Set secondary pan
  const setSecondaryPan = useCallback(
    (pan: { x: number; y: number }) => {
      setSecondaryState((prev) => ({ ...prev, pan }));

      if (isSyncedPan) {
        setPrimaryState((prev) => ({ ...prev, pan }));
      }
    },
    [isSyncedPan]
  );

  // Zoom in (both images when synced)
  const zoomIn = useCallback(() => {
    const newZoom = clampZoom(primaryState.zoom * 1.25);
    setPrimaryState((prev) => ({ ...prev, zoom: newZoom }));

    if (isSyncedZoom) {
      setSecondaryState((prev) => ({ ...prev, zoom: newZoom }));
    }
  }, [primaryState.zoom, clampZoom, isSyncedZoom]);

  // Zoom out (both images when synced)
  const zoomOut = useCallback(() => {
    const newZoom = clampZoom(primaryState.zoom / 1.25);
    setPrimaryState((prev) => ({ ...prev, zoom: newZoom }));

    if (isSyncedZoom) {
      setSecondaryState((prev) => ({ ...prev, zoom: newZoom }));
    }
  }, [primaryState.zoom, clampZoom, isSyncedZoom]);

  // Reset both images
  const reset = useCallback(() => {
    setPrimaryState(defaultZoomState);
    setSecondaryState(defaultZoomState);
  }, []);

  // Swap primary and secondary
  const swap = useCallback(() => {
    if (secondaryIndex !== null && onPrimaryChange && onSecondaryChange) {
      onPrimaryChange(secondaryIndex);
      onSecondaryChange(primaryIndex);
    }
  }, [primaryIndex, secondaryIndex, onPrimaryChange, onSecondaryChange]);

  // Toggle sync zoom
  const toggleSyncZoom = useCallback(() => {
    setIsSyncedZoom((prev) => {
      if (!prev) {
        // When enabling sync, match secondary to primary
        setSecondaryState((s) => ({ ...s, zoom: primaryState.zoom }));
      }
      return !prev;
    });
  }, [primaryState.zoom]);

  // Toggle sync pan
  const toggleSyncPan = useCallback(() => {
    setIsSyncedPan((prev) => {
      if (!prev) {
        // When enabling sync, match secondary to primary
        setSecondaryState((s) => ({ ...s, pan: primaryState.pan }));
      }
      return !prev;
    });
  }, [primaryState.pan]);

  // Handle wheel event for zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent, target: 'primary' | 'secondary') => {
      if (!enabled) return;

      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;

      if (target === 'primary') {
        const newZoom = clampZoom(primaryState.zoom + delta);
        setPrimaryState((prev) => ({ ...prev, zoom: newZoom }));

        if (isSyncedZoom) {
          setSecondaryState((prev) => ({ ...prev, zoom: newZoom }));
        }
      } else {
        const newZoom = clampZoom(secondaryState.zoom + delta);
        setSecondaryState((prev) => ({ ...prev, zoom: newZoom }));

        if (isSyncedZoom) {
          setPrimaryState((prev) => ({ ...prev, zoom: newZoom }));
        }
      }
    },
    [enabled, primaryState.zoom, secondaryState.zoom, clampZoom, isSyncedZoom]
  );

  // Get position from mouse or touch event
  const getEventPosition = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    if ('touches' in e && e.touches.length > 0) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    if ('clientX' in e) {
      return { x: e.clientX, y: e.clientY };
    }
    return { x: 0, y: 0 };
  };

  // Handle drag start
  const handleDragStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent, target: 'primary' | 'secondary') => {
      if (!enabled) return;

      // Only allow drag when zoomed in
      const state = target === 'primary' ? primaryState : secondaryState;
      if (state.zoom <= 1) return;

      e.preventDefault();
      setIsDragging(true);
      dragTargetRef.current = target;
      lastPositionRef.current = getEventPosition(e);
    },
    [enabled, primaryState, secondaryState]
  );

  // Handle drag move
  const handleDragMove = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!isDragging || !dragTargetRef.current) return;

      e.preventDefault();
      const pos = getEventPosition(e);
      const deltaX = pos.x - lastPositionRef.current.x;
      const deltaY = pos.y - lastPositionRef.current.y;
      lastPositionRef.current = pos;

      const updatePan = (prev: CompareZoomState) => ({
        ...prev,
        pan: {
          x: prev.pan.x + deltaX,
          y: prev.pan.y + deltaY,
        },
      });

      if (dragTargetRef.current === 'primary') {
        setPrimaryState(updatePan);
        if (isSyncedPan) {
          setSecondaryState(updatePan);
        }
      } else {
        setSecondaryState(updatePan);
        if (isSyncedPan) {
          setPrimaryState(updatePan);
        }
      }
    },
    [isDragging, isSyncedPan]
  );

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    dragTargetRef.current = null;
  }, []);

  // Add global mouse/touch event listeners for drag
  useEffect(() => {
    if (!isDragging) return;

    const handleGlobalMove = (e: MouseEvent | TouchEvent) => {
      if (!isDragging || !dragTargetRef.current) return;

      const pos = getEventPosition(e);
      const deltaX = pos.x - lastPositionRef.current.x;
      const deltaY = pos.y - lastPositionRef.current.y;
      lastPositionRef.current = pos;

      const updatePan = (prev: CompareZoomState) => ({
        ...prev,
        pan: {
          x: prev.pan.x + deltaX,
          y: prev.pan.y + deltaY,
        },
      });

      if (dragTargetRef.current === 'primary') {
        setPrimaryState(updatePan);
        if (isSyncedPan) {
          setSecondaryState(updatePan);
        }
      } else {
        setSecondaryState(updatePan);
        if (isSyncedPan) {
          setPrimaryState(updatePan);
        }
      }
    };

    const handleGlobalEnd = () => {
      setIsDragging(false);
      dragTargetRef.current = null;
    };

    window.addEventListener('mousemove', handleGlobalMove);
    window.addEventListener('mouseup', handleGlobalEnd);
    window.addEventListener('touchmove', handleGlobalMove);
    window.addEventListener('touchend', handleGlobalEnd);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMove);
      window.removeEventListener('mouseup', handleGlobalEnd);
      window.removeEventListener('touchmove', handleGlobalMove);
      window.removeEventListener('touchend', handleGlobalEnd);
    };
  }, [isDragging, isSyncedPan]);

  return {
    primaryState,
    secondaryState,
    setPrimaryZoom,
    setPrimaryPan,
    setSecondaryZoom,
    setSecondaryPan,
    zoomIn,
    zoomOut,
    reset,
    swap,
    isSyncedZoom,
    isSyncedPan,
    toggleSyncZoom,
    toggleSyncPan,
    handleWheel,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    isDragging,
  };
}

export default useLightboxCompare;
