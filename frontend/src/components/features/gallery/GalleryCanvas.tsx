import React from 'react';
import { PhotoGrid } from './PhotoGrid';
import { GalleryCanvasProps } from '../../../types/canvas';
export type { GalleryCanvasProps };

import { MasonryLayout } from './MasonryLayout';
import { SignedUrlProvider } from '../../../contexts/SignedUrlContext';
import { useFacesSummary } from '../../../hooks/useFacesSummary';

// Placeholder for MasonryLayout - REMOVED

export const GalleryCanvas: React.FC<GalleryCanvasProps> = ({
  assets,
  galleryId,
  viewMode,
  columns,
  gap,
  selectedAssetIds,
  lastSelectedId,
  managementSelectable = true,
  showCustomerSelection = true,
  onSelectionChange,
  onCustomerSelectionToggle,
  onAssetClick,
  onAssetFavorite,
  onAssetDownload,
  onAssetShare,
  onAssetLock,
  onAssetDelete,
  onAssetUpdate,
  onSetCover,
  sortable,
  onSortOrderChange,
  onMoveToSubGallery,
  coverAssetId,
  isLoading,
  error,
  showWatermark = false,
  watermarkSettings,
  showFaceDetection = false,
  enableVirtualization = false,
  rowHeight = 280,
  isPrivateUnlocked,
  onUnlockPrivate,
  className = '',
}) => {
  // Fetch face summaries for this gallery (only when enabled and galleryId is provided)
  const { faceSummaries } = useFacesSummary({
    galleryId: galleryId ?? '',
    enabled: showFaceDetection && !!galleryId,
  });
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="text-warning mb-4">
          <svg
            className="w-12 h-12"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-text-primary mb-2">
          Unable to load gallery
        </h3>
        <p className="text-text-secondary">{error.message}</p>
      </div>
    );
  }

  /* Updated to handle MouseEvent for multi-select */
  const handleAssetSelect = (assetId: string, event?: React.MouseEvent) => {
    if (event) {
        // Handle modifier keys
        const isMulti = event.metaKey || event.ctrlKey;
        const isRange = event.shiftKey;
        
        let newSet = new Set(selectedAssetIds);
        
        if (isMulti) {
             if (newSet.has(assetId)) newSet.delete(assetId);
             else newSet.add(assetId);
        } else if (isRange && lastSelectedId) {
             // Range logic needs assets list and lastSelectedId
             // Find indices...
             const fromIdx = assets.findIndex(a => a.asset_id === lastSelectedId);
             const toIdx = assets.findIndex(a => a.asset_id === assetId);
             if (fromIdx !== -1 && toIdx !== -1) {
                 const start = Math.min(fromIdx, toIdx);
                 const end = Math.max(fromIdx, toIdx);
                 const range = assets.slice(start, end+1).map(a => a.asset_id);
                 range.forEach(id => newSet.add(id));
             }
        } else {
             // Single select
             newSet = new Set([assetId]);
        }
        
        onSelectionChange(newSet);
        
    } else {
        // Fallback or explicit non-event selection (checkbox?)
         const newSet = new Set(selectedAssetIds);
         if (newSet.has(assetId)) {
           newSet.delete(assetId);
         } else {
           newSet.add(assetId);
         }
         onSelectionChange(newSet);
    }
  };

  const handleAssetSelection = (assetId: string, selected: boolean) => {
    // This is explicitly setting selection state (e.g. from checkbox)
    if (!onSelectionChange) return;
    
    const newSet = new Set(selectedAssetIds);
    if (selected) {
      newSet.add(assetId);
    } else {
      newSet.delete(assetId);
    }
    onSelectionChange(newSet);
  };

  const commonProps = {
    assets,
    selectedAssetIds,
    managementSelectable,
    showCustomerSelection,
    coverAssetId,
    onManagementSelect: handleAssetSelect,
    onCustomerSelectionToggle: onCustomerSelectionToggle || handleAssetSelection,
    onAssetClick,
    onAssetFavorite,
    onAssetDownload,
    onAssetShare,
    onAssetLock,
    onAssetDelete,
    onUpdateAsset: onAssetUpdate,
    onSetCover,

    isPrivateUnlocked,
    onUnlockPrivate,
    isLoading,
    className,
    // Watermark props (passed through to PhotoCard)
    showWatermark,
    watermarkSettings,
    // Face detection props (from useFacesSummary hook)
    faceSummaries: showFaceDetection ? faceSummaries : undefined,
  };

  const content = viewMode === 'masonry' ? (
      <MasonryLayout
        {...commonProps}
        columns={columns}
        gap={gap}
      />
  ) : (
    <PhotoGrid
      {...commonProps}
      columns={columns}
      gap={gap}
      sortable={sortable}
      onSortOrderChange={onSortOrderChange}
      onMoveToSubGallery={onMoveToSubGallery}
      enableVirtualization={enableVirtualization}
      rowHeight={rowHeight}
    />
  );

  return (
    <SignedUrlProvider>
      {content}
    </SignedUrlProvider>
  );
};

export default GalleryCanvas;
