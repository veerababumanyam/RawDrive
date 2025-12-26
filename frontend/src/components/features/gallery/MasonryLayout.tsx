/**
 * MasonryLayout Component
 * Renders photos in a masonry (pintrest-style) layout.
 * Property 2: Masonry Layout Aspect Ratio Preservation
 */

import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { GalleryAssetItem } from '../../../types/gallery';
import { ResponsiveColumns } from '../../../types/canvas';
import { PhotoCard } from './PhotoCard';
import { useAuth } from '../../../contexts/AuthContext';
import { signedUrlService } from '../../../services/signedUrlService';

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
  onAssetDelete?: (assetId: string) => void;
  onSetCover?: (assetId: string) => void;
  isLoading?: boolean;
  className?: string;
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
  onAssetDelete,
  onSetCover,
  isLoading = false,
  className = '',
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

  // Lazy loading observer logic (similar to PhotoGrid)
  const { workspace } = useAuth();
  const [visibleAssets, setVisibleAssets] = useState<Set<string>>(new Set());

  // Batch fetch signed URLs
  useEffect(() => {
     if (!workspace?.workspace_id || assets.length === 0) return;

    const visibleIds = Array.from(visibleAssets);
    // Logic duped from PhotoGrid - reusing service
    if (visibleIds.length > 0) {
       const newIds = visibleIds.filter(
        (id) => {
          const asset = assets.find((a) => a.asset_id === id);
          return asset && asset.asset.status === 'available' && !asset.asset.thumbnail_url;
        }
      );
      
      if (newIds.length > 0) {
        signedUrlService
          .getSignedUrls(workspace.workspace_id, newIds, 'thumbnail')
          .catch(console.error);
      }
    } else {
        // Initial load
        const initialBatch = assets
        .slice(0, 20)
        .filter((a) => a.asset.status === 'available')
        .map((a) => a.asset_id);
        
        if (initialBatch.length > 0) {
            signedUrlService.getSignedUrls(workspace.workspace_id, initialBatch, 'thumbnail').catch(console.error);
        }
    }
  }, [visibleAssets, assets, workspace?.workspace_id]);

  const observerInstance = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    return () => {
      observerInstance.current?.disconnect();
    };
  }, []);

  const observerRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;
      
      if (!observerInstance.current) {
        observerInstance.current = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                const assetId = entry.target.getAttribute('data-asset-id');
                if (assetId) {
                  setVisibleAssets(prev => {
                      if (prev.has(assetId)) return prev;
                      const next = new Set(prev);
                      next.add(assetId);
                      return next;
                  });
                }
              }
            });
          },
          { rootMargin: '200px', threshold: 0.1 }
        );
      }
      
      observerInstance.current.observe(node);
    },
    []
  );

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
                ref={observerRef}
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
                    onDelete={onAssetDelete}
                    onSetCover={onSetCover}
                    showActions={true}
                    aspectRatio="auto" // Preserves original aspect ratio
                />
             </div>
          ))}
        </div>
      ))}
    </div>
  );
};
