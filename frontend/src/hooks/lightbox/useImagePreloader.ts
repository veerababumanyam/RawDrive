/**
 * useImagePreloader Hook
 * Preloads adjacent images for faster lightbox navigation
 * Target: <300ms image transition time
 */

import { useEffect, useRef, useCallback } from 'react';
import type { GalleryAssetItem } from '../../types/gallery';

export interface UseImagePreloaderOptions {
  /** All assets in the gallery */
  assets: GalleryAssetItem[];
  /** Current asset index */
  currentIndex: number;
  /** Whether preloading is enabled (default: true) */
  enabled?: boolean;
  /** Number of images to preload in each direction (default: 2) */
  preloadCount?: number;
  /** Function to get signed URL for an asset */
  getPreviewUrl?: (assetId: string) => string | undefined;
}

interface PreloadedImage {
  assetId: string;
  img: HTMLImageElement;
  loaded: boolean;
  error: boolean;
}

/**
 * Preloads adjacent images in the gallery for faster navigation
 *
 * @example
 * ```tsx
 * const preloader = useImagePreloader({
 *   assets,
 *   currentIndex,
 *   getPreviewUrl: (assetId) => signedUrls[assetId] || null,
 * });
 *
 * // Check if an image is preloaded
 * const isReady = preloader.isPreloaded(assets[currentIndex + 1]?.asset_id);
 * ```
 */
export function useImagePreloader(options: UseImagePreloaderOptions) {
  const {
    assets,
    currentIndex,
    enabled = true,
    preloadCount = 2,
    getPreviewUrl,
  } = options;

  // Track preloaded images
  const preloadedRef = useRef<Map<string, PreloadedImage>>(new Map());
  const abortControllerRef = useRef<AbortController | null>(null);

  // Get assets to preload based on current index
  const getAssetsToPreload = useCallback(() => {
    if (!enabled || assets.length === 0) return [];

    const toPreload: GalleryAssetItem[] = [];

    // Preload images before current
    for (let i = 1; i <= preloadCount; i++) {
      const prevIndex = currentIndex - i;
      if (prevIndex >= 0 && assets[prevIndex]) {
        toPreload.push(assets[prevIndex]);
      }
    }

    // Preload images after current
    for (let i = 1; i <= preloadCount; i++) {
      const nextIndex = currentIndex + i;
      if (nextIndex < assets.length && assets[nextIndex]) {
        toPreload.push(assets[nextIndex]);
      }
    }

    return toPreload;
  }, [assets, currentIndex, enabled, preloadCount]);

  // Preload a single image
  const preloadImage = useCallback((asset: GalleryAssetItem, signal?: AbortSignal) => {
    const assetId = asset.asset_id;

    // Skip if already preloaded or loading
    if (preloadedRef.current.has(assetId)) {
      return;
    }

    // Get URL - try preview_url from asset, or use getPreviewUrl callback
    let url = asset.asset.preview_url;
    if (!url && getPreviewUrl) {
      url = getPreviewUrl(assetId);
    }

    if (!url) {
      // No URL available, skip
      return;
    }

    // Create image element for preloading
    const img = new Image();

    const preloadEntry: PreloadedImage = {
      assetId,
      img,
      loaded: false,
      error: false,
    };

    preloadedRef.current.set(assetId, preloadEntry);

    img.onload = () => {
      if (!signal?.aborted) {
        preloadEntry.loaded = true;
      }
    };

    img.onerror = () => {
      if (!signal?.aborted) {
        preloadEntry.error = true;
      }
    };

    // Start loading
    img.src = url;
  }, [getPreviewUrl]);

  // Check if an asset is preloaded
  const isPreloaded = useCallback((assetId: string | undefined): boolean => {
    if (!assetId) return false;
    const entry = preloadedRef.current.get(assetId);
    return entry?.loaded === true;
  }, []);

  // Get preload status for an asset
  const getPreloadStatus = useCallback((assetId: string | undefined): 'loading' | 'loaded' | 'error' | 'pending' => {
    if (!assetId) return 'pending';
    const entry = preloadedRef.current.get(assetId);
    if (!entry) return 'pending';
    if (entry.loaded) return 'loaded';
    if (entry.error) return 'error';
    return 'loading';
  }, []);

  // Clean up old preloaded images to prevent memory bloat
  const cleanupOldPreloads = useCallback(() => {
    const maxCache = (preloadCount * 2) + 3; // Keep a few extra
    const currentAssets = new Set<string>();

    // Mark current and adjacent assets as needed
    for (let i = -preloadCount; i <= preloadCount; i++) {
      const index = currentIndex + i;
      if (index >= 0 && index < assets.length) {
        currentAssets.add(assets[index].asset_id);
      }
    }

    // Remove entries that are no longer needed
    const entries = Array.from(preloadedRef.current.entries());
    if (entries.length > maxCache) {
      // Sort by whether they're needed
      const toRemove = entries
        .filter(([assetId]) => !currentAssets.has(assetId))
        .slice(0, entries.length - maxCache);

      toRemove.forEach(([assetId]) => {
        preloadedRef.current.delete(assetId);
      });
    }
  }, [assets, currentIndex, preloadCount]);

  // Effect to preload adjacent images when index changes
  useEffect(() => {
    if (!enabled) return;

    // Cancel previous preload operations
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    // Get assets to preload
    const toPreload = getAssetsToPreload();

    // Preload each asset
    toPreload.forEach((asset) => {
      preloadImage(asset, signal);
    });

    // Cleanup old preloads
    cleanupOldPreloads();

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [enabled, currentIndex, getAssetsToPreload, preloadImage, cleanupOldPreloads]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      preloadedRef.current.clear();
    };
  }, []);

  return {
    /** Check if a specific asset is preloaded */
    isPreloaded,
    /** Get the preload status of an asset */
    getPreloadStatus,
    /** Manually preload a specific asset */
    preload: preloadImage,
    /** Number of currently preloaded images */
    preloadedCount: preloadedRef.current.size,
  };
}
