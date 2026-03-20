/**
 * PlayerZoomContainer
 * Wraps the current photo in react-zoom-pan-pinch TransformWrapper
 * for smooth zoom (1x-5x), pan, pinch, and double-tap toggle (2x).
 * Exposes resetTransform via ref for parent to reset on asset change.
 */
import React, { useEffect, useCallback, useImperativeHandle, forwardRef, useRef, useState } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import type { PublicGalleryAsset } from '../../../../types/gallery';
import { useProgressiveImage } from '../../../../hooks/useProgressiveImage';

export interface PlayerZoomContainerRef {
  /** Reset zoom/pan to initial state */
  resetTransform: () => void;
}

export interface PlayerZoomContainerProps {
  /** The asset to display */
  asset: PublicGalleryAsset;
  /** Gallery ID for building preview URL */
  galleryId: string;
  /** Callback when zoom scale changes (used to disable swipe when zoomed) */
  onZoomChange?: (scale: number) => void;
}

export const PlayerZoomContainer = forwardRef<PlayerZoomContainerRef, PlayerZoomContainerProps>(
  ({ asset, galleryId, onZoomChange }, ref) => {
    const resetRef = useRef<(() => void) | null>(null);
    const previewUrl = `/api/v1/public/galleries/${galleryId}/assets/${asset.asset_id}/preview`;
    const { currentSrc, isLoaded } = useProgressiveImage({ src: previewUrl, lqip: (asset as any).lqip });

    useImperativeHandle(ref, () => ({
      resetTransform: () => {
        resetRef.current?.();
      },
    }));

    const handleTransform = useCallback(
      (_ref: any, state: { scale: number }) => {
        onZoomChange?.(state.scale);
      },
      [onZoomChange],
    );

    return (
      <div className="flex items-center justify-center w-full h-full" data-testid="zoom-container">
        <TransformWrapper
          minScale={1}
          maxScale={5}
          doubleClick={{ mode: 'toggle', step: 2 }}
          wheel={{ step: 0.1 }}
          pinch={{ step: 5 }}
          centerOnInit={true}
          limitToBounds={true}
          onTransformed={handleTransform}
        >
          {({ resetTransform: reset }) => {
            // Store resetTransform for imperative handle
            resetRef.current = reset;

            return (
              <TransformComponent
                wrapperClass="!w-full !h-full flex items-center justify-center"
                contentClass="flex items-center justify-center"
              >
                <img
                  src={currentSrc}
                  alt={asset.filename}
                  className="max-w-[90vw] max-h-[85vh] object-contain select-none"
                  draggable={false}
                  style={{
                    filter: isLoaded ? 'blur(0px)' : 'blur(20px)',
                    transform: isLoaded ? 'scale(1)' : 'scale(1.05)',
                    transition: 'filter 300ms ease-out, transform 300ms ease-out',
                  }}
                />
              </TransformComponent>
            );
          }}
        </TransformWrapper>
      </div>
    );
  },
);

PlayerZoomContainer.displayName = 'PlayerZoomContainer';
