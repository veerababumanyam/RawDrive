/**
 * useImageTransform Hook
 *
 * Provides transform calculations for the Avatar Editor.
 * Handles CSS transform strings and canvas transform application.
 */

import { useMemo, useCallback } from 'react';
import { TransformState } from '../components/ui/AvatarEditor/types';

// =============================================================================
// Types
// =============================================================================

export interface UseImageTransformReturn {
  /** Calculate CSS transform string for preview */
  getPreviewTransform: (transform: TransformState) => string;

  /** Apply transforms to canvas context */
  applyToCanvas: (
    ctx: CanvasRenderingContext2D,
    transform: TransformState,
    imageSize: { width: number; height: number },
    canvasSize: { width: number; height: number }
  ) => void;

  /** Get bounding box after transforms */
  getTransformedBounds: (
    transform: TransformState,
    imageSize: { width: number; height: number }
  ) => { width: number; height: number };

  /** Calculate CSS filter string */
  getFilterString: (filters: {
    brightness: number;
    contrast: number;
    saturation: number;
  }) => string;
}

// =============================================================================
// Hook
// =============================================================================

export const useImageTransform = (): UseImageTransformReturn => {
  /**
   * Get CSS transform string for preview
   * Used for real-time preview during editing
   */
  const getPreviewTransform = useCallback((transform: TransformState): string => {
    const { rotation, flipHorizontal, flipVertical } = transform;
    const transforms: string[] = [];

    // Apply rotation
    if (rotation !== 0) {
      transforms.push(`rotate(${rotation}deg)`);
    }

    // Apply flips
    if (flipHorizontal || flipVertical) {
      const scaleX = flipHorizontal ? -1 : 1;
      const scaleY = flipVertical ? -1 : 1;
      transforms.push(`scale(${scaleX}, ${scaleY})`);
    }

    return transforms.length > 0 ? transforms.join(' ') : 'none';
  }, []);

  /**
   * Apply transforms to a canvas context
   * Used during image export
   */
  const applyToCanvas = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      transform: TransformState,
      imageSize: { width: number; height: number },
      canvasSize: { width: number; height: number }
    ): void => {
      const { rotation, flipHorizontal, flipVertical, zoom } = transform;

      // Move origin to center
      ctx.translate(canvasSize.width / 2, canvasSize.height / 2);

      // Apply rotation
      if (rotation !== 0) {
        ctx.rotate((rotation * Math.PI) / 180);
      }

      // Apply scale (zoom + flip)
      const scaleX = (flipHorizontal ? -1 : 1) * zoom;
      const scaleY = (flipVertical ? -1 : 1) * zoom;
      ctx.scale(scaleX, scaleY);

      // Move origin back
      ctx.translate(-imageSize.width / 2, -imageSize.height / 2);
    },
    []
  );

  /**
   * Calculate bounding box after rotation
   * Used to determine canvas size needed after transforms
   */
  const getTransformedBounds = useCallback(
    (
      transform: TransformState,
      imageSize: { width: number; height: number }
    ): { width: number; height: number } => {
      const { rotation } = transform;
      const { width, height } = imageSize;

      if (rotation === 0 || rotation === 180 || rotation === -180) {
        return { width, height };
      }

      if (rotation === 90 || rotation === -90 || rotation === 270 || rotation === -270) {
        return { width: height, height: width };
      }

      // For arbitrary rotation, calculate bounding box
      const radians = (Math.abs(rotation) * Math.PI) / 180;
      const cos = Math.abs(Math.cos(radians));
      const sin = Math.abs(Math.sin(radians));

      const newWidth = width * cos + height * sin;
      const newHeight = width * sin + height * cos;

      return {
        width: Math.ceil(newWidth),
        height: Math.ceil(newHeight),
      };
    },
    []
  );

  /**
   * Get CSS filter string
   */
  const getFilterString = useCallback(
    (filters: { brightness: number; contrast: number; saturation: number }): string => {
      const { brightness, contrast, saturation } = filters;
      const filterValues: string[] = [];

      if (brightness !== 0) {
        filterValues.push(`brightness(${100 + brightness}%)`);
      }
      if (contrast !== 0) {
        filterValues.push(`contrast(${100 + contrast}%)`);
      }
      if (saturation !== 0) {
        filterValues.push(`saturate(${100 + saturation}%)`);
      }

      return filterValues.length > 0 ? filterValues.join(' ') : 'none';
    },
    []
  );

  return useMemo(
    () => ({
      getPreviewTransform,
      applyToCanvas,
      getTransformedBounds,
      getFilterString,
    }),
    [getPreviewTransform, applyToCanvas, getTransformedBounds, getFilterString]
  );
};

export default useImageTransform;
