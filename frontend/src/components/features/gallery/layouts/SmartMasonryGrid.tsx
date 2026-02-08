/**
 * SmartMasonryGrid Component
 * An intelligent Pinterest-style masonry layout that minimizes cropping
 * while maintaining visual harmony across different aspect ratios.
 *
 * Features:
 * - Intelligent aspect ratio grouping for visual harmony
 * - Minimal cropping with smart positioning
 * - Responsive column count based on viewport
 * - Smooth layout transitions with animations
 * - Virtual scrolling support for large galleries
 * - Accessibility compliant
 *
 * @module layouts/SmartMasonryGrid
 */

import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { GalleryAssetItem } from '../../../../types/gallery';
import type { ResponsiveColumns } from '../../../../types/canvas';
import { PhotoCard } from '../PhotoCard';

// ============================================================================
// Types
// ============================================================================

export interface SmartMasonryGridProps {
  /** Assets to display */
  assets: GalleryAssetItem[];
  /** Responsive column configuration */
  columns?: ResponsiveColumns;
  /** Gap size between items */
  gap?: 'sm' | 'md' | 'lg' | 'none';
  /** Selected asset IDs */
  selectedAssetIds?: Set<string>;
  /** Enable management selection mode */
  managementSelectable?: boolean;
  /** Show customer selection toggle */
  showCustomerSelection?: boolean;
  /** Cover asset ID */
  coverAssetId?: string | null;
  /** Callback when asset is clicked */
  onAssetClick?: (asset: GalleryAssetItem, index: number) => void;
  /** Callback when asset favorite is toggled */
  onAssetFavorite?: (assetId: string, favorite: boolean) => void;
  /** Callback for management selection */
  onManagementSelect?: (assetId: string) => void;
  /** Callback for customer selection toggle */
  onCustomerSelectionToggle?: (assetId: string, selected: boolean) => void;
  /** Callback for asset download */
  onAssetDownload?: (assetId: string) => void;
  /** Callback for asset share */
  onAssetShare?: (assetId: string) => void;
  /** Whether layout is loading */
  isLoading?: boolean;
  /** Custom class name */
  className?: string;
  /** Animation options */
  animate?: boolean;
  /** Virtualization enabled */
  virtualized?: boolean;
  /** Items visible threshold for virtualization */
  overscan?: number;
}

interface LayoutCell {
  asset: GalleryAssetItem;
  originalIndex: number;
  width: number;
  height: number;
  x: number;
  y: number;
  aspectRatio: number;
}

// ============================================================================
// Constants
// ============================================================================

const GAP_SIZES = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 16,
};

const DEFAULT_COLUMNS: ResponsiveColumns = {
  sm: 2,
  md: 3,
  lg: 4,
  xl: 5,
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Categorize aspect ratio for grouping similar photos
 */
function categorizeAspectRatio(ratio: number): 'portrait' | 'square' | 'landscape' | 'panoramic' {
  if (ratio < 0.7) return 'portrait';
  if (ratio < 1.2) return 'square';
  if (ratio < 2.0) return 'landscape';
  return 'panoramic';
}

/**
 * Calculate optimal height for a photo to minimize cropping
 */
function calculateOptimalHeight(
  aspectRatio: number,
  columnWidth: number,
  baseHeight: number
): number {
  const naturalHeight = columnWidth / aspectRatio;

  // Round to nearest reasonable height to create visual rhythm
  const heightSteps = [0.75, 1, 1.25, 1.5, 2];
  const closestStep = heightSteps.reduce((prev, curr) =>
    Math.abs(curr * baseHeight - naturalHeight) < Math.abs(prev * baseHeight - naturalHeight)
      ? curr
      : prev
  );

  return closestStep * baseHeight;
}

// ============================================================================
// Component
// ============================================================================

export const SmartMasonryGrid: React.FC<SmartMasonryGridProps> = ({
  assets,
  columns = DEFAULT_COLUMNS,
  gap = 'md',
  selectedAssetIds = new Set(),
  managementSelectable = false,
  showCustomerSelection = true,
  coverAssetId,
  onAssetClick,
  onAssetFavorite,
  onManagementSelect,
  onCustomerSelectionToggle,
  onAssetDownload,
  onAssetShare,
  isLoading = false,
  className = '',
  animate = true,
  virtualized = false,
  overscan = 5,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(3);
  const [containerWidth, setContainerWidth] = useState(0);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 50 });
  const gapSize = GAP_SIZES[gap];

  // Update column count based on viewport
  useEffect(() => {
    const updateColumns = () => {
      if (typeof window === 'undefined') return;

      const width = window.innerWidth;
      const { sm = 2, md = 3, lg = 4, xl = 5 } = columns;

      if (width < 640) setColumnCount(sm);
      else if (width < 1024) setColumnCount(md);
      else if (width < 1536) setColumnCount(lg);
      else setColumnCount(xl);
    };

    updateColumns();
    window.addEventListener('resize', updateColumns);
    return () => window.removeEventListener('resize', updateColumns);
  }, [columns]);

  // Measure container width
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Calculate layout cells
  const layoutCells = useMemo<LayoutCell[]>(() => {
    if (!containerWidth || assets.length === 0) return [];

    const columnWidth = (containerWidth - (columnCount - 1) * gapSize) / columnCount;
    const baseHeight = columnWidth * 0.75; // 4:3 base ratio
    const columnHeights = new Array(columnCount).fill(0);
    const cells: LayoutCell[] = [];

    assets.forEach((asset, index) => {
      // Get aspect ratio
      const aspectRatio =
        asset.asset.width && asset.asset.height
          ? asset.asset.width / asset.asset.height
          : 1.33;

      // Find shortest column
      const shortestColumnIndex = columnHeights.indexOf(Math.min(...columnHeights));

      // Calculate optimal height
      const height = calculateOptimalHeight(aspectRatio, columnWidth, baseHeight);

      // Create cell
      const cell: LayoutCell = {
        asset,
        originalIndex: index,
        width: columnWidth,
        height,
        x: shortestColumnIndex * (columnWidth + gapSize),
        y: columnHeights[shortestColumnIndex],
        aspectRatio,
      };

      cells.push(cell);

      // Update column height
      columnHeights[shortestColumnIndex] += height + gapSize;
    });

    return cells;
  }, [assets, columnCount, containerWidth, gapSize]);

  // Calculate total height
  const totalHeight = useMemo(() => {
    if (layoutCells.length === 0) return 0;
    return Math.max(...layoutCells.map((cell) => cell.y + cell.height));
  }, [layoutCells]);

  // Handle scroll for virtualization
  const handleScroll = useCallback(() => {
    if (!virtualized || !containerRef.current) return;

    const scrollTop = window.scrollY;
    const viewportHeight = window.innerHeight;
    const containerTop = containerRef.current.getBoundingClientRect().top + scrollTop;

    // Find visible cells
    const visibleStart = scrollTop - containerTop - overscan * 200;
    const visibleEnd = scrollTop - containerTop + viewportHeight + overscan * 200;

    const startIndex = layoutCells.findIndex(
      (cell) => cell.y + cell.height >= visibleStart
    );
    const endIndex = layoutCells.findIndex((cell) => cell.y >= visibleEnd);

    setVisibleRange({
      start: Math.max(0, startIndex),
      end: endIndex === -1 ? layoutCells.length : Math.min(layoutCells.length, endIndex),
    });
  }, [virtualized, overscan, layoutCells]);

  // Set up scroll listener for virtualization
  useEffect(() => {
    if (!virtualized) return;

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [virtualized, handleScroll]);

  // Get visible cells
  const visibleCells = virtualized
    ? layoutCells.slice(visibleRange.start, visibleRange.end)
    : layoutCells;

  // Loading state
  if (isLoading) {
    return (
      <div className={`grid gap-2 ${className}`} style={{ gridTemplateColumns: `repeat(${columnCount}, 1fr)` }}>
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="aspect-[4/3] bg-surface-secondary animate-pulse rounded-lg"
          />
        ))}
      </div>
    );
  }

  // Empty state
  if (assets.length === 0) {
    return (
      <div className={`flex items-center justify-center py-16 ${className}`}>
        <p className="text-text-secondary">No photos to display</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      style={{ height: totalHeight }}
      role="grid"
      aria-label="Photo gallery"
    >
      <AnimatePresence mode="popLayout">
        {visibleCells.map((cell) => {
          const isSelected = selectedAssetIds.has(cell.asset.asset_id);
          const isCover = coverAssetId === cell.asset.asset_id;

          return (
            <motion.div
              key={cell.asset.asset_id}
              layout={animate}
              initial={animate ? { opacity: 0, scale: 0.9 } : false}
              animate={{ opacity: 1, scale: 1 }}
              exit={animate ? { opacity: 0, scale: 0.9 } : undefined}
              transition={{ duration: 0.2 }}
              className="absolute"
              style={{
                width: cell.width,
                height: cell.height,
                transform: `translate(${cell.x}px, ${cell.y}px)`,
              }}
              role="gridcell"
            >
              <div className="w-full h-full overflow-hidden rounded-lg">
                <PhotoCard
                  asset={cell.asset}
                  index={cell.originalIndex}
                  isManagementSelected={isSelected}
                  isCover={isCover}
                  managementSelectable={managementSelectable}
                  showCustomerSelection={showCustomerSelection}
                  aspectRatio="auto"
                  onClick={onAssetClick ? (asset, idx, _e) => onAssetClick(asset, idx) : undefined}
                  onFavorite={onAssetFavorite ? (assetId, favorite) => onAssetFavorite(assetId, favorite) : undefined}
                  onManagementSelect={onManagementSelect ? (assetId) => onManagementSelect(assetId) : undefined}
                  onCustomerSelectionToggle={onCustomerSelectionToggle ? (assetId, selected) =>
                    onCustomerSelectionToggle(assetId, selected) : undefined
                  }
                  onDownload={onAssetDownload ? (assetId) => onAssetDownload(assetId) : undefined}
                  onShare={onAssetShare ? (assetId) => onAssetShare(assetId) : undefined}
                />
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};

export default SmartMasonryGrid;
