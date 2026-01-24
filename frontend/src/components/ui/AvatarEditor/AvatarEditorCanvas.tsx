/**
 * AvatarEditorCanvas Component
 *
 * Canvas area for displaying and manipulating the avatar image.
 * Integrates react-easy-crop for crop functionality and
 * useTouchGestures for two-finger rotation.
 */

import React, { useCallback, useMemo, useRef } from 'react';
import Cropper, { Area, Point } from 'react-easy-crop';
import { useTouchGestures } from '../../../hooks/useTouchGestures';
import { AvatarEditorCanvasProps, CONTROL_RANGES } from './types';

export const AvatarEditorCanvas: React.FC<AvatarEditorCanvasProps> = ({
  imageSrc,
  crop,
  zoom,
  rotation,
  aspect,
  cropShape,
  cssFilters,
  flipHorizontal,
  flipVertical,
  onCropChange,
  onZoomChange,
  onCropComplete,
  onRotationGesture,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Handle two-finger rotation gesture
  const { bind: gestureBinds } = useTouchGestures({
    onRotate: useCallback(
      (angleDelta: number) => {
        if (onRotationGesture) {
          onRotationGesture(angleDelta);
        }
      },
      [onRotationGesture]
    ),
    enabled: !!onRotationGesture,
    rotationThreshold: 2,
    rotationSensitivity: 0.5,
  });

  // Handle crop change
  const handleCropChange = useCallback(
    (location: Point) => {
      onCropChange(location);
    },
    [onCropChange]
  );

  // Handle zoom change (from wheel or pinch)
  const handleZoomChange = useCallback(
    (newZoom: number) => {
      const clampedZoom = Math.min(
        Math.max(newZoom, CONTROL_RANGES.zoom.min),
        CONTROL_RANGES.zoom.max
      );
      onZoomChange(clampedZoom);
    },
    [onZoomChange]
  );

  // Handle crop complete
  const handleCropComplete = useCallback(
    (croppedArea: Area, croppedAreaPixels: Area) => {
      onCropComplete(croppedArea, croppedAreaPixels);
    },
    [onCropComplete]
  );

  // Calculate CSS transform for flip preview
  const flipTransform = useMemo(() => {
    if (!flipHorizontal && !flipVertical) return undefined;
    const scaleX = flipHorizontal ? -1 : 1;
    const scaleY = flipVertical ? -1 : 1;
    return `scale(${scaleX}, ${scaleY})`;
  }, [flipHorizontal, flipVertical]);

  // Custom styles for the cropper to apply filters and flips
  const mediaStyle = useMemo(
    () => ({
      filter: cssFilters !== 'none' ? cssFilters : undefined,
      transform: flipTransform,
    }),
    [cssFilters, flipTransform]
  );

  return (
    <div
      ref={containerRef}
      className="relative w-full aspect-square max-h-64 bg-black/90 rounded-lg overflow-hidden"
      role="application"
      aria-label="Image editing area. Use mouse wheel to zoom, drag to pan, and controls below to adjust."
      aria-describedby="canvas-instructions"
      {...gestureBinds()}
    >
      {/* Screen reader instructions */}
      <div id="canvas-instructions" className="sr-only">
        Use the mouse wheel or pinch gesture to zoom in and out.
        Drag the image to reposition it within the crop area.
        Use the sliders and buttons below to rotate, flip, and adjust filters.
      </div>

      <Cropper
        image={imageSrc}
        crop={crop}
        zoom={zoom}
        rotation={rotation}
        aspect={aspect}
        cropShape={cropShape}
        showGrid={false}
        onCropChange={handleCropChange}
        onZoomChange={handleZoomChange}
        onCropComplete={handleCropComplete}
        minZoom={CONTROL_RANGES.zoom.min}
        maxZoom={CONTROL_RANGES.zoom.max}
        zoomSpeed={0.2}
        mediaProps={{
          style: mediaStyle,
        }}
        classes={{
          containerClassName: 'rounded-lg',
          cropAreaClassName: cropShape === 'round' ? 'rounded-full' : 'rounded-lg',
        }}
        style={{
          containerStyle: {
            width: '100%',
            height: '100%',
          },
          cropAreaStyle: {
            border: '2px solid white',
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
          },
        }}
      />

    </div>
  );
};

AvatarEditorCanvas.displayName = 'AvatarEditorCanvas';

export default AvatarEditorCanvas;
