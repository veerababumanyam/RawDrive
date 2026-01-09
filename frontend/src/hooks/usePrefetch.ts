/**
 * usePrefetch Hook
 * Prefetches next page assets and lightbox neighbors for instant loading
 *
 * Performance optimization: Pre-loads assets before they're needed
 * - Next page prefetch: Triggered at 75% scroll position
 * - Lightbox neighbor prefetch: Pre-loads 3 images on each side
 */

import { useCallback, useRef, useEffect } from 'react';
import { galleryService } from '../services/galleryService';
import { signedUrlService } from '../services/signedUrlService';
import type { GalleryAssetItem } from '../types/gallery';

interface UsePrefetchOptions {
  workspaceId: string;
  galleryId: string;
  subGalleryId?: string | null;
  currentPage: number;
  totalPages: number;
  limit: number;
  /** Current assets being displayed */
  assets: GalleryAssetItem[];
  /** Enable prefetching (default: true) */
  enabled?: boolean;
}

interface UsePrefetchReturn {
  /** Prefetch next page assets */
  prefetchNextPage: () => Promise<void>;
  /** Prefetch lightbox neighbors for given index */
  prefetchLightboxNeighbors: (currentIndex: number) => void;
  /** Check if next page should be prefetched based on scroll position */
  shouldPrefetchNextPage: (scrollRatio: number) => boolean;
}

// Cache prefetched asset IDs to avoid redundant fetches
const prefetchedPages = new Set<string>();
const prefetchedAssets = new Set<string>();

export const usePrefetch = ({
  workspaceId,
  galleryId,
  subGalleryId,
  currentPage,
  totalPages,
  limit,
  assets,
  enabled = true,
}: UsePrefetchOptions): UsePrefetchReturn => {
  const prefetchingRef = useRef(false);
  const prefetchedPageRef = useRef<number>(0);

  // Clear prefetch cache when gallery changes
  useEffect(() => {
    prefetchedPageRef.current = 0;
    // Don't clear the full set - other galleries may still benefit from cached URLs
  }, [galleryId, subGalleryId]);

  /**
   * Prefetch the next page of assets
   * Fetches asset data and signed URLs in advance
   */
  const prefetchNextPage = useCallback(async () => {
    if (!enabled || prefetchingRef.current) return;
    if (currentPage >= totalPages) return; // No more pages

    const nextPage = currentPage + 1;
    const cacheKey = `${galleryId}:${subGalleryId || 'root'}:${nextPage}`;

    // Skip if already prefetched
    if (prefetchedPages.has(cacheKey) || prefetchedPageRef.current >= nextPage) {
      return;
    }

    prefetchingRef.current = true;

    try {
      // Fetch next page data (low priority, non-blocking)
      const response = await galleryService.listGalleryAssets(workspaceId, galleryId, {
        page: nextPage,
        limit,
        sub_gallery_id: subGalleryId === null ? '' : subGalleryId,
      });

      // Prefetch signed URLs for all assets
      if (response.data.length > 0) {
        const assetIds = response.data.map((a) => a.asset_id);

        // Prefetch thumbnail URLs (most important for grid view)
        await signedUrlService.getSignedUrls(workspaceId, assetIds, 'thumbnail');

        // Mark as prefetched
        prefetchedPages.add(cacheKey);
        prefetchedPageRef.current = nextPage;
        assetIds.forEach((id) => prefetchedAssets.add(id));

        // Also preload the actual images using Image objects
        response.data.forEach((asset) => {
          if (asset.asset.thumbnail_url || asset.asset.lqip) {
            const img = new Image();
            img.src = asset.asset.thumbnail_url || '';
          }
        });
      }
    } catch (error) {
      // Silently fail - prefetching is optional
      console.debug('[Prefetch] Next page prefetch failed:', error);
    } finally {
      prefetchingRef.current = false;
    }
  }, [enabled, workspaceId, galleryId, subGalleryId, currentPage, totalPages, limit]);

  /**
   * Prefetch lightbox neighbor images
   * Pre-loads 3 images on each side of current index
   */
  const prefetchLightboxNeighbors = useCallback(
    (currentIndex: number) => {
      if (!enabled || !workspaceId) return;

      const neighborRange = 3; // Prefetch 3 images on each side
      const startIndex = Math.max(0, currentIndex - neighborRange);
      const endIndex = Math.min(assets.length - 1, currentIndex + neighborRange);

      const assetsToPrefetch: string[] = [];

      for (let i = startIndex; i <= endIndex; i++) {
        if (i === currentIndex) continue; // Skip current (already loading)

        const asset = assets[i];
        if (!asset) continue;

        const assetId = asset.asset_id;

        // Skip if already prefetched
        if (prefetchedAssets.has(`preview:${assetId}`)) continue;

        assetsToPrefetch.push(assetId);
        prefetchedAssets.add(`preview:${assetId}`);
      }

      if (assetsToPrefetch.length === 0) return;

      // Prefetch preview URLs (higher quality for lightbox)
      signedUrlService
        .getSignedUrls(workspaceId, assetsToPrefetch, 'preview')
        .then((urlMap) => {
          // Preload the actual images
          urlMap.forEach((url) => {
            const img = new Image();
            img.src = url;
          });
        })
        .catch((error) => {
          console.debug('[Prefetch] Lightbox neighbors prefetch failed:', error);
        });
    },
    [enabled, workspaceId, assets]
  );

  /**
   * Check if next page should be prefetched based on scroll position
   * Returns true when scroll position is at or past 75%
   */
  const shouldPrefetchNextPage = useCallback(
    (scrollRatio: number): boolean => {
      if (!enabled) return false;
      if (currentPage >= totalPages) return false;
      if (prefetchedPageRef.current >= currentPage + 1) return false;

      // Prefetch at 75% scroll position
      return scrollRatio >= 0.75;
    },
    [enabled, currentPage, totalPages]
  );

  return {
    prefetchNextPage,
    prefetchLightboxNeighbors,
    shouldPrefetchNextPage,
  };
};

/**
 * Clear prefetch cache
 * Call when navigating away or on memory pressure
 */
export const clearPrefetchCache = (): void => {
  prefetchedPages.clear();
  prefetchedAssets.clear();
};

export default usePrefetch;
