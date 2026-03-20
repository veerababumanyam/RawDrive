/**
 * GridLayout — Default grid layout renderer.
 *
 * Renders assets in a responsive CSS Grid with uniform cells. Each cell
 * renders a ProgressiveImage with LQIP blur-up.
 *
 * @module layouts/GridLayout
 */

import React, { useMemo } from 'react';
import { ProgressiveImage } from './ProgressiveImage';
import type { LayoutRendererProps, LayoutAsset } from './types';

// ---------------------------------------------------------------------------
// Responsive breakpoints (container-width based)
// ---------------------------------------------------------------------------

function getColumns(containerWidth: number): number {
  if (containerWidth < 640) return 1;
  if (containerWidth < 1024) return 2;
  if (containerWidth < 1536) return 3;
  return 4;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const GridLayout: React.FC<LayoutRendererProps> = ({
  assets,
  containerWidth,
  gap = 8,
  onAssetClick,
  itemOverlay,
}) => {
  const columns = useMemo(() => getColumns(containerWidth), [containerWidth]);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: `${gap}px`,
        width: '100%',
      }}
    >
      {assets.map((asset: LayoutAsset, index: number) => (
        <div
          key={asset.asset_id}
          style={{ position: 'relative', overflow: 'hidden', borderRadius: '4px', cursor: onAssetClick ? 'pointer' : undefined }}
          onClick={onAssetClick ? () => onAssetClick(asset, index) : undefined}
        >
          <ProgressiveImage
            src={asset.src}
            lqip={asset.lqip}
            width={asset.width}
            height={asset.height}
            alt={asset.alt}
          />
          {itemOverlay?.(asset, index)}
        </div>
      ))}
    </div>
  );
};
