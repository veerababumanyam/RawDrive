/**
 * MasonryLayout Component
 * Renders photos in a masonry (pintrest-style) layout.
 * Property 2: Masonry Layout Aspect Ratio Preservation
 */

import React, { useMemo, useState, useEffect } from 'react';
import { GalleryAssetItem } from '../../../types/gallery';
import { ResponsiveColumns, WatermarkSettings, FaceSummary } from '../../../types/canvas';
import { PhotoCard } from './PhotoCard';

export interface MasonryLayoutProps {
  assets: GalleryAssetItem[];
  columns?: ResponsiveColumns;
  gap?: 'sm' | 'md' | 'lg';
  selectedAssetIds?: Set<string>;
  /** Enable management selection mode for CRUD operations */
  managementSelectable?: boolean;
  /** Show customer selection toggle for delivery workflow */
  showCustomerSelection?: boolean;
  coverAssetId?: string | null;
  onManagementSelect?: (assetId: string) => void;
  onAssetClick?: (asset: GalleryAssetItem, index: number) => void;
  onAssetFavorite?: (assetId: string, favorite: boolean) => void;
  onCustomerSelectionToggle?: (assetId: string, selected: boolean) => void;
  onAssetDownload?: (assetId: string) => void;
  onAssetShare?: (assetId: string) => void;
  onAssetLock?: (assetId: string, isPrivate: boolean) => void;
  onAssetDelete?: (assetId: string) => void;
  onSetCover?: (assetId: string) => void;
  onUpdateAsset?: (assetId: string, data: { title: string; description: string; is_private: boolean }) => void;
  isLoading?: boolean;
  className?: string;
  isPrivateUnlocked?: boolean;
  onUnlockPrivate?: () => void;
  /** Show watermark overlay on photos */
  showWatermark?: boolean;
  /** Watermark configuration settings */
  watermarkSettings?: WatermarkSettings;
  /** Map of asset IDs to face summaries for face detection badges */
  faceSummaries?: Map<string, FaceSummary>;
  // Masonry doesn't support DnD sortable in this version
}

export const MasonryLayout: React.FC<MasonryLayoutProps> = ({
  assets,
  columns,
  gap = 'md',
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
  onUpdateAsset,
  isLoading = false,
  className = '',
  isPrivateUnlocked,
  onUnlockPrivate,
  showWatermark = false,
  watermarkSettings,
  faceSummaries,
}) => {
  // Column calculation
  const [columnCount, setColumnCount] = useState(3);
  
  useEffect(() => {
    const updateColumns = () => {
      // Safe check for SSR
      if (typeof window === 'undefined') return;
      
      const width = window.innerWidth;
      const { sm = 2, md = 3, lg = 4, xl = 5 } = columns || {};
      
      if (width < 640) setColumnCount(sm);
      else if (width < 1024) setColumnCount(md);
      else if (width < 1536) setColumnCount(lg);
      else setColumnCount(xl);
    };
    
    updateColumns();
    window.addEventListener('resize', updateColumns);
    return () => window.removeEventListener('resize', updateColumns);
  }, [columns]);

  // Distribute assets into columns
  const columnAssets = useMemo(() => {
    const cols: GalleryAssetItem[][] = Array.from({ length: columnCount }, () => []);
    const heights: number[] = new Array(columnCount).fill(0);

    assets.forEach((asset) => {
      // Find shortest column
      const shortestColIndex = heights.indexOf(Math.min(...heights));
      
      cols[shortestColIndex].push(asset);
      
      // Approximate height contribution (aspect ratio based)
      // Default to 1.0 if dimensions missing
      const aspectRatio = (asset.asset.width && asset.asset.height) 
        ? asset.asset.width / asset.asset.height 
        : 1.33; // Default 4:3
        
      // Height is inversely proportional to aspect ratio (width/height)
      // We assume equal width columns, so height added is 1/aspectRatio
      heights[shortestColIndex] += 1 / aspectRatio;
    });

    return cols;
  }, [assets, columnCount]);

  // Get gap size in pixels for margin implementation
  const getGapSize = () => {
    switch (gap) {
      case 'sm': return 4;
      case 'md': return 8;
      case 'lg': return 16;
      default: return 8;
    }
  };
  
  const gapSize = getGapSize();

  // Note: SignedUrlContext handles batched URL fetching automatically
  // Each PhotoCard uses useSignedUrl which goes through the context's batching logic
  // No need for duplicate batch fetching or intersection observer here

  if (isLoading) {
    return (
      <div className={`grid grid-cols-${columnCount} gap-${gap} ${className}`}>
         {/* Skeleton */}
         <div className="text-text-secondary w-full text-center py-8 col-span-full">Loading...</div>
      </div>
    );
  }
  
  if (assets.length === 0) {
    return (
        <div className={`flex flex-col items-center justify-center py-16 ${className}`}>
        <p className="text-text-secondary">No photos in this gallery</p>
      </div>
    );
  }

  return (
    <div 
        className={`flex w-full ${className}`} 
        style={{ gap: `${gapSize}px` }}
        role="grid"
        aria-label="Masonry photo gallery"
    >
      {columnAssets.map((col, colIndex) => (
        <div 
            key={colIndex} 
            className="flex flex-col flex-1 min-w-0"
            style={{ gap: `${gapSize}px` }}
        >
          {col.map((asset) => (
             <div
                key={asset.asset_id}
                data-asset-id={asset.asset_id}
             >
                <PhotoCard
                    asset={asset}
                    index={assets.findIndex(a => a.asset_id === asset.asset_id)} // Global index
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
                    showActions={true}
                    aspectRatio="auto" // Preserves original aspect ratio
                    isPrivateUnlocked={isPrivateUnlocked}
                    onUnlockPrivate={onUnlockPrivate}
                    showWatermark={showWatermark}
                    watermarkSettings={watermarkSettings}
                    faceCount={faceSummaries?.get(asset.asset_id)?.faceCount}
                    personNames={faceSummaries?.get(asset.asset_id)?.personNames}
                />
             </div>
          ))}
        </div>
      ))}
    </div>
  );
};
