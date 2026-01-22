/**
 * ReviewFilmstrip Component
 * Virtualized horizontal thumbnail strip for Review Mode navigation
 * Feature: 029-pro-review-xmp-sync
 * Task: T025
 *
 * Features:
 * - Virtualized rendering for large galleries (10,000+ images)
 * - Rating/flag/color indicators on thumbnails
 * - Keyboard navigation
 * - Auto-scroll to current selection
 */

import React, { useRef, useEffect, useCallback, CSSProperties, ReactElement, Ref } from 'react';
import { Grid, GridImperativeAPI, CellComponentProps } from 'react-window';
import { AutoSizer } from 'react-virtualized-auto-sizer';
import { Star, Flag, X } from 'lucide-react';
import type { FilteredAsset, AssetFlag, ColorLabel } from '../../../../types/reviewMode';
import { COLOR_LABEL_CONFIG } from '../../../../types/reviewMode';

export interface ReviewFilmstripProps {
  /** All assets in the current filter view */
  assets: FilteredAsset[];
  /** Currently selected asset index */
  currentIndex: number;
  /** Callback when a thumbnail is clicked */
  onSelect: (index: number) => void;
  /** Thumbnail width in pixels (default: 80) */
  thumbnailWidth?: number;
  /** Thumbnail height in pixels (default: 60) */
  thumbnailHeight?: number;
  /** Gap between thumbnails in pixels (default: 6) */
  gap?: number;
  /** Whether to show the filmstrip (default: true) */
  visible?: boolean;
  /** Orientation */
  orientation?: 'horizontal' | 'vertical';
  /** Show metadata overlays on thumbnails */
  showMetadata?: boolean;
  /** Custom className for the container */
  className?: string;
}

interface ThumbnailCellProps {
  assets: FilteredAsset[];
  currentIndex: number;
  onSelect: (index: number) => void;
  gap: number;
  showMetadata: boolean;
}

/**
 * Rating indicator overlay
 */
const RatingIndicator: React.FC<{ rating: number | null }> = ({ rating }) => {
  if (!rating || rating === 0) return null;
  return (
    <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-0.5 p-0.5 bg-black/60">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={8}
          className={i <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-white/30'}
        />
      ))}
    </div>
  );
};

/**
 * Flag indicator overlay
 */
const FlagOverlay: React.FC<{ flag: AssetFlag }> = ({ flag }) => {
  if (flag === 'unflagged') return null;

  return (
    <div
      className={`
        absolute top-0.5 left-0.5
        w-4 h-4 rounded-full
        flex items-center justify-center
        ${flag === 'pick' ? 'bg-primary' : 'bg-red-600'}
      `}
    >
      {flag === 'pick' ? (
        <Flag size={8} className="text-white" />
      ) : (
        <X size={8} className="text-white" />
      )}
    </div>
  );
};

/**
 * Color label indicator
 */
const ColorLabelIndicator: React.FC<{ colorLabel: ColorLabel }> = ({ colorLabel }) => {
  if (colorLabel === 'none') return null;

  return (
    <div
      className={`
        absolute top-0.5 right-0.5
        w-2.5 h-2.5 rounded-full
        ${COLOR_LABEL_CONFIG[colorLabel].bgColor}
      `}
    />
  );
};

/**
 * Thumbnail cell component for react-window Grid
 */
function ThumbnailCell({
  columnIndex,
  style,
  assets,
  currentIndex,
  onSelect,
  gap,
  showMetadata,
}: CellComponentProps<ThumbnailCellProps>): ReactElement {
  const asset = assets[columnIndex];
  const isSelected = columnIndex === currentIndex;

  const thumbnailUrl = asset?.thumbnail_url || '';

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
            ? 'ring-2 ring-primary scale-100 opacity-100'
            : 'ring-1 ring-white/20 scale-[0.98] opacity-70 hover:opacity-90 hover:scale-100'
          }
        `}
        aria-label={`Photo ${columnIndex + 1}: ${asset.filename}`}
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
          <div className="w-full h-full bg-surface-hover flex items-center justify-center">
            <span className="text-text-tertiary text-xs">{columnIndex + 1}</span>
          </div>
        )}

        {/* Metadata overlays */}
        {showMetadata && (
          <>
            <FlagOverlay flag={asset.flag} />
            <ColorLabelIndicator colorLabel={asset.color_label} />
            <RatingIndicator rating={asset.rating} />
          </>
        )}
      </button>
    </div>
  );
}

/**
 * ReviewFilmstrip - Virtualized thumbnail navigation strip for Review Mode
 */
export const ReviewFilmstrip: React.FC<ReviewFilmstripProps> = ({
  assets,
  currentIndex,
  onSelect,
  thumbnailWidth = 80,
  thumbnailHeight = 60,
  gap = 6,
  visible = true,
  orientation = 'horizontal',
  showMetadata = true,
  className = '',
}) => {
  const gridRef = useRef<GridImperativeAPI | null>(null);

  // Scroll to current item when index changes
  useEffect(() => {
    if (gridRef.current && visible) {
      gridRef.current.scrollToCell({
        columnIndex: orientation === 'horizontal' ? currentIndex : 0,
        rowIndex: orientation === 'vertical' ? currentIndex : 0,
        columnAlign: 'center',
        rowAlign: 'center',
      });
    }
  }, [currentIndex, visible, orientation]);

  // Cell props for react-window
  const cellProps: ThumbnailCellProps = {
    assets,
    currentIndex,
    onSelect,
    gap,
    showMetadata,
  };

  if (!visible || assets.length === 0) {
    return null;
  }

  const itemWidth = thumbnailWidth + gap;
  const itemHeight = thumbnailHeight + gap;

  if (orientation === 'vertical') {
    // Vertical filmstrip (left sidebar)
    return (
      <div
        className={`
          bg-surface border-r border-border
          ${className}
        `}
        style={{ width: thumbnailWidth + 20 }}
        role="listbox"
        aria-label="Gallery thumbnails"
        aria-orientation="vertical"
      >
        <AutoSizer
          renderProp={({ width, height }) => {
            if (!width || !height) return null;
            return (
              <Grid<ThumbnailCellProps>
                gridRef={gridRef as Ref<GridImperativeAPI>}
                cellComponent={ThumbnailCell}
                cellProps={cellProps}
                columnCount={1}
                columnWidth={thumbnailWidth}
                rowCount={assets.length}
                rowHeight={itemHeight}
                defaultWidth={width}
                defaultHeight={height}
                overscanCount={10}
                className="scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent"
              />
            );
          }}
        />
      </div>
    );
  }

  // Horizontal filmstrip (bottom strip)
  return (
    <div
      className={`
        bg-surface/95 backdrop-blur-sm border-t border-border
        ${className}
      `}
      style={{ height: thumbnailHeight + 20 }}
      role="listbox"
      aria-label="Gallery thumbnails"
      aria-orientation="horizontal"
    >
      <AutoSizer
        renderProp={({ width, height }) => {
          if (!width || !height) return null;
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
              overscanCount={10}
              className="scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent"
              style={{
                paddingTop: 10,
                paddingBottom: 10,
                overflowY: 'hidden',
              }}
            />
          );
        }}
      />

      {/* Position indicator */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1 bg-surface/90 border border-border rounded-full text-text-primary text-xs font-medium shadow-sm">
        {currentIndex + 1} / {assets.length}
      </div>
    </div>
  );
};

export default ReviewFilmstrip;
