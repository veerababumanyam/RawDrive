/**
 * PhotoGrid Component
 * Gallery-specific photo grid with signed URL support and batch fetching
 * Property 13: Lazy Loading Images
 * Supports drag-drop reordering via @dnd-kit
 */

import React, { useState, useEffect, useCallback } from 'react';
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
import { signedUrlService } from '../../../services/signedUrlService';
import { useAuth } from '../../../contexts/AuthContext';
import { PhotoCard } from './PhotoCard';
import { GalleryAssetItem } from '../../../types/gallery';
import { ResponsiveColumns } from '../../../types/canvas';

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
  onAssetDelete?: (assetId: string) => void;
  onSetCover?: (assetId: string) => void;
  onSortOrderChange?: (assetIds: string[]) => void;
  onMoveToSubGallery?: (assetId: string, subGalleryId: string | null) => void;
  sortable?: boolean;
  isLoading?: boolean;
  className?: string;
  columns?: ResponsiveColumns;
  gap?: 'sm' | 'md' | 'lg';
}

const getColumnClasses = (columns?: ResponsiveColumns) => {
  const { sm = 2, md = 3, lg = 4, xl = 5 } = columns || {};
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
  onAssetDelete,
  onSetCover,
  onSortOrderChange,
  onMoveToSubGallery,
  sortable = false,
  isLoading = false,
  className = '',
  columns,
  gap,
}) => {
  const { workspace } = useAuth();
  const [visibleAssets, setVisibleAssets] = useState<Set<string>>(new Set());
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

  // Batch fetch signed URLs for visible assets (optimization)
  // Note: Individual PhotoCard components will also fetch via useSignedUrl hook
  // This is an optimization to pre-fetch URLs for better UX
  useEffect(() => {
    if (!workspace?.workspace_id || assets.length === 0) return;

    const visibleIds = Array.from(visibleAssets);
    if (visibleIds.length === 0) {
      // Initial load - fetch first batch
      const initialBatch = assets
        .slice(0, 20)
        .filter((a) => a.asset.status === 'available')
        .map((a) => a.asset_id);

      if (initialBatch.length > 0) {
        signedUrlService
          .getSignedUrls(workspace.workspace_id, initialBatch, 'thumbnail')
          .catch((error) => {
            console.error('Failed to batch fetch signed URLs:', error);
          });
      }
    } else {
      // Fetch URLs for newly visible assets that don't have cached URLs
      const newIds = visibleIds.filter(
        (id) => {
          const asset = assets.find((a) => a.asset_id === id);
          return asset && asset.asset.status === 'available' && !asset.asset.thumbnail_url;
        }
      );

      if (newIds.length > 0) {
        signedUrlService
          .getSignedUrls(workspace.workspace_id, newIds, 'thumbnail')
          .catch((error) => {
            console.error('Failed to fetch signed URLs for visible assets:', error);
          });
      }
    }
  }, [visibleAssets, assets, workspace?.workspace_id]);

  // Intersection Observer for lazy loading
  const observerRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;

      const observer = new IntersectionObserver(
        (entries) => {
          const newVisibleIds = new Set<string>();

          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const assetId = entry.target.getAttribute('data-asset-id');
              if (assetId) {
                newVisibleIds.add(assetId);
              }
            }
          });

          if (newVisibleIds.size > 0) {
            setVisibleAssets((prev) => {
              // Check if we actually have new IDs to add to avoid state update
              let hasNew = false;
              newVisibleIds.forEach(id => {
                if (!prev.has(id)) hasNew = true;
              });

              if (!hasNew) return prev;

              const next = new Set(prev);
              newVisibleIds.forEach((id) => next.add(id));
              return next;
            });
          }
        },
        {
          rootMargin: '200px', // Start loading 200px before visible
          threshold: 0.1,
        }
      );

      observer.observe(node);
      return () => observer.disconnect();
    },
    []
  );

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

  const gridContent = (
    <div
      className={`grid ${getColumnClasses(columns)} ${getGapClass(gap)} ${className}`}
      role="grid"
      aria-label="Photo gallery"
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((asset, index) => {
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
            onDelete={onAssetDelete}
            onSetCover={onSetCover}
            observerRef={index >= 20 ? observerRef : undefined}
            sortable={sortable}
            // New Props
            aspectRatio="square"
            data-photo-index={index}
            onKeyDown={(e) => handleKeyDown(e, index)}
          />
        );
      })}
    </div>
  );

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
  onDelete?: (assetId: string) => void;
  onSetCover?: (assetId: string) => void;
  observerRef?: (node: HTMLDivElement | null) => void;
  sortable: boolean;
  aspectRatio?: 'square' | 'auto';
  'data-photo-index'?: number;
  onKeyDown?: (e: React.KeyboardEvent, index: number) => void;
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
  onDelete,
  onSetCover,
  observerRef,
  aspectRatio,
  'data-photo-index': dataIndex,
  onKeyDown,
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
      ref={(node) => {
        setNodeRef(node);
        if (observerRef) observerRef(node);
      }}
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
        onDelete={onDelete}
        onSetCover={onSetCover}
        showActions={true}
        aspectRatio={aspectRatio}
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
  onDelete,
  onSetCover,
  observerRef,
  aspectRatio,
  'data-photo-index': dataIndex,
  onKeyDown,
}) => {
  return (
    <div
      ref={observerRef}
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
        onDelete={onDelete}
        onSetCover={onSetCover}
        showActions={true}
        aspectRatio={aspectRatio}
      />
    </div>
  );
};

// Memoize the entire grid to prevent re-renders from parent state changes
export const PhotoGrid = React.memo(PhotoGridComponent);
export default PhotoGrid;

