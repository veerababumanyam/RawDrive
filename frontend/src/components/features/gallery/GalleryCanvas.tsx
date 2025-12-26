import React from 'react';
import { PhotoGrid } from './PhotoGrid';
import { GalleryCanvasProps } from '../../../types/canvas';
export type { GalleryCanvasProps };

import { MasonryLayout } from './MasonryLayout';
import { SignedUrlProvider } from '../../../contexts/SignedUrlContext';

// Placeholder for MasonryLayout - REMOVED

export const GalleryCanvas: React.FC<GalleryCanvasProps> = ({
  assets,
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
  onAssetDelete,
  onAssetUpdate,
  onSetCover,
  sortable,
  onSortOrderChange,
  onMoveToSubGallery,
  coverAssetId,
  isLoading,
  error,
  className = '',
}) => {
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
    if (!onSelectionChange) return;
    
    // We can't access useSelection state directly here since it lives in parent (usually).
    // wait, GalleryCanvas receives "selectedAssetIds" and "onSelectionChange".
    // It is a dumb component. 
    // THE LOGIC I ADDED TO useSelection IS MOOT UNLESS THE PARENT USES IT.
    // GalleryDetailPage uses useSelection, and passes onSelectionChange.
    
    // PROBLEM: onSelectionChange signature is (ids: Set<string>) => void.
    // It doesn't accept the EVENT or the raw interaction.
    // AND GalleryCanvas doesn't have the `handleSelection` action from the hook.
    
    // If I want to support this, I have two options:
    // 1. Change onSelectionChange to accept the *result* (requires logic inside Canvas?) 
    //    NO, Canvas is dumb.
    // 2. Change `onAssetSelect` prop to receive the event, and let Page handle it using hook.
    //    The prop `onAssetSelect` is currently: `(assetId: string) => void` implicitly in internal implementation?
    //    Actually `commonProps` defines `onAssetSelect: handleAssetSelect`.
    //    And `PhotoGrid` calls `onAssetSelect(asset.asset_id, event)`.
    
    // So, I need to Update `GalleryCanvas` props?
    // `GalleryCanvas` has `onSelectionChange` but NOT `onAssetSelect` exposed to parent.
    // Parent passes `onSelectionChange`.
    
    // So GalleryCanvas acts as the controller?
    // If GalleryCanvas is just UI, it should bubble the event.
    // BUT `GalleryCanvas.tsx` has `handleAssetSelect` which calculates the new Set.
    // THIS IS WHERE THE LOGIC IS CURRENTLY DUPLICATED OR IMPLEMENTED.
    
    // Re-reading `GalleryCanvas.tsx`:
    // It implements `handleAssetSelect` which does a simple toggle.
    // This ignores `useSelection` hook logic on the parent if the parent *only* receives the final Set.
    
    // Solution:
    // I need to change how `GalleryCanvas` calculates the new set.
    // Since `GalleryCanvas` doesn't have access to the `useSelection` hook instance of the parent,
    // sending a new Set from here is hard if we want complex logic (range select needs list order).
    
    // BETTER APPROACH:
    // Pass `onAssetSelect` handling UP to the parent?
    // OR
    // Reproduce the logic in `GalleryCanvas`?
    // `useSelection` is imported in `GalleryCanvas`? No.
    
    // Check `GalleryDetailPage.tsx`.
    // It uses `useSelection`.
    
    // I should expose an `onAssetClick` or `onSelectionAction` that passes the ID and Event.
    
    // Wait, `GalleryCanvasProps` has `onSelectionChange: (ids: Set<string>) => void`.
    // If I do logic in Canvas, I need the list of assets (I have it).
    // I need the last selected ID (I DON'T have it in props).
    
    // I need to add `lastSelectedId` to `GalleryCanvasProps` to implement Shift-Click range select here.
    // OR create a `useSelection` instance inside Canvas? No, state is lifted.
    
    // Let's look at `CanvasState`. It has `lastSelectedAssetId`.
    // `GalleryCanvasProps` has `selectedAssetIds`. Does it have `lastSelectedAssetId`? NO.
    
    // Steps to fix:
    // 1. Add `lastSelectedAssetId` to `GalleryCanvasProps` (already in CanvasState, maybe missed in Props).
    // 2. Pass it from Page.
    // 3. Implement `handleSelection` logic inside `GalleryCanvas` (reusing hook logic? or just importing the logic helper).
    //    Actually, if I can use the hook's logic, that's best.
    //    But the hook manages state.
    
    // Alternative:
    // The `GalleryCanvas` should just call `onAssetSelect(id, event)` if provided?
    // But `onSelectionChange` expects a Set.
    
    // Let's modify `GalleryCanvasProps` to accept an `onAssetSelectionAttempt` or similar? 
    // OR just use `onAssetClick`?
    // `onAssetClick` is for "Activation" (lightbox/navigate). Selection is "Select".
    
    // Let's check `GalleryDetailPage` again.
    
    // I'll stick to my plan:
    // 1. Update `GalleryCanvasProps` to include `onSelectionAction` or modify `onAssetSelect` prop?
    //    `GalleryCanvas` currently takes `assets`.
    
    // Let's Look at `GalleryCanvasProps`:
    // It has `onSelectionChange`.
    
    // I will try to implement the logic inside `GalleryCanvas` for now, 
    // BUT I need `lastSelectedId`.
    // I'll add `lastSelectedId` to `GalleryCanvasProps`.
    
    // Wait, `useSelection` hook logic is reusable?
    // It updates internal state.
    // If I duplicate logic in Canvas, it's bad.
    
    // REVISED PLAN FOR CANVAS:
    // Pass `handleSelection` (from hook) to `GalleryCanvas`.
    // Instead of `onSelectionChange`, we might want to pass the `actions` object?
    // `GalleryCanvasProps` has `onSelectionChange`.
    
    // Let's change `GalleryCanvasProps` to accept `selectionActions`?
    // That's a breaking change for standardized props.
    
    // Let's stick to adding `lastSelectedId` to props, and implementing the `handleSelection` logic LOCALLY in `GalleryCanvas` 
    // to calculate the new Set, then calling `onSelectionChange`.
    // Effectively, `GalleryCanvas` becomes the "Controller" for selection input -> Set output.
    
    // Need: `lastSelectedAssetId` prop.
    // Need: Logic similar to `useSelection`.
    
    // Wait, if I do that, `useSelection` hook on parent is redundant for logic, only storage.
    // AND `useSelection` hook has `selectRange` logic utilizing `assets`.
    // `GalleryCanvas` has `assets` and `selectedAssetIds`.
    
    // So rewriting logic in `GalleryCanvas` is feasible.
    
    if (event) {
        // Handle modifier keys
        const isMulti = event.metaKey || event.ctrlKey;
        const isRange = event.shiftKey;
        
        let newSet = new Set(selectedAssetIds);
        
        if (isMulti) {
             if (newSet.has(assetId)) newSet.delete(assetId);
             else newSet.add(assetId);
             // TODO: We need to notify parent about "Last Selected" update?
             // onSelectionChange only accepts Set.
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
        
        // ISSUE: We are not passing back the "Last Selected ID". 
        // So subsequent shift-clicks won't work correctly if state lives in parent 
        // and parent doesn't know which was last clicked.
        
        // CONCLUSION: `onSelectionChange` needs to send `(ids: Set<string>, lastSelectedId: string)`.
        
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
    onAssetDelete,
    onUpdateAsset: onAssetUpdate,
    onSetCover,
    isLoading,
    className,
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
    />
  );

  return (
    <SignedUrlProvider>
      {content}
    </SignedUrlProvider>
  );
};

export default GalleryCanvas;
