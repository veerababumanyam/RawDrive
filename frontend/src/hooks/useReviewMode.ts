/**
 * useReviewMode Hook
 * State and navigation management for Pro Review Mode
 * Feature: 029-pro-review-xmp-sync
 * Task: T022
 *
 * Manages:
 * - Current asset index and navigation
 * - Asset metadata (rating, flag, color_label)
 * - Filter state
 * - Compare mode state
 * - Auto-advance settings
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { reviewModeService } from '../services/reviewModeService';
import type {
  AssetRating,
  AssetFlag,
  ColorLabel,
  FilteredAsset,
  AssetFilterParams,
  ReviewStats,
} from '../types/reviewMode';
import type { HistogramData } from '../components/features/gallery/review/HistogramDisplay';

export interface UseReviewModeProps {
  /** Workspace ID */
  workspaceId: string;
  /** Gallery ID */
  galleryId: string;
  /** Initial asset ID to display */
  initialAssetId?: string;
  /** Sub-gallery ID filter */
  subGalleryId?: string;
  /** Initial filter params */
  initialFilters?: AssetFilterParams;
  /** Auto-advance to next after rating/flagging */
  autoAdvance?: boolean;
  /** Callback when review mode should close */
  onExit?: () => void;
}

/** Compare mode pane identifier */
export type ComparePane = 'left' | 'right';

/** Compare mode state for 2-up view */
export interface CompareState {
  /** Whether compare mode is active */
  isActive: boolean;
  /** Left pane asset index */
  leftIndex: number;
  /** Right pane asset index */
  rightIndex: number;
  /** Which pane is active for receiving rating/flag changes */
  activePane: ComparePane;
  /** Whether zoom should be synchronized */
  syncZoom: boolean;
}

export interface UseReviewModeReturn {
  // Asset navigation
  assets: FilteredAsset[];
  currentIndex: number;
  currentAsset: FilteredAsset | null;
  totalAssets: number;
  hasNext: boolean;
  hasPrev: boolean;
  goToNext: () => void;
  goToPrev: () => void;
  goToFirst: () => void;
  goToLast: () => void;
  goToIndex: (index: number) => void;
  goToAsset: (assetId: string) => void;

  // Metadata actions
  setRating: (rating: AssetRating) => Promise<void>;
  setFlag: (flag: AssetFlag) => Promise<void>;
  setColorLabel: (label: ColorLabel) => Promise<void>;

  // Batch operations
  batchSetRating: (assetIds: string[], rating: AssetRating) => Promise<void>;
  batchSetFlag: (assetIds: string[], flag: AssetFlag) => Promise<void>;
  batchSetColorLabel: (assetIds: string[], label: ColorLabel) => Promise<void>;

  // Filter state
  filters: AssetFilterParams;
  setFilters: (filters: AssetFilterParams) => void;
  clearFilters: () => void;

  // Statistics
  stats: ReviewStats | null;
  refreshStats: () => Promise<void>;

  // View state (legacy single compare)
  isCompareMode: boolean;
  compareAssetId: string | null;
  toggleCompareMode: () => void;
  setCompareAsset: (assetId: string | null) => void;

  // Compare mode state (2-up view)
  compare: CompareState;
  enterCompareMode: () => void;
  exitCompareMode: () => void;
  setActivePane: (pane: ComparePane) => void;
  toggleActivePane: () => void;
  setLeftIndex: (index: number) => void;
  setRightIndex: (index: number) => void;
  toggleSyncZoom: () => void;
  /** Get the asset for the active compare pane */
  getActiveCompareAsset: () => FilteredAsset | null;
  /** Apply rating to active compare pane asset */
  setCompareRating: (rating: AssetRating) => Promise<void>;
  /** Apply flag to active compare pane asset */
  setCompareFlag: (flag: AssetFlag) => Promise<void>;
  /** Apply color label to active compare pane asset */
  setCompareColorLabel: (label: ColorLabel) => Promise<void>;

  // Histogram (T057)
  histogramData: HistogramData | null;
  isHistogramLoading: boolean;
  refreshHistogram: () => Promise<void>;

  // Settings
  autoAdvance: boolean;
  setAutoAdvance: (value: boolean) => void;

  // Loading state
  isLoading: boolean;
  isUpdating: boolean;
  isSyncing: boolean;
  error: string | null;

  // Refresh
  refresh: () => Promise<void>;
}

/**
 * Hook for managing Review Mode state
 */
export function useReviewMode({
  workspaceId,
  galleryId,
  initialAssetId,
  subGalleryId,
  initialFilters = {},
  autoAdvance: initialAutoAdvance = true,
  onExit,
}: UseReviewModeProps): UseReviewModeReturn {
  // State
  const [assets, setAssets] = useState<FilteredAsset[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [filters, setFiltersState] = useState<AssetFilterParams>({
    ...initialFilters,
    sub_gallery_id: subGalleryId,
  });
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false); // Placeholder for XMP sync status
  const [error, setError] = useState<string | null>(null);
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [compareAssetId, setCompareAssetId] = useState<string | null>(null);
  const [autoAdvance, setAutoAdvance] = useState(initialAutoAdvance);

  // Compare mode state (2-up view)
  const [compare, setCompare] = useState<CompareState>({
    isActive: false,
    leftIndex: 0,
    rightIndex: 1,
    activePane: 'left',
    syncZoom: false,
  });

  // Histogram state (T057)
  const [histogramData, setHistogramData] = useState<HistogramData | null>(null);
  const [isHistogramLoading, setIsHistogramLoading] = useState(false);

  // Refs for stable callbacks
  const assetsRef = useRef(assets);
  assetsRef.current = assets;

  // Derived state
  const currentAsset = useMemo(() => assets[currentIndex] || null, [assets, currentIndex]);
  const totalAssets = assets.length;
  const hasNext = currentIndex < totalAssets - 1;
  const hasPrev = currentIndex > 0;

  // Fetch assets
  const fetchAssets = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await reviewModeService.filterAssets(workspaceId, galleryId, {
        ...filters,
        limit: 1000, // Load all for Review Mode
      });
      setAssets(response.assets);

      // Find initial asset index
      if (initialAssetId) {
        const index = response.assets.findIndex((a) => a.asset_id === initialAssetId);
        if (index >= 0) {
          setCurrentIndex(index);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assets');
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, galleryId, filters, initialAssetId]);

  // Fetch stats
  const refreshStats = useCallback(async () => {
    try {
      const result = await reviewModeService.getReviewStats(workspaceId, galleryId, subGalleryId);
      setStats(result);
    } catch (err) {
      console.error('Failed to fetch review stats:', err);
    }
  }, [workspaceId, galleryId, subGalleryId]);

  // Fetch histogram for current asset (T057)
  const refreshHistogram = useCallback(async () => {
    if (!currentAsset) {
      setHistogramData(null);
      return;
    }

    setIsHistogramLoading(true);
    try {
      // Try backend endpoint first
      const data = await reviewModeService.getHistogram(
        workspaceId,
        galleryId,
        currentAsset.asset_id
      );
      setHistogramData(data);
    } catch {
      // Fallback to client-side generation
      try {
        const thumbnailUrl =
          currentAsset.thumbnail_url ||
          `/api/v1/assets/${currentAsset.asset_id}/thumbnail?size=large`;
        const data = await reviewModeService.generateClientSideHistogram(thumbnailUrl);
        setHistogramData(data);
      } catch (clientErr) {
        console.error('Failed to generate histogram:', clientErr);
        setHistogramData(null);
      }
    } finally {
      setIsHistogramLoading(false);
    }
  }, [currentAsset, workspaceId, galleryId]);

  // Initial load
  useEffect(() => {
    fetchAssets();
    refreshStats();
  }, [fetchAssets, refreshStats]);

  // Fetch histogram when current asset changes
  useEffect(() => {
    refreshHistogram();
  }, [refreshHistogram]);

  // Navigation
  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => Math.min(prev + 1, assetsRef.current.length - 1));
  }, []);

  const goToPrev = useCallback(() => {
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const goToFirst = useCallback(() => {
    setCurrentIndex(0);
  }, []);

  const goToLast = useCallback(() => {
    setCurrentIndex(Math.max(0, assetsRef.current.length - 1));
  }, []);

  const goToIndex = useCallback((index: number) => {
    setCurrentIndex(Math.max(0, Math.min(index, assetsRef.current.length - 1)));
  }, []);

  const goToAsset = useCallback((assetId: string) => {
    const index = assetsRef.current.findIndex((a) => a.asset_id === assetId);
    if (index >= 0) {
      setCurrentIndex(index);
    }
  }, []);

  // Helper to update local asset state
  const updateLocalAsset = useCallback((assetId: string, updates: Partial<FilteredAsset>) => {
    setAssets((prev) =>
      prev.map((asset) => (asset.asset_id === assetId ? { ...asset, ...updates } : asset))
    );
  }, []);

  // Metadata actions
  const setRating = useCallback(async (rating: AssetRating) => {
    if (!currentAsset) return;
    try {
      setIsUpdating(true);
      await reviewModeService.setRating(workspaceId, galleryId, currentAsset.asset_id, rating);
      updateLocalAsset(currentAsset.asset_id, { rating });
      if (autoAdvance && rating > 0 && hasNext) {
        setTimeout(goToNext, 100);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set rating');
    } finally {
      setIsUpdating(false);
    }
  }, [currentAsset, workspaceId, galleryId, updateLocalAsset, autoAdvance, hasNext, goToNext]);

  const setFlag = useCallback(async (flag: AssetFlag) => {
    if (!currentAsset) return;
    try {
      setIsUpdating(true);
      await reviewModeService.setFlag(workspaceId, galleryId, currentAsset.asset_id, flag);
      updateLocalAsset(currentAsset.asset_id, { flag });
      if (autoAdvance && flag !== 'unflagged' && hasNext) {
        setTimeout(goToNext, 100);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set flag');
    } finally {
      setIsUpdating(false);
    }
  }, [currentAsset, workspaceId, galleryId, updateLocalAsset, autoAdvance, hasNext, goToNext]);

  const setColorLabel = useCallback(async (label: ColorLabel) => {
    if (!currentAsset) return;
    try {
      setIsUpdating(true);
      await reviewModeService.setColorLabel(workspaceId, galleryId, currentAsset.asset_id, label);
      updateLocalAsset(currentAsset.asset_id, { color_label: label });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set color label');
    } finally {
      setIsUpdating(false);
    }
  }, [currentAsset, workspaceId, galleryId, updateLocalAsset]);

  // Batch operations
  const batchSetRating = useCallback(async (assetIds: string[], rating: AssetRating) => {
    try {
      setIsUpdating(true);
      await reviewModeService.batchSetRating(workspaceId, galleryId, assetIds, rating);
      assetIds.forEach((id) => updateLocalAsset(id, { rating }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to batch set rating');
    } finally {
      setIsUpdating(false);
    }
  }, [workspaceId, galleryId, updateLocalAsset]);

  const batchSetFlag = useCallback(async (assetIds: string[], flag: AssetFlag) => {
    try {
      setIsUpdating(true);
      await reviewModeService.batchSetFlag(workspaceId, galleryId, assetIds, flag);
      assetIds.forEach((id) => updateLocalAsset(id, { flag }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to batch set flag');
    } finally {
      setIsUpdating(false);
    }
  }, [workspaceId, galleryId, updateLocalAsset]);

  const batchSetColorLabel = useCallback(async (assetIds: string[], label: ColorLabel) => {
    try {
      setIsUpdating(true);
      await reviewModeService.batchSetColorLabel(workspaceId, galleryId, assetIds, label);
      assetIds.forEach((id) => updateLocalAsset(id, { color_label: label }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to batch set color label');
    } finally {
      setIsUpdating(false);
    }
  }, [workspaceId, galleryId, updateLocalAsset]);

  // Filter controls
  const setFilters = useCallback((newFilters: AssetFilterParams) => {
    setFiltersState(newFilters);
    setCurrentIndex(0);
  }, []);

  const clearFilters = useCallback(() => {
    setFiltersState({ sub_gallery_id: subGalleryId });
    setCurrentIndex(0);
  }, [subGalleryId]);

  // Compare mode (legacy single compare)
  const toggleCompareMode = useCallback(() => {
    setIsCompareMode((prev) => !prev);
    if (isCompareMode) {
      setCompareAssetId(null);
    }
  }, [isCompareMode]);

  const setCompareAsset = useCallback((assetId: string | null) => {
    setCompareAssetId(assetId);
  }, []);

  // Compare mode (2-up view) methods
  const enterCompareMode = useCallback(() => {
    setCompare((prev) => ({
      ...prev,
      isActive: true,
      leftIndex: currentIndex,
      rightIndex: Math.min(currentIndex + 1, assetsRef.current.length - 1),
      activePane: 'left',
    }));
  }, [currentIndex]);

  const exitCompareMode = useCallback(() => {
    setCompare((prev) => ({
      ...prev,
      isActive: false,
    }));
  }, []);

  const setActivePane = useCallback((pane: ComparePane) => {
    setCompare((prev) => ({ ...prev, activePane: pane }));
  }, []);

  const toggleActivePane = useCallback(() => {
    setCompare((prev) => ({
      ...prev,
      activePane: prev.activePane === 'left' ? 'right' : 'left',
    }));
  }, []);

  const setLeftIndex = useCallback((index: number) => {
    setCompare((prev) => ({
      ...prev,
      leftIndex: Math.max(0, Math.min(index, assetsRef.current.length - 1)),
    }));
  }, []);

  const setRightIndex = useCallback((index: number) => {
    setCompare((prev) => ({
      ...prev,
      rightIndex: Math.max(0, Math.min(index, assetsRef.current.length - 1)),
    }));
  }, []);

  const toggleSyncZoom = useCallback(() => {
    setCompare((prev) => ({ ...prev, syncZoom: !prev.syncZoom }));
  }, []);

  const getActiveCompareAsset = useCallback((): FilteredAsset | null => {
    const index = compare.activePane === 'left' ? compare.leftIndex : compare.rightIndex;
    return assetsRef.current[index] || null;
  }, [compare.activePane, compare.leftIndex, compare.rightIndex]);

  // Apply rating to active compare pane asset
  const setCompareRating = useCallback(async (rating: AssetRating) => {
    const asset = getActiveCompareAsset();
    if (!asset) return;
    try {
      setIsUpdating(true);
      await reviewModeService.setRating(workspaceId, galleryId, asset.asset_id, rating);
      updateLocalAsset(asset.asset_id, { rating });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set rating');
    } finally {
      setIsUpdating(false);
    }
  }, [getActiveCompareAsset, workspaceId, galleryId, updateLocalAsset]);

  // Apply flag to active compare pane asset
  const setCompareFlag = useCallback(async (flag: AssetFlag) => {
    const asset = getActiveCompareAsset();
    if (!asset) return;
    try {
      setIsUpdating(true);
      await reviewModeService.setFlag(workspaceId, galleryId, asset.asset_id, flag);
      updateLocalAsset(asset.asset_id, { flag });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set flag');
    } finally {
      setIsUpdating(false);
    }
  }, [getActiveCompareAsset, workspaceId, galleryId, updateLocalAsset]);

  // Apply color label to active compare pane asset
  const setCompareColorLabel = useCallback(async (label: ColorLabel) => {
    const asset = getActiveCompareAsset();
    if (!asset) return;
    try {
      setIsUpdating(true);
      await reviewModeService.setColorLabel(workspaceId, galleryId, asset.asset_id, label);
      updateLocalAsset(asset.asset_id, { color_label: label });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set color label');
    } finally {
      setIsUpdating(false);
    }
  }, [getActiveCompareAsset, workspaceId, galleryId, updateLocalAsset]);

  // Refresh
  const refresh = useCallback(async () => {
    await Promise.all([fetchAssets(), refreshStats()]);
  }, [fetchAssets, refreshStats]);

  return {
    // Navigation
    assets,
    currentIndex,
    currentAsset,
    totalAssets,
    hasNext,
    hasPrev,
    goToNext,
    goToPrev,
    goToFirst,
    goToLast,
    goToIndex,
    goToAsset,

    // Metadata actions
    setRating,
    setFlag,
    setColorLabel,
    batchSetRating,
    batchSetFlag,
    batchSetColorLabel,

    // Filter state
    filters,
    setFilters,
    clearFilters,

    // Statistics
    stats,
    refreshStats,

    // View state (legacy single compare)
    isCompareMode,
    compareAssetId,
    toggleCompareMode,
    setCompareAsset,

    // Compare mode (2-up view)
    compare,
    enterCompareMode,
    exitCompareMode,
    setActivePane,
    toggleActivePane,
    setLeftIndex,
    setRightIndex,
    toggleSyncZoom,
    getActiveCompareAsset,
    setCompareRating,
    setCompareFlag,
    setCompareColorLabel,

    // Histogram (T057)
    histogramData,
    isHistogramLoading,
    refreshHistogram,

    // Settings
    autoAdvance,
    setAutoAdvance,

    // Loading state
    isLoading,
    isUpdating,
    isSyncing,
    error,

    // Refresh
    refresh,
  };
}

export default useReviewMode;
