/**
 * LightboxFilmstrip Component
 * Virtualized horizontal thumbnail strip for lightbox navigation
 * Uses react-window v2 Grid for efficient rendering of large galleries (5000+ images)
 */

import React, { useRef, useEffect, useCallback, CSSProperties, ReactElement, Ref } from 'react';
import { Grid, GridImperativeAPI, CellComponentProps } from 'react-window';
import { AutoSizer } from 'react-virtualized-auto-sizer';
import type { GalleryAssetItem } from '../../../types/gallery';

export interface LightboxFilmstripProps {
  /** All assets in the gallery */
  assets: GalleryAssetItem[];
  /** Currently selected asset index */
  currentIndex: number;
  /** Callback when a thumbnail is clicked */
  onSelect: (index: number) => void;
  /** Thumbnail width in pixels (default: 80) */
  thumbnailWidth?: number;
  /** Thumbnail height in pixels (default: 60) */
  thumbnailHeight?: number;
  /** Gap between thumbnails in pixels (default: 8) */
  gap?: number;
  /** Whether to show the filmstrip (default: true) */
  visible?: boolean;
  /** Custom className for the container */
  className?: string;
}

interface ThumbnailCellProps {
  assets: GalleryAssetItem[];
  currentIndex: number;
  onSelect: (index: number) => void;
  gap: number;
}

/**
 * Thumbnail cell component for react-window v2 Grid
 */
function ThumbnailCell({
  columnIndex,
  style,
  assets,
  currentIndex,
  onSelect,
  gap,
}: CellComponentProps<ThumbnailCellProps>): ReactElement {
  const asset = assets[columnIndex];

  const isSelected = columnIndex === currentIndex;

  // Get thumbnail URL (prefer thumbnail variant, fallback to preview_url)
  const thumbnailUrl = asset?.asset?.thumbnail_url || asset?.asset?.preview_url || '';

  const handleClick = useCallback(() => {
    onSelect(columnIndex);
  }, [columnIndex, onSelect]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect(columnIndex);
      }
    },
    [columnIndex, onSelect]
  );

  // Adjust style for gap
  const adjustedStyle: CSSProperties = {
    ...style,
    left: Number(style.left) + gap / 2,
    width: Number(style.width) - gap,
    padding: 2,
  };

  // Return empty placeholder if no asset
  if (!asset) {
    return <div style={adjustedStyle} />;
  }

  return (
    <div style={adjustedStyle}>
      <button
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={`
          relative w-full h-full rounded overflow-hidden
          transition-all duration-200 ease-out
          focus:outline-none focus-visible:ring-2 focus-visible:ring-white
          ${isSelected
            ? 'ring-2 ring-white scale-100 opacity-100'
            : 'opacity-80 hover:opacity-100'
          }
        `}
        aria-label={`View photo ${columnIndex + 1}: ${asset.asset.filename || `Photo ${columnIndex + 1}`}`}
        aria-current={isSelected ? 'true' : undefined}
        tabIndex={isSelected ? 0 : -1}
      >
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full bg-white/10 flex items-center justify-center">
            <span className="text-white/40 text-xs">{columnIndex + 1}</span>
          </div>
        )}

        {/* Selection/Favorite indicators */}
        {(asset.is_favorited || asset.is_selected) && (
          <div className="absolute top-1 right-1 flex gap-0.5">
            {asset.is_favorited && (
              <span className="w-2 h-2 rounded-full bg-red-500" aria-label="Favorited" />
            )}
            {asset.is_selected && (
              <span className="w-2 h-2 rounded-full bg-green-500" aria-label="Selected" />
            )}
          </div>
        )}
      </button>
    </div>
  );
}

/**
 * LightboxFilmstrip - Virtualized thumbnail navigation strip
 *
 * @example
 * ```tsx
 * <LightboxFilmstrip
 *   assets={galleryAssets}
 *   currentIndex={currentIndex}
 *   onSelect={(index) => setCurrentIndex(index)}
 *   visible={showFilmstrip}
 * />
 * ```
 */
export const LightboxFilmstrip: React.FC<LightboxFilmstripProps> = ({
  assets,
  currentIndex,
  onSelect,
  thumbnailWidth = 80,
  thumbnailHeight = 60,
  gap = 8,
  visible = true,
  className = '',
}) => {
  const gridRef = useRef<GridImperativeAPI | null>(null);

  // Scroll to current item when index changes
  useEffect(() => {
    if (gridRef.current && visible) {
      gridRef.current.scrollToCell({
        columnIndex: currentIndex,
        rowIndex: 0,
        columnAlign: 'center',
        rowAlign: 'center',
      });
    }
  }, [currentIndex, visible]);

  // Cell props for react-window v2
  const cellProps: ThumbnailCellProps = {
    assets,
    currentIndex,
    onSelect,
    gap,
  };

  if (!visible || assets.length === 0) {
    return null;
  }

  // Item size including gap
  const itemWidth = thumbnailWidth + gap;

  return (
    <div
      className={`
        bg-transparent
        ${className}
      `}
      style={{ height: thumbnailHeight + 16 }}
      role="listbox"
      aria-label="Gallery thumbnails"
      aria-orientation="horizontal"
    >
      <AutoSizer
        renderProp={({ width, height }) => {
          // Handle initial render when dimensions are undefined
          if (!width || !height) {
            return null;
          }
          return (
            <Grid<ThumbnailCellProps>
              gridRef={gridRef as Ref<GridImperativeAPI>}
              cellComponent={ThumbnailCell}
              cellProps={cellProps}
              columnCount={assets.length}
              columnWidth={itemWidth}
              rowCount={1}
              rowHeight={thumbnailHeight}
              defaultWidth={width}
              defaultHeight={height}
              overscanCount={5}
              className="scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent"
              style={{
                paddingTop: 8,
                paddingBottom: 8,
                overflowY: 'hidden',
              }}
            />
          );
        }}
      />

      {/* Position indicator */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1 bg-black/70 rounded-full text-white text-xs font-medium">
        {currentIndex + 1} / {assets.length}
      </div>
    </div>
  );
};

export default LightboxFilmstrip;
