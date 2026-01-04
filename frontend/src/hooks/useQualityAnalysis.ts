/**
 * useQualityAnalysis Hook
 *
 * React hook for managing photo quality analysis in the Smart Curate feature.
 * Handles fetching quality scores, filtering, and progress tracking.
 *
 * Feature: 023-enhanced-smart-curate (US1)
 */

import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { curationService } from '@/services/curationService';
import type {
  PhotoQualityResult,
  QualityAnalysisResponse,
  QualityAnalysisProgressResponse,
  QualityAnalysisSummary,
  CurationSession,
  CurationStatus,
} from '@/types/curation';

// Query keys
const QUALITY_KEYS = {
  results: (workspaceId: string, galleryId: string) =>
    ['quality', 'results', workspaceId, galleryId] as const,
  progress: (workspaceId: string, galleryId: string, sessionId: string) =>
    ['quality', 'progress', workspaceId, galleryId, sessionId] as const,
  filtered: (workspaceId: string, galleryId: string, filters: QualityFilters) =>
    ['quality', 'filtered', workspaceId, galleryId, filters] as const,
};

// Polling interval for active analysis
const POLLING_INTERVAL_MS = 2000;

// Quality tier thresholds
export const QUALITY_TIERS = {
  excellent: { min: 80, max: 100, label: 'Excellent', color: 'emerald' },
  good: { min: 60, max: 79, label: 'Good', color: 'blue' },
  fair: { min: 40, max: 59, label: 'Fair', color: 'amber' },
  poor: { min: 0, max: 39, label: 'Poor', color: 'red' },
} as const;

export type QualityTier = keyof typeof QUALITY_TIERS;

export interface QualityFilters {
  minScore?: number;
  maxScore?: number;
  blurDetected?: boolean;
  tier?: QualityTier;
}

interface UseQualityAnalysisOptions {
  /** Workspace ID */
  workspaceId: string;
  /** Gallery ID */
  galleryId: string;
  /** Session ID for progress tracking (optional) */
  sessionId?: string;
  /** Enable polling when analysis is active */
  enablePolling?: boolean;
  /** Quality filters */
  filters?: QualityFilters;
  /** Callback when analysis completes */
  onComplete?: (results: QualityAnalysisResponse) => void;
  /** Callback when analysis fails */
  onError?: (error: string) => void;
}

interface UseQualityAnalysisResult {
  // Quality data
  results: PhotoQualityResult[];
  summary: QualityAnalysisSummary | null;
  progress: QualityAnalysisProgressResponse | null;
  isLoading: boolean;
  error: Error | null;

  // Actions
  startAnalysis: (options?: { sessionId?: string }) => Promise<CurationSession>;
  refetch: () => Promise<void>;

  // State helpers
  isAnalyzing: boolean;
  isStarting: boolean;
  hasResults: boolean;
  progressPercent: number;

  // Filtering helpers
  filterByTier: (tier: QualityTier) => PhotoQualityResult[];
  filterByBlur: (blurOnly: boolean) => PhotoQualityResult[];
  getTopPhotos: (count: number) => PhotoQualityResult[];
  getBlurredPhotos: () => PhotoQualityResult[];
}

/**
 * Get quality tier for a score
 */
export function getQualityTier(score: number): QualityTier {
  if (score >= QUALITY_TIERS.excellent.min) return 'excellent';
  if (score >= QUALITY_TIERS.good.min) return 'good';
  if (score >= QUALITY_TIERS.fair.min) return 'fair';
  return 'poor';
}

/**
 * Hook for managing photo quality analysis in the Smart Curate feature.
 *
 * @example
 * ```tsx
 * const {
 *   results,
 *   summary,
 *   isAnalyzing,
 *   startAnalysis,
 *   getTopPhotos,
 * } = useQualityAnalysis({
 *   workspaceId: '...',
 *   galleryId: '...',
 *   onComplete: (data) => toast.success(`Analyzed ${data.results.length} photos`),
 * });
 *
 * // Get top 20 photos by quality
 * const bestPhotos = getTopPhotos(20);
 *
 * // Filter blurred photos for review
 * const blurredPhotos = getBlurredPhotos();
 * ```
 */
export function useQualityAnalysis({
  workspaceId,
  galleryId,
  sessionId,
  enablePolling = true,
  filters,
  onComplete,
  onError,
}: UseQualityAnalysisOptions): UseQualityAnalysisResult {
  const queryClient = useQueryClient();
  const prevStatusRef = useRef<CurationStatus | null>(null);

  // Fetch quality analysis results
  const {
    data: qualityData,
    isLoading: isLoadingResults,
    error: resultsError,
    refetch: refetchResults,
  } = useQuery({
    queryKey: QUALITY_KEYS.results(workspaceId, galleryId),
    queryFn: () =>
      curationService.getQualityAnalysis(workspaceId, galleryId, {
        sessionId,
        minScore: filters?.minScore,
        maxScore: filters?.maxScore,
        blurOnly: filters?.blurDetected,
      }),
    enabled: !!workspaceId && !!galleryId,
    staleTime: 30_000, // Cache for 30 seconds
  });

  // Fetch progress for active sessions
  const {
    data: progressData,
    isLoading: isLoadingProgress,
    refetch: refetchProgress,
  } = useQuery({
    queryKey: QUALITY_KEYS.progress(workspaceId, galleryId, sessionId || ''),
    queryFn: () =>
      sessionId
        ? curationService.getQualityAnalysisProgress(workspaceId, galleryId, sessionId)
        : Promise.resolve(null),
    enabled: !!workspaceId && !!galleryId && !!sessionId,
    refetchInterval: (query) => {
      // Poll while analysis is active
      const data = query.state.data;
      if (enablePolling && data && isActiveAnalysisStatus(data.status)) {
        return POLLING_INTERVAL_MS;
      }
      return false;
    },
  });

  // Handle status transitions
  useEffect(() => {
    if (!progressData) return;

    const prevStatus = prevStatusRef.current;
    const newStatus = progressData.status;

    // Analysis completed
    if (prevStatus && isActiveAnalysisStatus(prevStatus) && newStatus === 'completed') {
      // Refetch results when analysis completes
      refetchResults();
      if (qualityData) {
        onComplete?.(qualityData);
      }
    }

    // Analysis failed
    if (prevStatus && isActiveAnalysisStatus(prevStatus) && newStatus === 'failed') {
      onError?.('Quality analysis failed');
    }

    prevStatusRef.current = newStatus;
  }, [progressData, qualityData, onComplete, onError, refetchResults]);

  // Start analysis mutation
  const startMutation = useMutation({
    mutationFn: (options?: { sessionId?: string }) =>
      curationService.startQualityAnalysis(workspaceId, galleryId, options),
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({
        queryKey: QUALITY_KEYS.results(workspaceId, galleryId),
      });
    },
  });

  // Actions
  const startAnalysis = useCallback(
    (options?: { sessionId?: string }) => startMutation.mutateAsync(options),
    [startMutation]
  );

  const refetch = useCallback(async () => {
    await Promise.all([refetchResults(), refetchProgress()]);
  }, [refetchResults, refetchProgress]);

  // Filtering helpers
  const filterByTier = useCallback(
    (tier: QualityTier): PhotoQualityResult[] => {
      if (!qualityData?.results) return [];
      const tierConfig = QUALITY_TIERS[tier];
      return qualityData.results.filter(
        (r) => r.overall_score >= tierConfig.min && r.overall_score <= tierConfig.max
      );
    },
    [qualityData]
  );

  const filterByBlur = useCallback(
    (blurOnly: boolean): PhotoQualityResult[] => {
      if (!qualityData?.results) return [];
      return qualityData.results.filter((r) => r.blur_detected === blurOnly);
    },
    [qualityData]
  );

  const getTopPhotos = useCallback(
    (count: number): PhotoQualityResult[] => {
      if (!qualityData?.results) return [];
      return [...qualityData.results]
        .sort((a, b) => b.overall_score - a.overall_score)
        .slice(0, count);
    },
    [qualityData]
  );

  const getBlurredPhotos = useCallback((): PhotoQualityResult[] => {
    if (!qualityData?.results) return [];
    return qualityData.results.filter((r) => r.blur_detected);
  }, [qualityData]);

  // Computed state
  const isAnalyzing =
    !!progressData && isActiveAnalysisStatus(progressData.status);
  const hasResults = (qualityData?.results?.length ?? 0) > 0;
  const progressPercent = progressData?.progress_percent ?? 0;

  return {
    // Quality data
    results: qualityData?.results ?? [],
    summary: qualityData?.summary ?? null,
    progress: progressData ?? null,
    isLoading: isLoadingResults || isLoadingProgress,
    error: resultsError || null,

    // Actions
    startAnalysis,
    refetch,

    // State helpers
    isAnalyzing,
    isStarting: startMutation.isPending,
    hasResults,
    progressPercent,

    // Filtering helpers
    filterByTier,
    filterByBlur,
    getTopPhotos,
    getBlurredPhotos,
  };
}

/**
 * Check if a status indicates active analysis
 */
function isActiveAnalysisStatus(status: CurationStatus): boolean {
  return ['pending', 'analyzing'].includes(status);
}

export default useQualityAnalysis;
