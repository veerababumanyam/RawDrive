/**
 * AvatarEditor Component
 *
 * Main orchestrator component for the Avatar Editor.
 * Composes AvatarEditorCanvas and AvatarEditorControls with
 * the useAvatarEditor hook for state management.
 *
 * Features:
 * - Image loading from File or URL
 * - Zoom, pan, rotation, flip
 * - Brightness, contrast, saturation filters
 * - Configurable aspect ratio and crop shape
 * - Keyboard shortcuts
 * - Loading and error states
 */

import React, { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { useAvatarEditor } from '../../../hooks/useAvatarEditor';

// =============================================================================
// Screen Reader Announcements Hook
// =============================================================================

/**
 * Hook to manage screen reader announcements via a live region
 */
const useAnnouncer = () => {
  const [announcement, setAnnouncement] = useState('');
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const announce = useCallback((message: string) => {
    // Clear previous timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    // Clear and set announcement (clearing first ensures announcement even if same message)
    setAnnouncement('');
    // Small delay to ensure screen reader catches the change
    setTimeout(() => setAnnouncement(message), 50);
    // Clear after announcement
    timeoutRef.current = setTimeout(() => setAnnouncement(''), 2000);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { announcement, announce };
};

/**
 * Hook to detect prefers-reduced-motion
 */
const usePrefersReducedMotion = () => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return prefersReducedMotion;
};

import { AvatarEditorCanvas } from './AvatarEditorCanvas';
import { AvatarEditorControls } from './AvatarEditorControls';
import { AppButton } from '../AppButton';
import {
  AvatarEditorProps,
  EDITOR_DEFAULTS,
  CONTROL_RANGES,
  Point,
  Area,
} from './types';

// =============================================================================
// Keyboard Shortcuts
// =============================================================================

const KEYBOARD_SHORTCUTS = {
  'r': 'rotate90Cw',
  'R': 'rotate90Ccw', // Shift+R
  'h': 'flipH',
  'v': 'flipV',
  '0': 'resetAll',
  'Enter': 'save',
  'Escape': 'cancel',
} as const;

// =============================================================================
// Component
// =============================================================================

export const AvatarEditor: React.FC<AvatarEditorProps> = ({
  file,
  imageSrc: externalImageSrc,
  aspectRatio = EDITOR_DEFAULTS.aspectRatio,
  cropShape = EDITOR_DEFAULTS.cropShape,
  onSave,
  onCancel,
  maxOutputSize = EDITOR_DEFAULTS.maxOutputSize,
  quality = EDITOR_DEFAULTS.quality,
  outputFormat = EDITOR_DEFAULTS.outputFormat,
  isLoading: externalLoading = false,
  enableFilters = EDITOR_DEFAULTS.enableFilters,
  enableRotation = EDITOR_DEFAULTS.enableRotation,
  enableFlip = EDITOR_DEFAULTS.enableFlip,
  className,
}) => {
  const editor = useAvatarEditor();
  const { announcement, announce } = useAnnouncer();
  // Hook available for future use to disable CSS transitions (T027)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const prefersReducedMotion = usePrefersReducedMotion();

  // Track previous values for announcements
  const prevValuesRef = useRef<{
    zoom: number;
    rotation: number;
    flipH: boolean;
    flipV: boolean;
    brightness: number;
    contrast: number;
    saturation: number;
  } | null>(null);

  const {
    imageSrc,
    imageLoaded,
    zoom,
    pan,
    rotation,
    flipHorizontal,
    flipVertical,
    filters,
    isDirty,
    isProcessing,
    error,
    cssFilters,
    canSave,
    loadImage,
    setZoom,
    setPan,
    setRotation,
    rotate90,
    toggleFlipH,
    toggleFlipV,
    setBrightness,
    setContrast,
    setSaturation,
    setCropArea,
    resetTransforms,
    resetFilters,
    resetAll,
    exportImage,
  } = editor;

  // Load image on mount or when file/imageSrc changes
  useEffect(() => {
    if (file) {
      loadImage(file);
    } else if (externalImageSrc) {
      loadImage(externalImageSrc);
    }
  }, [file, externalImageSrc, loadImage]);

  // Announce state changes for screen readers
  useEffect(() => {
    const prev = prevValuesRef.current;

    // Skip first render
    if (!prev) {
      prevValuesRef.current = {
        zoom,
        rotation,
        flipH: flipHorizontal,
        flipV: flipVertical,
        brightness: filters.brightness,
        contrast: filters.contrast,
        saturation: filters.saturation,
      };
      return;
    }

    // Build announcement message
    const messages: string[] = [];

    if (prev.zoom !== zoom) {
      messages.push(`Zoom ${Math.round(zoom * 100)}%`);
    }
    if (prev.rotation !== rotation) {
      messages.push(`Rotation ${rotation}°`);
    }
    if (prev.flipH !== flipHorizontal) {
      messages.push(flipHorizontal ? 'Flipped horizontally' : 'Horizontal flip removed');
    }
    if (prev.flipV !== flipVertical) {
      messages.push(flipVertical ? 'Flipped vertically' : 'Vertical flip removed');
    }
    if (prev.brightness !== filters.brightness) {
      messages.push(`Brightness ${filters.brightness > 0 ? '+' : ''}${filters.brightness}`);
    }
    if (prev.contrast !== filters.contrast) {
      messages.push(`Contrast ${filters.contrast > 0 ? '+' : ''}${filters.contrast}`);
    }
    if (prev.saturation !== filters.saturation) {
      messages.push(`Saturation ${filters.saturation > 0 ? '+' : ''}${filters.saturation}`);
    }

    if (messages.length > 0) {
      announce(messages.join('. '));
    }

    // Update previous values
    prevValuesRef.current = {
      zoom,
      rotation,
      flipH: flipHorizontal,
      flipV: flipVertical,
      brightness: filters.brightness,
      contrast: filters.contrast,
      saturation: filters.saturation,
    };
  }, [zoom, rotation, flipHorizontal, flipVertical, filters, announce]);

  // Handle crop change from canvas
  const handleCropChange = useCallback(
    (crop: Point) => {
      setPan(crop);
    },
    [setPan]
  );

  // Handle crop complete from canvas
  const handleCropComplete = useCallback(
    (_croppedArea: Area, croppedAreaPixels: Area) => {
      setCropArea(croppedAreaPixels);
    },
    [setCropArea]
  );

  // Handle rotation gesture from touch
  const handleRotationGesture = useCallback(
    (angleDelta: number) => {
      if (!enableRotation) return;
      const newRotation = Math.max(
        CONTROL_RANGES.rotation.min,
        Math.min(CONTROL_RANGES.rotation.max, rotation + angleDelta)
      );
      setRotation(newRotation);
    },
    [enableRotation, rotation, setRotation]
  );

  // Handle save
  const handleSave = useCallback(async () => {
    if (!canSave || isProcessing || externalLoading) return;

    try {
      const result = await exportImage({
        maxSize: maxOutputSize,
        quality,
        format: outputFormat,
      });
      onSave(result.file, result.cropData);
    } catch (err) {
      console.error('Failed to export image:', err);
    }
  }, [canSave, isProcessing, externalLoading, exportImage, maxOutputSize, quality, outputFormat, onSave]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Get the shortcut action
      const key = e.shiftKey && e.key.toLowerCase() === 'r' ? 'R' : e.key;
      const action = KEYBOARD_SHORTCUTS[key as keyof typeof KEYBOARD_SHORTCUTS];

      if (!action) return;

      switch (action) {
        case 'rotate90Cw':
          if (enableRotation) {
            e.preventDefault();
            rotate90('cw');
          }
          break;
        case 'rotate90Ccw':
          if (enableRotation) {
            e.preventDefault();
            rotate90('ccw');
          }
          break;
        case 'flipH':
          if (enableFlip) {
            e.preventDefault();
            toggleFlipH();
          }
          break;
        case 'flipV':
          if (enableFlip) {
            e.preventDefault();
            toggleFlipV();
          }
          break;
        case 'resetAll':
          e.preventDefault();
          resetAll();
          break;
        case 'save':
          e.preventDefault();
          handleSave();
          break;
        case 'cancel':
          e.preventDefault();
          onCancel();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    enableRotation,
    enableFlip,
    rotate90,
    toggleFlipH,
    toggleFlipV,
    resetAll,
    handleSave,
    onCancel,
  ]);

  // Combined loading state
  const isLoading = isProcessing || externalLoading;

  // Memoize controls props
  const controlsProps = useMemo(
    () => ({
      zoom,
      rotation,
      flipHorizontal,
      flipVertical,
      brightness: filters.brightness,
      contrast: filters.contrast,
      saturation: filters.saturation,
      enableRotation,
      enableFlip,
      enableFilters,
      onZoomChange: setZoom,
      onRotationChange: setRotation,
      onRotate90: rotate90,
      onFlipH: toggleFlipH,
      onFlipV: toggleFlipV,
      onBrightnessChange: setBrightness,
      onContrastChange: setContrast,
      onSaturationChange: setSaturation,
      onResetTransforms: resetTransforms,
      onResetFilters: resetFilters,
      onResetAll: resetAll,
      isDirty,
    }),
    [
      zoom,
      rotation,
      flipHorizontal,
      flipVertical,
      filters,
      enableRotation,
      enableFlip,
      enableFilters,
      setZoom,
      setRotation,
      rotate90,
      toggleFlipH,
      toggleFlipV,
      setBrightness,
      setContrast,
      setSaturation,
      resetTransforms,
      resetFilters,
      resetAll,
      isDirty,
    ]
  );

  // Detect compact mode (no advanced features = avatar-only mode)
  const isCompactMode = !enableRotation && !enableFlip && !enableFilters;

  return (
    <div className={`flex flex-col ${className || ''}`}>
      {/* Error Display */}
      {error && (
        <div
          className="flex items-center gap-2 p-3 mb-3 bg-error/10 text-error rounded-lg"
          role="alert"
        >
          <AlertCircle size={16} />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Loading State - Smaller for compact mode */}
      {!imageLoaded && !error && (
        <div className={`flex items-center justify-center bg-surface-hover rounded-lg ${
          isCompactMode ? 'h-56' : 'h-64 sm:h-80'
        }`}>
          <Loader2 className="w-6 h-6 animate-spin text-text-tertiary" />
        </div>
      )}

      {/* Canvas */}
      {imageLoaded && imageSrc && (
        <AvatarEditorCanvas
          imageSrc={imageSrc}
          crop={pan}
          zoom={zoom}
          rotation={rotation}
          aspect={aspectRatio}
          cropShape={cropShape}
          cssFilters={cssFilters}
          flipHorizontal={flipHorizontal}
          flipVertical={flipVertical}
          onCropChange={handleCropChange}
          onZoomChange={setZoom}
          onCropComplete={handleCropComplete}
          onRotationGesture={enableRotation ? handleRotationGesture : undefined}
        />
      )}

      {/* Controls */}
      {imageLoaded && <AvatarEditorControls {...controlsProps} />}

      {/* Footer Actions - Compact in avatar mode */}
      <div className={`flex items-center justify-end gap-3 border-t border-border ${
        isCompactMode ? 'pt-3' : 'pt-4'
      }`}>
        <AppButton
          variant="outline"
          onClick={onCancel}
          disabled={isLoading}
          size={isCompactMode ? 'sm' : 'md'}
        >
          Cancel
        </AppButton>
        <AppButton
          variant="primary"
          onClick={handleSave}
          disabled={!canSave || isLoading}
          isLoading={isLoading}
          size={isCompactMode ? 'sm' : 'md'}
        >
          {isLoading ? 'Saving...' : 'Save'}
        </AppButton>
      </div>

      {/* Screen Reader Live Region for Announcements */}
      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </div>

      {/* Keyboard Shortcuts Help (screen reader only) */}
      <div className="sr-only" id="avatar-editor-shortcuts">
        Keyboard shortcuts available: R to rotate clockwise, Shift+R to rotate counter-clockwise,
        H to flip horizontal, V to flip vertical, 0 to reset all, Enter to save, Escape to cancel.
      </div>
    </div>
  );
};

AvatarEditor.displayName = 'AvatarEditor';

export default AvatarEditor;
