/**
 * Portfolio Recommendations Hook
 * React Query hooks for portfolio recommendation operations
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { portfolioRecommendationService } from '../services/portfolioRecommendationService';
import type {
  GenerateRecommendationsRequest,
  SimilarAssetRequest,
  HeroShotsRequest,
  SeasonalRequest,
  RecommendationType,
  RecommendationStatus,
  ClientPreferenceUpdate,
  LearnPreferencesRequest,
  CreateABTestRequest,
  FeedbackRequest,
  BatchEmbeddingRequest,
} from '../services/portfolioRecommendationService';
import {
  ABTestStatus,
  SceneCategory,
} from '@rawdrive/shared-types';

// ---------------------------------------------------------------------------
// Query Keys
// ---------------------------------------------------------------------------

export const portfolioRecommendationKeys = {
  all: ['portfolio-recommendations'] as const,
  lists: () => [...portfolioRecommendationKeys.all, 'list'] as const,
  list: (workspaceId: string, filters?: Record<string, unknown>) =>
    [...portfolioRecommendationKeys.lists(), workspaceId, filters] as const,
  details: () => [...portfolioRecommendationKeys.all, 'detail'] as const,
  detail: (workspaceId: string, recommendationId: string) =>
    [...portfolioRecommendationKeys.details(), workspaceId, recommendationId] as const,
  clientPreferences: (workspaceId: string, clientId: string) =>
    [...portfolioRecommendationKeys.all, 'client-preferences', workspaceId, clientId] as const,
  abTests: () => [...portfolioRecommendationKeys.all, 'ab-tests'] as const,
  abTestList: (workspaceId: string, filters?: Record<string, unknown>) =>
    [...portfolioRecommendationKeys.abTests(), workspaceId, filters] as const,
  abTestDetail: (workspaceId: string, testId: string) =>
    [...portfolioRecommendationKeys.abTests(), 'detail', workspaceId, testId] as const,
  abTestResults: (workspaceId: string, testId: string) =>
    [...portfolioRecommendationKeys.abTests(), 'results', workspaceId, testId] as const,
  topAssets: (workspaceId: string, filters?: Record<string, unknown>) =>
    [...portfolioRecommendationKeys.all, 'top-assets', workspaceId, filters] as const,
};

// ---------------------------------------------------------------------------
// Recommendation Hooks
// ---------------------------------------------------------------------------

/**
 * Generate recommendations
 */
export function useGenerateRecommendations(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: GenerateRecommendationsRequest) =>
      portfolioRecommendationService.generateRecommendations(workspaceId, request),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: portfolioRecommendationKeys.lists(),
      });
    },
  });
}

/**
 * Find similar assets
 */
export function useFindSimilarAssets(workspaceId: string) {
  return useMutation({
    mutationFn: (request: SimilarAssetRequest) =>
      portfolioRecommendationService.findSimilarAssets(workspaceId, request),
  });
}

/**
 * Get personalized recommendations
 */
export function usePersonalizedRecommendations(workspaceId: string, clientId: string) {
  return useMutation({
    mutationFn: (options?: {
      galleryIds?: string[];
      limit?: number;
      includeTrending?: boolean;
    }) =>
      portfolioRecommendationService.getPersonalizedRecommendations(
        workspaceId,
        clientId,
        options
      ),
  });
}

/**
 * Get hero shots
 */
export function useHeroShots(workspaceId: string) {
  return useMutation({
    mutationFn: (options?: HeroShotsRequest) =>
      portfolioRecommendationService.getHeroShots(workspaceId, options),
  });
}

/**
 * Get seasonal recommendations
 */
export function useSeasonalRecommendations(workspaceId: string) {
  return useMutation({
    mutationFn: (request: SeasonalRequest) =>
      portfolioRecommendationService.getSeasonalRecommendations(workspaceId, request),
  });
}

/**
 * Get recommendation by ID
 */
export function useRecommendation(
  workspaceId: string,
  recommendationId: string,
  options?: {
    includeItems?: boolean;
    includeAssetDetails?: boolean;
    enabled?: boolean;
  }
) {
  return useQuery({
    queryKey: portfolioRecommendationKeys.detail(workspaceId, recommendationId),
    queryFn: () =>
      portfolioRecommendationService.getRecommendation(workspaceId, recommendationId, {
        includeItems: options?.includeItems,
        includeAssetDetails: options?.includeAssetDetails,
      }),
    enabled: options?.enabled !== false && !!recommendationId,
  });
}

/**
 * List recommendations
 */
export function useRecommendations(
  workspaceId: string,
  options?: {
    recommendationType?: RecommendationType;
    status?: RecommendationStatus;
    clientId?: string;
    galleryId?: string;
    limit?: number;
    offset?: number;
    enabled?: boolean;
  }
) {
  return useQuery({
    queryKey: portfolioRecommendationKeys.list(workspaceId, options),
    queryFn: () =>
      portfolioRecommendationService.listRecommendations(workspaceId, options),
    enabled: options?.enabled !== false,
  });
}

// ---------------------------------------------------------------------------
// Client Preference Hooks
// ---------------------------------------------------------------------------

/**
 * Get client preferences
 */
export function useClientPreferences(
  workspaceId: string,
  clientId: string,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: portfolioRecommendationKeys.clientPreferences(workspaceId, clientId),
    queryFn: () =>
      portfolioRecommendationService.getClientPreferences(workspaceId, clientId),
    enabled: options?.enabled !== false && !!clientId,
  });
}

/**
 * Update client preferences
 */
export function useUpdateClientPreferences(workspaceId: string, clientId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (preferences: ClientPreferenceUpdate) =>
      portfolioRecommendationService.updateClientPreferences(
        workspaceId,
        clientId,
        preferences
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: portfolioRecommendationKeys.clientPreferences(workspaceId, clientId),
      });
    },
  });
}

/**
 * Learn client preferences from interactions
 */
export function useLearnClientPreferences(workspaceId: string, clientId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: LearnPreferencesRequest) =>
      portfolioRecommendationService.learnClientPreferences(
        workspaceId,
        clientId,
        request
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: portfolioRecommendationKeys.clientPreferences(workspaceId, clientId),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// A/B Testing Hooks
// ---------------------------------------------------------------------------

/**
 * Create A/B test
 */
export function useCreateABTest(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: CreateABTestRequest) =>
      portfolioRecommendationService.createABTest(workspaceId, request),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: portfolioRecommendationKeys.abTests(),
      });
    },
  });
}

/**
 * List A/B tests
 */
export function useABTests(
  workspaceId: string,
  options?: {
    status?: ABTestStatus;
    limit?: number;
    offset?: number;
    enabled?: boolean;
  }
) {
  return useQuery({
    queryKey: portfolioRecommendationKeys.abTestList(workspaceId, options),
    queryFn: () =>
      portfolioRecommendationService.listABTests(workspaceId, options),
    enabled: options?.enabled !== false,
  });
}

/**
 * Get A/B test by ID
 */
export function useABTest(
  workspaceId: string,
  testId: string,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: portfolioRecommendationKeys.abTestDetail(workspaceId, testId),
    queryFn: () => portfolioRecommendationService.getABTest(workspaceId, testId),
    enabled: options?.enabled !== false && !!testId,
  });
}

/**
 * Start A/B test
 */
export function useStartABTest(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (testId: string) =>
      portfolioRecommendationService.startABTest(workspaceId, testId),
    onSuccess: (_, testId) => {
      queryClient.invalidateQueries({
        queryKey: portfolioRecommendationKeys.abTestDetail(workspaceId, testId),
      });
      queryClient.invalidateQueries({
        queryKey: portfolioRecommendationKeys.abTests(),
      });
    },
  });
}

/**
 * Conclude A/B test
 */
export function useConcludeABTest(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ testId, winnerVariant }: { testId: string; winnerVariant?: string }) =>
      portfolioRecommendationService.concludeABTest(workspaceId, testId, winnerVariant),
    onSuccess: (_, { testId }) => {
      queryClient.invalidateQueries({
        queryKey: portfolioRecommendationKeys.abTestDetail(workspaceId, testId),
      });
      queryClient.invalidateQueries({
        queryKey: portfolioRecommendationKeys.abTests(),
      });
    },
  });
}

/**
 * Get A/B test results
 */
export function useABTestResults(
  workspaceId: string,
  testId: string,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: portfolioRecommendationKeys.abTestResults(workspaceId, testId),
    queryFn: () =>
      portfolioRecommendationService.getABTestResults(workspaceId, testId),
    enabled: options?.enabled !== false && !!testId,
  });
}

// ---------------------------------------------------------------------------
// Feedback Hooks
// ---------------------------------------------------------------------------

/**
 * Submit feedback
 */
export function useSubmitFeedback(workspaceId: string, recommendationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (feedback: FeedbackRequest) =>
      portfolioRecommendationService.submitFeedback(
        workspaceId,
        recommendationId,
        feedback
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: portfolioRecommendationKeys.detail(workspaceId, recommendationId),
      });
    },
  });
}

/**
 * Record item interaction
 */
export function useRecordItemInteraction(workspaceId: string) {
  return useMutation({
    mutationFn: ({
      itemId,
      interactionType,
      viewDurationMs,
    }: {
      itemId: string;
      interactionType: 'view' | 'select' | 'download' | 'reject';
      viewDurationMs?: number;
    }) =>
      portfolioRecommendationService.recordItemInteraction(
        workspaceId,
        itemId,
        interactionType,
        viewDurationMs
      ),
  });
}

// ---------------------------------------------------------------------------
// Top Assets & Analytics Hooks
// ---------------------------------------------------------------------------

/**
 * Get top assets
 */
export function useTopAssets(
  workspaceId: string,
  options?: {
    limit?: number;
    sceneCategory?: SceneCategory;
    enabled?: boolean;
  }
) {
  return useQuery({
    queryKey: portfolioRecommendationKeys.topAssets(workspaceId, options),
    queryFn: () =>
      portfolioRecommendationService.getTopAssets(workspaceId, options),
    enabled: options?.enabled !== false,
  });
}

// ---------------------------------------------------------------------------
// Embedding Management Hooks
// ---------------------------------------------------------------------------

/**
 * Generate batch embeddings
 */
export function useGenerateBatchEmbeddings(workspaceId: string) {
  return useMutation({
    mutationFn: (request: BatchEmbeddingRequest) =>
      portfolioRecommendationService.generateBatchEmbeddings(workspaceId, request),
  });
}

/**
 * Refresh engagement scores
 */
export function useRefreshEngagementScores(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      portfolioRecommendationService.refreshEngagementScores(workspaceId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: portfolioRecommendationKeys.topAssets(workspaceId),
      });
    },
  });
}
