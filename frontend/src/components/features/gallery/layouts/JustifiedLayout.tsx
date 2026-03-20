/**
 * JustifiedLayout — Flickr-style uniform-height row layout.
 *
 * Uses the justified-layout npm package (by Flickr) to compute row geometry,
 * then renders absolutely positioned ProgressiveImages based on the computed
 * box coordinates.
 *
 * @module layouts/JustifiedLayout
 */

import React, { useMemo } from 'react';
import justifiedLayout from 'justified-layout';
import { ProgressiveImage } from './ProgressiveImage';
import type { LayoutRendererProps, LayoutAsset } from './types';

// ---------------------------------------------------------------------------
// Responsive target row height (container-width based)
// ---------------------------------------------------------------------------

function getTargetRowHeight(containerWidth: number): number {
  if (containerWidth < 640) return 180;
  if (containerWidth < 1024) return 220;
  return 240;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const JustifiedLayout: React.FC<LayoutRendererProps> = ({
  assets,
  containerWidth,
  gap = 8,
  onAssetClick,
}) => {
  const geometry = useMemo(() => {
    if (containerWidth <= 0 || assets.length === 0) return null;

    const aspectRatios = assets.map((a) => a.aspectRatio);
    const targetRowHeight = getTargetRowHeight(containerWidth);

    return justifiedLayout(aspectRatios, {
      containerWidth,
      targetRowHeight,
      boxSpacing: gap,
    });
  }, [assets, containerWidth, gap]);

  if (!geometry || containerWidth <= 0) return null;

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: geometry.containerHeight,
      }}
    >
      {geometry.boxes.map((box: { top: number; left: number; width: number; height: number }, i: number) => {
        const asset: LayoutAsset = assets[i];
        if (!asset) return null;

        return (
          <div
            key={asset.asset_id}
            style={{
              position: 'absolute',
              top: box.top,
              left: box.left,
              width: box.width,
              height: box.height,
            }}
            onClick={
              onAssetClick ? () => onAssetClick(asset, i) : undefined
            }
          >
            <ProgressiveImage
              src={asset.src}
              lqip={asset.lqip}
              width={asset.width}
              height={asset.height}
              alt={asset.alt}
              style={{ width: '100%', height: '100%' }}
            />
          </div>
        );
      })}
    </div>
  );
};
