/**
 * MosaicLayout — Magazine-style mosaic with varied tile sizes.
 *
 * Uses CSS Grid with grid-auto-flow: dense to create a visually rich layout
 * where the first image (hero) spans 2x2, landscape images span 2 columns,
 * and portrait images span 2 rows.
 *
 * @module layouts/MosaicLayout
 */

import React, { useMemo } from 'react';
import { ProgressiveImage } from './ProgressiveImage';
import type { LayoutRendererProps, LayoutAsset } from './types';

// ---------------------------------------------------------------------------
// Responsive column count (container-width based)
// ---------------------------------------------------------------------------

function getColumns(containerWidth: number): number {
  if (containerWidth < 640) return 2;
  if (containerWidth < 1024) return 3;
  return 4;
}

// ---------------------------------------------------------------------------
// Tile span computation
// ---------------------------------------------------------------------------

interface TileSpan {
  gridColumn: string;
  gridRow: string;
}

function getTileSpan(asset: LayoutAsset, index: number): TileSpan {
  // Hero image always gets 2x2
  if (index === 0) {
    return { gridColumn: 'span 2', gridRow: 'span 2' };
  }

  // Landscape: wide tile (2 columns)
  if (asset.aspectRatio > 1.4) {
    return { gridColumn: 'span 2', gridRow: 'span 1' };
  }

  // Portrait: tall tile (2 rows)
  if (asset.aspectRatio < 0.7) {
    return { gridColumn: 'span 1', gridRow: 'span 2' };
  }

  // Square / standard: 1x1
  return { gridColumn: 'span 1', gridRow: 'span 1' };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const MosaicLayout: React.FC<LayoutRendererProps> = ({
  assets,
  containerWidth,
  gap = 8,
  onAssetClick,
}) => {
  const columns = useMemo(() => getColumns(containerWidth), [containerWidth]);

  if (containerWidth <= 0 || assets.length === 0) return null;

  // Base row height for grid auto-rows
  const baseRowHeight = Math.round(containerWidth / columns * 0.75);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gridAutoRows: baseRowHeight,
        gridAutoFlow: 'dense',
        gap,
        width: '100%',
      }}
    >
      {assets.map((asset, i) => {
        const span = getTileSpan(asset, i);

        return (
          <div
            key={asset.asset_id}
            style={{
              gridColumn: span.gridColumn,
              gridRow: span.gridRow,
              overflow: 'hidden',
              borderRadius: 4,
              cursor: onAssetClick ? 'pointer' : undefined,
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
