/**
 * Portfolio Recommendations Components
 *
 * AI-powered portfolio recommendation UI components.
 */

export { PortfolioRecommendationDashboard } from './PortfolioRecommendationDashboard';
export { RecommendationCard } from './RecommendationCard';
export { RecommendationGenerator } from './RecommendationGenerator';
export { ABTestPanel } from './ABTestPanel';

// Re-export hooks for convenience
export {
  useGenerateRecommendations,
  useFindSimilarAssets,
  usePersonalizedRecommendations,
  useHeroShots,
  useSeasonalRecommendations,
  useRecommendation,
  useRecommendations,
  useClientPreferences,
  useUpdateClientPreferences,
  useLearnClientPreferences,
  useCreateABTest,
  useABTests,
  useABTest,
  useStartABTest,
  useConcludeABTest,
  useABTestResults,
  useSubmitFeedback,
  useRecordItemInteraction,
  useTopAssets,
  useGenerateBatchEmbeddings,
  useRefreshEngagementScores,
  portfolioRecommendationKeys,
} from '../../../hooks/usePortfolioRecommendations';

// Re-export tracking hook
export {
  useRecommendationTracking,
  type RecommendationEventCategory,
  type RecommendationEventType,
  type RecommendationEventMetadata,
  type UseRecommendationTrackingOptions,
  type RecommendationTrackingResult,
} from '../../../hooks/useRecommendationTracking';

// Re-export types for convenience
export type {
  Recommendation,
  RecommendationItem,
  RecommendationType,
  RecommendationStatus,
  TopAsset,
  ABTest,
  ABTestVariant,
  ABTestStatus,
  ABTestResults,
  ClientPreference,
  SceneCategory,
  Season,
  GenerateRecommendationsRequest,
  SimilarAssetRequest,
  HeroShotsRequest,
  SeasonalRequest,
  CreateABTestRequest,
  FeedbackRequest,
} from '../../../services/portfolioRecommendationService';
