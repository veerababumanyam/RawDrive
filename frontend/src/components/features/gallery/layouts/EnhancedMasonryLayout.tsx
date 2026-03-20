/**
 * EnhancedMasonryLayout — CSS column-count masonry with JS chronological reordering.
 *
 * CSS column-count naturally fills columns top-to-bottom. To preserve
 * chronological left-to-right reading order, we reorder the assets array
 * so that items read top-to-bottom per column correspond to the original
 * left-to-right sequence.
 *
 * @module layouts/EnhancedMasonryLayout
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
  if (containerWidth < 1536) return 4;
  return 5;
}

// ---------------------------------------------------------------------------
// Chronological reordering for column-count layout
// ---------------------------------------------------------------------------

/**
 * CSS column-count fills items top-to-bottom per column. Given N columns and
 * M items, column c gets items at rendered positions c*perCol .. (c+1)*perCol-1.
 *
 * To display items in chronological left-to-right order (item 0 top-left,
 * item 1 next to it, etc.) we need to reorder so that:
 *   - Column 0 gets items [0, numCols, 2*numCols, ...]
 *   - Column 1 gets items [1, numCols+1, 2*numCols+1, ...]
 *   - etc.
 *
 * The reordered array interleaves columns: for each column c, take every
 * numCols-th item starting at c.
 */
function reorderForColumnLayout<T>(items: T[], numColumns: number): T[] {
  if (numColumns <= 1 || items.length <= 1) return items;

  const rows = Math.ceil(items.length / numColumns);
  const result: T[] = [];

  for (let col = 0; col < numColumns; col++) {
    for (let row = 0; row < rows; row++) {
      const srcIndex = row * numColumns + col;
      if (srcIndex < items.length) {
        result.push(items[srcIndex]);
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const EnhancedMasonryLayout: React.FC<LayoutRendererProps> = ({
  assets,
  containerWidth,
  gap = 8,
  onAssetClick,
}) => {
  const columns = useMemo(() => getColumns(containerWidth), [containerWidth]);

  const reorderedAssets = useMemo(
    () => reorderForColumnLayout(assets, columns),
    [assets, columns],
  );

  if (containerWidth <= 0 || assets.length === 0) return null;

  return (
    <div
      style={{
        columnCount: columns,
        columnGap: gap,
        width: '100%',
      }}
    >
      {reorderedAssets.map((asset, i) => {
        // Find original index for onAssetClick
        const originalIndex = assets.indexOf(asset);

        return (
          <div
            key={asset.asset_id}
            style={{
              breakInside: 'avoid',
              marginBottom: gap,
            }}
            onClick={
              onAssetClick
                ? () => onAssetClick(asset, originalIndex)
                : undefined
            }
          >
            <ProgressiveImage
              src={asset.src}
              lqip={asset.lqip}
              width={asset.width}
              height={asset.height}
              alt={asset.alt}
              style={{ width: '100%', height: 'auto' }}
            />
          </div>
        );
      })}
    </div>
  );
};
