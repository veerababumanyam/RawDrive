/**
 * Design Preview Canvas - Gallery Design Studio Preview
 *
 * Renders a live preview of the gallery cover with:
 * - Real-time theme and font application
 * - Cover style preview
 * - Responsive viewport modes (mobile/tablet/desktop)
 * - Container-query responsive preview
 * - Gallery title and basic info
 *
 * Features:
 * - CSS variable injection for instant updates
 * - Zero re-renders for theme changes (CSS-only)
 * - Container queries for accurate device simulation (@sm:, @md:, @lg:)
 * - Smooth transitions for viewport mode changes
 * - Feature detection with fallback for older browsers
 */

import React, { useRef, useState, useEffect } from 'react';
import { GalleryDesignConfig } from '../../../../types/gallery-design';
import { getCoverStyle } from '../../../../constants/coverStyleCatalog';
import { CoverRenderer } from '../covers/CoverRenderer';
import { galleryDesignService } from '../../../../services/galleryDesignService';

/**
 * Check if container queries are supported
 * Uses feature detection for CSS Container Queries
 */
const supportsContainerQueries = (): boolean => {
  if (typeof window === 'undefined' || typeof CSS === 'undefined') {
    return false;
  }
  return CSS.supports('container-type', 'inline-size');
};

interface DesignPreviewCanvasProps {
  config: GalleryDesignConfig;
  galleryId: string;
  workspaceId: string;
  viewportMode: {
    type: 'mobile' | 'tablet' | 'desktop';
    width?: number;
  };
  galleryTitle?: string;
  galleryDescription?: string;
}

interface GalleryAsset {
  asset_id: string;
  gallery_asset_id: string;
  visible: boolean;
  asset: {
    filename: string;
    type: string;
    width?: number;
    height?: number;
    thumbnail_url?: string;
    preview_url?: string;
    date_taken?: string;
  };
}

export const DesignPreviewCanvas: React.FC<DesignPreviewCanvasProps> = ({
  config,
  galleryId,
  workspaceId,
  viewportMode,
  galleryTitle,
  galleryDescription,
}) => {
  const previewRef = useRef<HTMLDivElement>(null);
  const [containerQueriesSupported] = useState(() => supportsContainerQueries());

  // Gallery asset state
  const [previewAssets, setPreviewAssets] = useState<GalleryAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [assetsError, setAssetsError] = useState<string | null>(null);

  // Fetch gallery assets for preview
  useEffect(() => {
    let isMounted = true; // Prevent state updates on unmounted component

    const fetchPreviewAssets = async () => {
      try {
        setLoadingAssets(true);
        setAssetsError(null);

        // Fetch first 6 assets for preview (1 for cover + 5 for grid)
        console.log('Fetching gallery assets:', { galleryId, workspaceId });
        const response = await galleryDesignService.getGalleryAssets(
          galleryId,
          workspaceId,  // workspace_id
          1,            // page 1
          6             // limit 6 photos
        );

        console.log('Gallery assets response:', response);
        if (isMounted) {
          setPreviewAssets(response.data);
          console.log('Preview assets set:', response.data.length, 'photos');
        }
      } catch (error) {
        console.error('Failed to load preview assets:', error);
        console.error('Error details:', {
          message: error instanceof Error ? error.message : 'Unknown error',
          galleryId,
        });
        if (isMounted) {
          setAssetsError('Failed to load gallery photos');
        }
      } finally {
        if (isMounted) {
          setLoadingAssets(false);
        }
      }
    };

    console.log('useEffect condition check:', { galleryId, workspaceId, willFetch: !!(galleryId && workspaceId) });

    if (galleryId && workspaceId) {
      fetchPreviewAssets();
    } else {
      console.warn('Skipping fetch - missing:', { galleryId: !galleryId ? 'YES' : 'NO', workspaceId: !workspaceId ? 'YES' : 'NO' });
    }

    return () => {
      isMounted = false; // Cleanup flag
    };
  }, [galleryId, workspaceId]); // Re-fetch if galleryId or workspaceId changes

  // Get current cover style info
  const coverStyle = getCoverStyle(config.cover.style);

  // Responsive width based on viewport mode (T051)
  const getContainerWidth = (): number | undefined => {
    if (viewportMode.type === 'mobile') {
      return Math.min(viewportMode.width || 375, 600);
    }
    if (viewportMode.type === 'tablet') {
      return Math.min(viewportMode.width || 768, 900);
    }
    return undefined; // desktop = full width
  };

  const containerWidth = getContainerWidth();

  // Get responsive grid columns based on container width (T049)
  // Uses container queries when supported, fallback to viewport queries
  const getGridColumns = (): string => {
    if (!containerWidth) {
      // Desktop: 3+ columns
      return '@lg:grid-cols-4 @md:grid-cols-3 @sm:grid-cols-2 grid-cols-1';
    }
    if (containerWidth >= 768) {
      // Tablet: 2-3 columns
      return '@md:grid-cols-3 @sm:grid-cols-2 grid-cols-2';
    }
    // Mobile: 1-2 columns
    return '@sm:grid-cols-2 grid-cols-1';
  };

  // Get responsive text sizing (T050)
  const getTextClasses = (): { heading: string; body: string } => {
    return {
      heading: '@lg:text-4xl @md:text-3xl @sm:text-2xl text-xl',
      body: '@lg:text-base @md:text-sm text-xs',
    };
  };

  // For desktop, use w-full to fill parent width (parent has w-full)
  // For mobile/tablet, use mx-auto for centering with fixed width
  const containerClass =
    viewportMode.type !== 'desktop'
      ? 'mx-auto'
      : 'w-full';

  // Get viewport icon and label
  const getViewportLabel = () => {
    switch (viewportMode.type) {
      case 'mobile':
        return 'Mobile';
      case 'tablet':
        return 'Tablet';
      default:
        return 'Desktop';
    }
  };

  const textClasses = getTextClasses();
  const gridClasses = getGridColumns();

  return (
    <div
      ref={previewRef}
      className={`${containerClass} max-w-full`}
      style={{
        // Smooth transition for width changes (T052)
        transition: 'width 300ms ease-in-out, transform 200ms ease-out',
        // For mobile/tablet: use explicit width; for desktop: let flex-1 handle it
        width: containerWidth ? `${containerWidth}px` : undefined,
        // Set container type for container queries (T053)
        containerType: containerQueriesSupported ? 'inline-size' : undefined,
      }}
    >
      {/* Cover Preview Container - with smooth transitions (T052) */}
      <div
        className="rounded-3xl shadow-[0_50px_100px_-20px_rgba(0,0,0,0.6)] overflow-hidden bg-black border border-white/20 transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
        style={{
          aspectRatio:
            viewportMode.type === 'mobile'
              ? '9/16'
              : viewportMode.type === 'tablet'
                ? '4/3'
                : '16/9',
        }}
      >
        <CoverRenderer
          style={config.cover.style}
          title={galleryTitle || 'Gallery Title'}
          subtitle={galleryDescription || 'Your wedding story'}
          coverImageUrl={
            previewAssets.length > 0
              ? previewAssets[0].asset.preview_url || previewAssets[0].asset.thumbnail_url
              : undefined
          }
          focalPoint={config.cover.focalPoint}
          overlayOpacity={config.cover.overlayOpacity}
          config={config}
        />
      </div>

      {/* Gallery Grid Preview - Container Query Responsive (T048, T049) */}
      <div className="mt-12 group/grid">
        <h4 className={`text-gray-600 dark:text-white/50 font-semibold tracking-wide mb-4 group-hover/grid:text-gray-700 dark:group-hover/grid:text-white/70 transition-colors ${textClasses.body}`}>
          Secondary gallery section
        </h4>
        <div
          className={`grid gap-2 transition-all duration-300 ${gridClasses}`}
          style={{
            // Container type for grid container queries
            containerType: containerQueriesSupported ? 'inline-size' : undefined,
          }}
        >
          {loadingAssets ? (
            // Loading state: Show skeleton placeholders
            [1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={`skeleton-${i}`}
                className="aspect-square rounded-2xl bg-gray-200 dark:bg-white/[0.03] border border-gray-300 dark:border-white/[0.05] animate-pulse"
              />
            ))
          ) : previewAssets.length === 0 ? (
            // Empty state: No photos in gallery
            <div className="col-span-full flex flex-col items-center justify-center py-8 text-center">
              <div className="text-4xl mb-2 opacity-20">📷</div>
              <p className="text-xs text-gray-500 dark:text-white/30">
                No photos in gallery yet
              </p>
            </div>
          ) : (
            // Success state: Display real photos
            previewAssets.map((asset) => {
              const imageUrl = asset.asset.preview_url || asset.asset.thumbnail_url;

              return (
                <div
                  key={asset.asset_id}
                  className="aspect-square rounded-2xl bg-gray-200 dark:bg-white/[0.03] border border-gray-300 dark:border-white/[0.05] overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:shadow-xl group/item"
                >
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={asset.asset.filename}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    // Fallback if no URL available (edge case)
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="w-8 h-px bg-gray-400 dark:bg-white/10 group-hover/item:bg-cyan-400 group-hover/item:w-12 transition-all duration-500" />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

    </div>
  );
};


export default DesignPreviewCanvas;
