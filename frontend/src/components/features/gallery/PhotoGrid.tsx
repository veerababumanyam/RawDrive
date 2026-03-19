/**
 * PhotoGrid Component
 * Gallery-specific photo grid with signed URL support and batch fetching
 * Property 13: Lazy Loading Images
 * Supports drag-drop reordering via @dnd-kit
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { Image as ImageIcon } from 'lucide-react';
import { PhotoCard } from './PhotoCard';
import { GalleryAssetItem } from '../../../types/gallery';
import { ResponsiveColumns } from '../../../types/canvas';
import { useTranslation } from 'react-i18next';

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
  sortable = false,
  isLoading = false,
  className = '',
  columns,
  gap,
  isPrivateUnlocked,
  onUnlockPrivate,
}) => {
  const { t } = useTranslation(['gallery', 'common']);
  const [items, setItems] = useState<GalleryAssetItem[]>(assets);

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

  // Keyboard navigation handler
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
  }, [items.length, currentColCount]);

  // Memoize grid content to prevent recreation on every render.
  // Must run unconditionally (before any early return) to satisfy Rules of Hooks.
  const gridContent = useMemo(() => (
    <div
      className={`grid ${getColumnClasses(columns)} ${getGapClass(gap)} ${className}`}
      role="grid"
      aria-label="Photo gallery"
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((asset, index) => {
        // Use stable component reference based on sortable prop
        const ItemComponent = sortable ? SortablePhotoCard : PhotoCardWrapper;

        return (
          <ItemComponent
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
            sortable={sortable}
            // New Props
            aspectRatio="square"
            data-photo-index={index}
            onKeyDown={(e) => handleKeyDown(e, index)}
            isPrivateUnlocked={isPrivateUnlocked}
            onUnlockPrivate={onUnlockPrivate}
          />
        );
      })}
    </div>
  ), [
    items,
    selectedAssetIds,
    coverAssetId,
    sortable,
    managementSelectable,
    showCustomerSelection,
    columns,
    gap,
    className,
    onManagementSelect,
    onAssetClick,
    onAssetFavorite,
    onCustomerSelectionToggle,
    onAssetDownload,
    onAssetShare,
    onAssetLock,
    onAssetDelete,
    onSetCover,
    handleKeyDown,
    isPrivateUnlocked,
    onUnlockPrivate,
  ]);

  // Loading skeleton (early return after all hooks)
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
          <ImageIcon size={32} className="text-text-tertiary" aria-hidden="true" />
        </div>
        <p className="text-text-secondary">{t('gallery:list.noPhotos')}</p>
      </div>
    );
  }

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
  sortable: boolean;
  aspectRatio?: 'square' | 'auto';
  'data-photo-index'?: number;
  onKeyDown?: (e: React.KeyboardEvent, index: number) => void;
  isPrivateUnlocked?: boolean;
  onUnlockPrivate?: () => void;
}

/**
 * Custom comparison function for wrapper components
 * Prevents re-renders when only callbacks change (they use stable asset_id)
 */
const areWrapperPropsEqual = (
  prevProps: SortablePhotoCardProps,
  nextProps: SortablePhotoCardProps
): boolean => {
  // Check asset identity and key properties
  if (prevProps.asset.asset_id !== nextProps.asset.asset_id) return false;
  if (prevProps.asset.is_favorited !== nextProps.asset.is_favorited) return false;
  if (prevProps.asset.is_selected !== nextProps.asset.is_selected) return false;
  if (prevProps.asset.is_private !== nextProps.asset.is_private) return false;
  if (prevProps.asset.asset.status !== nextProps.asset.asset.status) return false;
  if (prevProps.asset.asset.thumbnail_url !== nextProps.asset.asset.thumbnail_url) return false;

  // Check other props
  if (prevProps.index !== nextProps.index) return false;
  if (prevProps.isManagementSelected !== nextProps.isManagementSelected) return false;
  if (prevProps.managementSelectable !== nextProps.managementSelectable) return false;
  if (prevProps.showCustomerSelection !== nextProps.showCustomerSelection) return false;
  if (prevProps.isCover !== nextProps.isCover) return false;
  if (prevProps.aspectRatio !== nextProps.aspectRatio) return false;
  if (prevProps['data-photo-index'] !== nextProps['data-photo-index']) return false;
  if (prevProps.isPrivateUnlocked !== nextProps.isPrivateUnlocked) return false;

  // Callbacks intentionally not compared - they use stable identifiers
  return true;
};

const SortablePhotoCardComponent: React.FC<SortablePhotoCardProps> = ({
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
  aspectRatio,
  'data-photo-index': dataIndex,
  onKeyDown,
  isPrivateUnlocked,
  onUnlockPrivate,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: asset.asset_id });

  // Memoize style to prevent object recreation
  const style = useMemo(() => ({
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }), [transform, transition, isDragging]);

  // Memoize keydown handler
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => onKeyDown?.(e, index),
    [onKeyDown, index]
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-asset-id={asset.asset_id}
      data-photo-index={dataIndex}
      onKeyDown={handleKeyDown}
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
        showActions={true}
        aspectRatio={aspectRatio}
        isPrivateUnlocked={isPrivateUnlocked}
        onUnlockPrivate={onUnlockPrivate}
      />
    </div>
  );
};

// Memoized sortable photo card
const SortablePhotoCard = React.memo(SortablePhotoCardComponent, areWrapperPropsEqual);

// Non-sortable wrapper component
const PhotoCardWrapperComponent: React.FC<SortablePhotoCardProps> = ({
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
  aspectRatio,
  'data-photo-index': dataIndex,
  onKeyDown,
  isPrivateUnlocked,
  onUnlockPrivate,
}) => {
  // Memoize keydown handler
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => onKeyDown?.(e, index),
    [onKeyDown, index]
  );

  return (
    <div
      data-asset-id={asset.asset_id}
      data-photo-index={dataIndex}
      onKeyDown={handleKeyDown}
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
        showActions={true}
        aspectRatio={aspectRatio}
        isPrivateUnlocked={isPrivateUnlocked}
        onUnlockPrivate={onUnlockPrivate}
      />
    </div>
  );
};

// Memoized non-sortable photo card wrapper
const PhotoCardWrapper = React.memo(PhotoCardWrapperComponent, areWrapperPropsEqual);

// Memoize the entire grid to prevent re-renders from parent state changes
export const PhotoGrid = React.memo(PhotoGridComponent);
export default PhotoGrid;

