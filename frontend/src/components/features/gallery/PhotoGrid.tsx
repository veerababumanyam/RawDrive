/**
 * PhotoGrid Component
 * Gallery-specific photo grid with signed URL support and batch fetching
 * Property 13: Lazy Loading Images
 * Supports drag-drop reordering via @dnd-kit
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PhotoCard } from './PhotoCard';
import { GalleryAssetItem } from '../../../types/gallery';
import { ResponsiveColumns, WatermarkSettings, FaceSummary } from '../../../types/canvas';
import { useGridVirtualization } from '../../../hooks/useGridVirtualization';

export interface PhotoGridProps {
  assets: GalleryAssetItem[];
  /** Management selection state (local UI for CRUD bulk operations) */
  selectedAssetIds?: Set<string>;
  /** Enable management selection mode for CRUD operations */
  managementSelectable?: boolean;
  /** Show customer selection toggle for delivery workflow */
  showCustomerSelection?: boolean;
  coverAssetId?: string | null;
  /** Management selection callback (for CRUD bulk operations) */
  onManagementSelect?: (assetId: string) => void;
  onAssetClick?: (asset: GalleryAssetItem, index: number, e?: React.MouseEvent) => void;
  onAssetFavorite?: (assetId: string, favorite: boolean) => void;
  /** Customer selection callback (persisted for delivery workflow) */
  onCustomerSelectionToggle?: (assetId: string, selected: boolean) => void;
  onAssetDownload?: (assetId: string) => void;
  onAssetShare?: (assetId: string) => void;
  onAssetLock?: (assetId: string, isPrivate: boolean) => void;
  onAssetDelete?: (assetId: string) => void;
  onSetCover?: (assetId: string) => void;
  onSortOrderChange?: (assetIds: string[]) => void;
  onMoveToSubGallery?: (assetId: string, subGalleryId: string | null) => void;
  sortable?: boolean;
  isLoading?: boolean;
  className?: string;
  columns?: ResponsiveColumns;
  gap?: 'sm' | 'md' | 'lg';
  isPrivateUnlocked?: boolean;
  onUnlockPrivate?: () => void;
  /** Show watermark overlay on photos */
  showWatermark?: boolean;
  /** Watermark configuration settings */
  watermarkSettings?: WatermarkSettings;
  /** Map of asset IDs to face summaries for face detection badges */
  faceSummaries?: Map<string, FaceSummary>;
  /** Enable virtual scrolling for large galleries (auto-disabled when sortable) */
  enableVirtualization?: boolean;
  /** Height of each row in pixels (for virtualization) */
  rowHeight?: number;
  /** Number of rows to render above/below visible area */
  overscan?: number;
  /** Callback when an asset update is needed */
  onUpdateAsset?: (assetId: string, data: { title: string; description: string; is_private: boolean }) => void;
}

const getColumnClasses = (columns?: ResponsiveColumns) => {
  // Reduced columns to ensure thumbnails are large enough to fit action icons
  // Action bar needs ~350px minimum width (6-7 buttons at 44px + gaps)
  const { sm = 1, md = 2, lg = 3, xl = 4 } = columns || {};
  // Tailwind classes must be complete strings for regex purgers usually, but strict mapping helps.
  // Using dynamic classes might be an issue if they are not safelisted, 
  // but assuming standard grid-cols-* are available.
  return `grid-cols-${sm} md:grid-cols-${md} lg:grid-cols-${lg} 2xl:grid-cols-${xl}`;
};

const getGapClass = (gap?: 'sm' | 'md' | 'lg') => {
  switch (gap) {
    case 'sm': return 'gap-1';
    case 'md': return 'gap-2';
    case 'lg': return 'gap-4';
    default: return 'gap-2';
  }
};

export const PhotoGridComponent: React.FC<PhotoGridProps> = ({
  assets,
  selectedAssetIds = new Set(),
  managementSelectable = false,
  showCustomerSelection = true,
  coverAssetId,
  onManagementSelect,
  onAssetClick,
  onAssetFavorite,
  onCustomerSelectionToggle,
  onAssetDownload,
  onAssetShare,
  onAssetLock,
  onAssetDelete,
  onSetCover,
  onSortOrderChange,
  onMoveToSubGallery,
  onUpdateAsset,
  sortable = false,
  isLoading = false,
  className = '',
  columns,
  gap,
  isPrivateUnlocked,
  onUnlockPrivate,
  showWatermark = false,
  watermarkSettings,
  faceSummaries,
  enableVirtualization = false,
  rowHeight = 280,
  overscan = 2,
}) => {
  const [items, setItems] = useState<GalleryAssetItem[]>(assets);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Update items when assets prop changes
  useEffect(() => {
    setItems(assets);
  }, [assets]);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px movement before drag starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag end
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (!over) {
        return;
      }

      // Check if dropped on a sub-gallery tab (starts with "sub-gallery-")
      if (typeof over.id === 'string' && over.id.startsWith('sub-gallery-')) {
        const assetId = active.id as string;
        const subGalleryId = over.id === 'sub-gallery-root' ? null : over.id.replace('sub-gallery-', '');

        if (onMoveToSubGallery) {
          onMoveToSubGallery(assetId, subGalleryId);
        }
        return;
      }

      // Handle reordering within grid
      if (active.id === over.id) {
        return;
      }

      const oldIndex = items.findIndex((item) => item.asset_id === active.id);
      const newIndex = items.findIndex((item) => item.asset_id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newItems = arrayMove(items, oldIndex, newIndex);
        setItems(newItems);

        // Call callback with new order
        if (onSortOrderChange) {
          const newAssetIds = newItems.map((item) => item.asset_id);
          onSortOrderChange(newAssetIds);
        }
      }
    },
    [items, onSortOrderChange, onMoveToSubGallery]
  );

  // Note: SignedUrlContext handles batched URL fetching automatically
  // Each PhotoCard uses useSignedUrl which goes through the context's batching logic
  // No need for duplicate batch fetching here

  // Responsive columns hook to track current column count for keyboard navigation
  const [currentColCount, setCurrentColCount] = useState(2);

  useEffect(() => {
    const update = () => {
      // Using window check for safety
      if (typeof window === 'undefined') return;
      const width = window.innerWidth;
      const { sm = 2, md = 3, lg = 4, xl = 5 } = columns || {};

      if (width < 640) setCurrentColCount(sm);
      else if (width < 1024) setCurrentColCount(md);
      else if (width < 1536) setCurrentColCount(lg);
      else setCurrentColCount(xl);
    };

    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [columns]);

  // Determine if virtualization should be active
  // Disabled when sortable (DnD incompatible) or explicitly disabled
  const shouldVirtualize = useMemo(() => {
    return enableVirtualization && !sortable && items.length > 50;
  }, [enableVirtualization, sortable, items.length]);

  // Use virtualization hook
  const {
    virtualRows,
    totalHeight,
    topSpacerHeight,
    bottomSpacerHeight,
    scrollToItem,
    // visibleRange - available but not used currently
    isItemRendered,
  } = useGridVirtualization({
    items,
    columnCount: currentColCount,
    rowHeight,
    overscan,
    enabled: shouldVirtualize,
    containerRef: scrollContainerRef,
  });

  // Keyboard navigation handler with virtualization support
  const handleKeyDown = useCallback((e: React.KeyboardEvent, index: number) => {
    // Only handle arrow keys
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;

    e.preventDefault();
    let nextIndex = index;
    const total = items.length;

    switch (e.key) {
      case 'ArrowRight':
        nextIndex = index + 1;
        break;
      case 'ArrowLeft':
        nextIndex = index - 1;
        break;
      case 'ArrowDown':
        nextIndex = index + currentColCount;
        break;
      case 'ArrowUp':
        nextIndex = index - currentColCount;
        break;
    }

    if (nextIndex >= 0 && nextIndex < total) {
      // If virtualization is active and the target item isn't rendered, scroll to it first
      if (shouldVirtualize && !isItemRendered(nextIndex)) {
        scrollToItem(nextIndex);
        // Use requestAnimationFrame to wait for re-render, then focus
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const wrapper = document.querySelector(`[data-photo-index="${nextIndex}"]`) as HTMLElement;
            if (wrapper) {
              const focusableInfo = wrapper.querySelector('[tabindex="0"]') as HTMLElement;
              (focusableInfo || wrapper).focus();
            }
          });
        });
        return;
      }

      // Find element by data-index
      const wrapper = document.querySelector(`[data-photo-index="${nextIndex}"]`) as HTMLElement;
      if (wrapper) {
        // Find the actual focusable card inside the wrapper to maintain proper focus state
        const focusableInfo = wrapper.querySelector('[tabindex="0"]') as HTMLElement;
        if (focusableInfo) {
          focusableInfo.focus();
        } else {
          wrapper.focus();
        }
      }
    }
  }, [items.length, currentColCount, shouldVirtualize, isItemRendered, scrollToItem]);

  // Loading skeleton
  if (isLoading) {
    return (
      <div className={`grid ${getColumnClasses(columns)} ${getGapClass(gap)} ${className}`}>
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="aspect-[4/3] bg-surface-hover rounded-card animate-pulse"
          />
        ))}
      </div>
    );
  }

  // Empty state
  if (assets.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center py-16 ${className}`}>
        <div className="w-16 h-16 mb-4 rounded-full bg-surface flex items-center justify-center">
          <span className="text-text-tertiary text-2xl">📷</span>
        </div>
        <p className="text-text-secondary">No photos in this gallery</p>
      </div>
    );
  }

  // Helper to render a single photo card
  const renderPhotoCard = (asset: GalleryAssetItem, index: number) => {
    const SortableItem = sortable ? SortablePhotoCard : PhotoCardWrapper;

    return (
      <SortableItem
        key={asset.asset_id}
        asset={asset}
        index={index}
        isManagementSelected={selectedAssetIds.has(asset.asset_id)}
        managementSelectable={managementSelectable}
        showCustomerSelection={showCustomerSelection}
        isCover={coverAssetId === asset.asset_id}
        onManagementSelect={onManagementSelect}
        onClick={onAssetClick}
        onFavorite={onAssetFavorite}
        onCustomerSelectionToggle={onCustomerSelectionToggle}
        onDownload={onAssetDownload}
        onShare={onAssetShare}
        onLock={onAssetLock}
        onDelete={onAssetDelete}
        onSetCover={onSetCover}
        onUpdateAsset={onUpdateAsset}
        sortable={sortable}
        // Display Options
        aspectRatio="square"
        data-photo-index={index}
        onKeyDown={(e) => handleKeyDown(e, index)}
        isPrivateUnlocked={isPrivateUnlocked}
        onUnlockPrivate={onUnlockPrivate}
        // Watermark props
        showWatermark={showWatermark}
        watermarkSettings={watermarkSettings}
        // Face detection props
        faceCount={faceSummaries?.get(asset.asset_id)?.faceCount}
        personNames={faceSummaries?.get(asset.asset_id)?.personNames}
      />
    );
  };

  // Standard grid content (non-virtualized)
  const standardGridContent = (
    <div
      className={`grid ${getColumnClasses(columns)} ${getGapClass(gap)} ${className}`}
      role="grid"
      aria-label="Photo gallery"
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((asset, index) => renderPhotoCard(asset, index))}
    </div>
  );

  // Virtualized grid content
  const virtualizedGridContent = (
    <div
      ref={scrollContainerRef}
      className={`overflow-y-auto h-full ${className}`}
      role="grid"
      aria-label="Photo gallery"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Total height container for scroll */}
      <div style={{ height: totalHeight, position: 'relative' }}>
        {/* Top spacer */}
        <div style={{ height: topSpacerHeight }} aria-hidden="true" />

        {/* Visible rows */}
        {virtualRows.map((row) => (
          <div
            key={`row-${row.rowIndex}`}
            className={`grid ${getColumnClasses(columns)} ${getGapClass(gap)}`}
            style={{ height: rowHeight }}
          >
            {row.items.map((asset, colIndex) => {
              const globalIndex = row.startIndex + colIndex;
              return renderPhotoCard(asset, globalIndex);
            })}
          </div>
        ))}

        {/* Bottom spacer */}
        <div style={{ height: bottomSpacerHeight }} aria-hidden="true" />
      </div>
    </div>
  );

  // Choose content based on virtualization state
  const gridContent = shouldVirtualize ? virtualizedGridContent : standardGridContent;

  // Enable DndContext if sortable or drag-to-tab is enabled
  // This DndContext handles both sorting within grid and drag-to-tab
  if (sortable || onMoveToSubGallery) {
    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        {sortable ? (
          <SortableContext items={items.map((item) => item.asset_id)} strategy={rectSortingStrategy}>
            {gridContent}
          </SortableContext>
        ) : (
          gridContent
        )}
      </DndContext>
    );
  }

  return gridContent;
};

// Sortable wrapper component for PhotoCard
interface SortablePhotoCardProps {
  asset: GalleryAssetItem;
  index: number;
  isManagementSelected: boolean;
  managementSelectable: boolean;
  showCustomerSelection?: boolean;
  isCover?: boolean;
  onManagementSelect?: (assetId: string) => void;
  onClick?: (asset: GalleryAssetItem, index: number, e?: React.MouseEvent) => void;
  onFavorite?: (assetId: string, favorite: boolean) => void;
  onCustomerSelectionToggle?: (assetId: string, selected: boolean) => void;
  onDownload?: (assetId: string) => void;
  onShare?: (assetId: string) => void;
  onLock?: (assetId: string, isPrivate: boolean) => void;
  onDelete?: (assetId: string) => void;
  onSetCover?: (assetId: string) => void;
  onUpdateAsset?: (assetId: string, data: { title: string; description: string; is_private: boolean }) => void;
  sortable: boolean;
  aspectRatio?: 'square' | 'auto';
  'data-photo-index'?: number;
  onKeyDown?: (e: React.KeyboardEvent, index: number) => void;
  isPrivateUnlocked?: boolean;
  onUnlockPrivate?: () => void;
  showWatermark?: boolean;
  watermarkSettings?: WatermarkSettings;
  faceCount?: number;
  personNames?: string[];
}

const SortablePhotoCard: React.FC<SortablePhotoCardProps> = ({
  asset,
  index,
  isManagementSelected,
  managementSelectable,
  showCustomerSelection,
  isCover,
  onManagementSelect,
  onClick,
  onFavorite,
  onCustomerSelectionToggle,
  onDownload,
  onShare,
  onLock,
  onDelete,
  onSetCover,
  onUpdateAsset,
  aspectRatio,
  'data-photo-index': dataIndex,
  onKeyDown,
  isPrivateUnlocked,
  onUnlockPrivate,
  showWatermark,
  watermarkSettings,
  faceCount,
  personNames,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: asset.asset_id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-asset-id={asset.asset_id}
      data-photo-index={dataIndex}
      onKeyDown={(e) => onKeyDown?.(e, index)}
      {...attributes}
      {...listeners}
      className={isDragging ? 'cursor-grabbing' : 'cursor-grab'}
    >
      <PhotoCard
        asset={asset}
        index={index}
        isManagementSelected={isManagementSelected}
        managementSelectable={managementSelectable}
        showCustomerSelection={showCustomerSelection}
        isCover={isCover}
        onManagementSelect={onManagementSelect}
        onClick={onClick}
        onFavorite={onFavorite}
        onCustomerSelectionToggle={onCustomerSelectionToggle}
        onDownload={onDownload}
        onShare={onShare}
        onLock={onLock}
        onDelete={onDelete}
        onSetCover={onSetCover}
        onUpdateAsset={onUpdateAsset}
        showActions={true}
        aspectRatio={aspectRatio}
        isPrivateUnlocked={isPrivateUnlocked}
        onUnlockPrivate={onUnlockPrivate}
        showWatermark={showWatermark}
        watermarkSettings={watermarkSettings}
        faceCount={faceCount}
        personNames={personNames}
      />
    </div>
  );
};

// Non-sortable wrapper component
const PhotoCardWrapper: React.FC<SortablePhotoCardProps> = ({
  asset,
  index,
  isManagementSelected,
  managementSelectable,
  showCustomerSelection,
  isCover,
  onManagementSelect,
  onClick,
  onFavorite,
  onCustomerSelectionToggle,
  onDownload,
  onShare,
  onLock,
  onDelete,
  onSetCover,
  onUpdateAsset,
  aspectRatio,
  'data-photo-index': dataIndex,
  onKeyDown,
  isPrivateUnlocked,
  onUnlockPrivate,
  showWatermark,
  watermarkSettings,
  faceCount,
  personNames,
}) => {
  return (
    <div
      data-asset-id={asset.asset_id}
      data-photo-index={dataIndex}
      onKeyDown={(e) => onKeyDown?.(e, index)}
    >
      <PhotoCard
        asset={asset}
        index={index}
        isManagementSelected={isManagementSelected}
        managementSelectable={managementSelectable}
        showCustomerSelection={showCustomerSelection}
        isCover={isCover}
        onManagementSelect={onManagementSelect}
        onClick={onClick}
        onFavorite={onFavorite}
        onCustomerSelectionToggle={onCustomerSelectionToggle}
        onDownload={onDownload}
        onShare={onShare}
        onLock={onLock}
        onDelete={onDelete}
        onSetCover={onSetCover}
        onUpdateAsset={onUpdateAsset}
        showActions={true}
        aspectRatio={aspectRatio}
        isPrivateUnlocked={isPrivateUnlocked}
        onUnlockPrivate={onUnlockPrivate}
        showWatermark={showWatermark}
        watermarkSettings={watermarkSettings}
        faceCount={faceCount}
        personNames={personNames}
      />
    </div>
  );
};

// Memoize the entire grid to prevent re-renders from parent state changes
export const PhotoGrid = React.memo(PhotoGridComponent);
export default PhotoGrid;

