/**
 * useLightboxZoom Hook
 * Manages zoom, pan, and rotation state for the lightbox component
 * Extracted from Lightbox.tsx for reusability
 */

import { useState, useCallback, useRef } from 'react';

export interface ZoomState {
  zoom: number;
  pan: { x: number; y: number };
  rotation: number;
  isPanning: boolean;
}

export interface UseLightboxZoomOptions {
  /** Minimum zoom level (default: 0.5) */
  minZoom?: number;
  /** Maximum zoom level (default: 5) */
  maxZoom?: number;
  /** Zoom step for button controls (default: 0.25) */
  zoomStep?: number;
  /** Initial rotation in degrees (default: 0) */
  initialRotation?: number;
  /** Callback when zoom/pan changes */
  onChange?: (state: ZoomState) => void;
}

export interface UseLightboxZoomReturn {
  // State
  zoom: number;
  pan: { x: number; y: number };
  rotation: number;
  isPanning: boolean;

  // Zoom controls
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  setZoom: (zoom: number) => void;

  // Rotation controls
  rotate: (degrees?: number) => void;
  resetRotation: () => void;

  // Event handlers for mouse/touch
  handleWheel: (e: React.WheelEvent) => void;
  handleMouseDown: (e: React.MouseEvent) => void;
  handleMouseMove: (e: React.MouseEvent) => void;
  handleMouseUp: () => void;
  handleTouchStart: (e: React.TouchEvent) => void;
  handleTouchMove: (e: React.TouchEvent) => void;
  handleTouchEnd: () => void;

  // Reset all state (call when asset changes)
  reset: () => void;
}

export function useLightboxZoom(options: UseLightboxZoomOptions = {}): UseLightboxZoomReturn {
  const {
    minZoom = 0.5,
    maxZoom = 5,
    zoomStep = 0.25,
    initialRotation = 0,
    onChange,
  } = options;

  // Core state
  const [zoom, setZoomState] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [rotation, setRotation] = useState(initialRotation);

  // Refs for touch/pan tracking
  const panStartRef = useRef({ x: 0, y: 0 });
  const touchStartRef = useRef<{ x: number; y: number; distance: number } | null>(null);

  // Notify parent of changes
  const notifyChange = useCallback((newState: Partial<ZoomState>) => {
    if (onChange) {
      onChange({
        zoom,
        pan,
        rotation,
        isPanning,
        ...newState,
      });
    }
  }, [onChange, zoom, pan, rotation, isPanning]);

  // Zoom controls
  const zoomIn = useCallback(() => {
    setZoomState((prev) => {
      const newZoom = Math.min(maxZoom, prev + zoomStep);
      notifyChange({ zoom: newZoom });
      return newZoom;
    });
  }, [maxZoom, zoomStep, notifyChange]);

  const zoomOut = useCallback(() => {
    setZoomState((prev) => {
      const newZoom = Math.max(minZoom, prev - zoomStep);
      // Reset pan when zooming back to 1x or below
      if (newZoom <= 1) {
        setPan({ x: 0, y: 0 });
        notifyChange({ zoom: newZoom, pan: { x: 0, y: 0 } });
      } else {
        notifyChange({ zoom: newZoom });
      }
      return newZoom;
    });
  }, [minZoom, zoomStep, notifyChange]);

  const resetZoom = useCallback(() => {
    setZoomState(1);
    setPan({ x: 0, y: 0 });
    notifyChange({ zoom: 1, pan: { x: 0, y: 0 } });
  }, [notifyChange]);

  const setZoom = useCallback((newZoom: number) => {
    const clampedZoom = Math.max(minZoom, Math.min(maxZoom, newZoom));
    setZoomState(clampedZoom);
    if (clampedZoom <= 1) {
      setPan({ x: 0, y: 0 });
    }
    notifyChange({ zoom: clampedZoom });
  }, [minZoom, maxZoom, notifyChange]);

  // Rotation controls
  const rotate = useCallback((degrees = 90) => {
    setRotation((prev) => {
      const newRotation = (prev + degrees) % 360;
      notifyChange({ rotation: newRotation });
      return newRotation;
    });
  }, [notifyChange]);

  const resetRotation = useCallback(() => {
    setRotation(0);
    notifyChange({ rotation: 0 });
  }, [notifyChange]);

  // Mouse wheel zoom (Ctrl/Cmd + scroll)
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoomState((prev) => {
        const newZoom = Math.max(minZoom, Math.min(maxZoom, prev + delta));
        notifyChange({ zoom: newZoom });
        return newZoom;
      });
    }
  }, [minZoom, maxZoom, notifyChange]);

  // Mouse pan handling
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  }, [zoom, pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning && zoom > 1) {
      const newPan = {
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      };
      setPan(newPan);
    }
  }, [isPanning, zoom]);

  const handleMouseUp = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
      notifyChange({ isPanning: false });
    }
  }, [isPanning, notifyChange]);

  // Touch gestures for mobile (pinch-to-zoom)
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );
      touchStartRef.current = {
        x: (touch1.clientX + touch2.clientX) / 2,
        y: (touch1.clientY + touch2.clientY) / 2,
        distance,
      };
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchStartRef.current) {
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );
      const scale = distance / touchStartRef.current.distance;
      setZoomState((prev) => {
        const newZoom = Math.max(minZoom, Math.min(maxZoom, prev * scale));
        return newZoom;
      });
      touchStartRef.current.distance = distance;
    }
  }, [minZoom, maxZoom]);

  const handleTouchEnd = useCallback(() => {
    touchStartRef.current = null;
  }, []);

  // Reset all state (call when asset changes)
  const reset = useCallback(() => {
    setZoomState(1);
    setPan({ x: 0, y: 0 });
    setRotation(initialRotation);
    setIsPanning(false);
    touchStartRef.current = null;
    panStartRef.current = { x: 0, y: 0 };
  }, [initialRotation]);

  return {
    // State
    zoom,
    pan,
    rotation,
    isPanning,

    // Zoom controls
    zoomIn,
    zoomOut,
    resetZoom,
    setZoom,

    // Rotation controls
    rotate,
    resetRotation,

    // Event handlers
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,

    // Reset
    reset,
  };
}
