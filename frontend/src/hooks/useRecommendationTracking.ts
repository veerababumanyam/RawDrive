/**
 * Recommendation Event Tracking Hook
 *
 * Track user interactions with portfolio recommendations for analytics.
 * Integrates with the analytics service to record recommendation events.
 */

import { useCallback, useRef } from 'react';
import { analyticsService, type RecordEventRequest } from '../services/analyticsService';
import type {
  RecommendationType,
  RecommendationStatus,
  SceneCategory,
} from '../services/portfolioRecommendationService';

/* =============================================================================
   Types
   ============================================================================= */

// Event categories for recommendations
export type RecommendationEventCategory =
  | 'recommendation'
  | 'recommendation_item'
  | 'recommendation_ab_test'
  | 'recommendation_feedback';

// Specific event types
export type RecommendationEventType =
  // Recommendation events
  | 'recommendation_generated'
  | 'recommendation_viewed'
  | 'recommendation_accepted'
  | 'recommendation_rejected'
  | 'recommendation_partial_accepted'
  | 'recommendation_expired'
  // Item events
  | 'recommendation_item_viewed'
  | 'recommendation_item_clicked'
  | 'recommendation_item_selected'
  | 'recommendation_item_rejected'
  | 'recommendation_item_downloaded'
  | 'recommendation_item_favorited'
  // A/B test events
  | 'ab_test_created'
  | 'ab_test_started'
  | 'ab_test_paused'
  | 'ab_test_concluded'
  | 'ab_test_variant_assigned'
  | 'ab_test_impression'
  | 'ab_test_click'
  | 'ab_test_conversion'
  // Feedback events
  | 'feedback_positive'
  | 'feedback_negative'
  | 'feedback_detailed';

// Event metadata interface
export interface RecommendationEventMetadata {
  recommendationId?: string;
  recommendationType?: RecommendationType;
  itemId?: string;
  assetId?: string;
  galleryId?: string;
  clientId?: string;
  testId?: string;
  variantId?: string;
  sceneCategory?: SceneCategory;
  score?: number;
  rank?: number;
  totalItems?: number;
  viewDurationMs?: number;
  feedbackRating?: 'positive' | 'negative';
  feedbackComment?: string;
  feedbackSource?: string;
  context?: Record<string, unknown>;
}

export interface UseRecommendationTrackingOptions {
  workspaceId: string;
  sessionId?: string;
  visitorId?: string;
  enableBatching?: boolean;
  batchSize?: number;
  batchIntervalMs?: number;
}

export interface RecommendationTrackingResult {
  // Core tracking methods
  trackEvent: (
    eventType: RecommendationEventType,
    metadata?: RecommendationEventMetadata
  ) => void;

  // Recommendation tracking
  trackRecommendationGenerated: (
    recommendationId: string,
    type: RecommendationType,
    itemCount: number,
    galleryId?: string,
    clientId?: string
  ) => void;
  trackRecommendationViewed: (
    recommendationId: string,
    type: RecommendationType
  ) => void;
  trackRecommendationAccepted: (
    recommendationId: string,
    type: RecommendationType,
    acceptedCount: number,
    totalCount: number
  ) => void;
  trackRecommendationRejected: (
    recommendationId: string,
    type: RecommendationType
  ) => void;

  // Item tracking
  trackItemViewed: (
    recommendationId: string,
    itemId: string,
    assetId: string,
    rank: number,
    viewDurationMs?: number
  ) => void;
  trackItemClicked: (
    recommendationId: string,
    itemId: string,
    assetId: string,
    rank: number
  ) => void;
  trackItemSelected: (
    recommendationId: string,
    itemId: string,
    assetId: string
  ) => void;
  trackItemRejected: (
    recommendationId: string,
    itemId: string,
    assetId: string
  ) => void;
  trackItemDownloaded: (
    recommendationId: string,
    itemId: string,
    assetId: string
  ) => void;

  // A/B test tracking
  trackABTestCreated: (testId: string, variantCount: number) => void;
  trackABTestStarted: (testId: string) => void;
  trackABTestConcluded: (testId: string, winnerVariantId?: string) => void;
  trackABTestImpression: (testId: string, variantId: string) => void;
  trackABTestClick: (testId: string, variantId: string) => void;
  trackABTestConversion: (testId: string, variantId: string) => void;

  // Feedback tracking
  trackFeedback: (
    recommendationId: string,
    rating: 'positive' | 'negative',
    source?: string,
    comment?: string
  ) => void;

  // Batch operations
  flushEvents: () => Promise<void>;
}

/* =============================================================================
   Hook Implementation
   ============================================================================= */

export function useRecommendationTracking(
  options: UseRecommendationTrackingOptions
): RecommendationTrackingResult {
  const {
    workspaceId,
    sessionId,
    visitorId,
    enableBatching = false,
    batchSize = 10,
    batchIntervalMs = 5000,
  } = options;

  // Event queue for batching
  const eventQueue = useRef<RecordEventRequest[]>([]);
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Build base event request
  const buildEventRequest = useCallback(
    (
      eventType: RecommendationEventType,
      eventCategory: RecommendationEventCategory,
      metadata?: RecommendationEventMetadata
    ): RecordEventRequest => ({
      eventType,
      eventCategory,
      galleryId: metadata?.galleryId,
      assetId: metadata?.assetId,
      clientId: metadata?.clientId,
      actorType: 'user',
      visitorId,
      sessionId,
      numericValue: metadata?.score,
      durationMs: metadata?.viewDurationMs,
      metadata: {
        recommendationId: metadata?.recommendationId,
        recommendationType: metadata?.recommendationType,
        itemId: metadata?.itemId,
        testId: metadata?.testId,
        variantId: metadata?.variantId,
        sceneCategory: metadata?.sceneCategory,
        rank: metadata?.rank,
        totalItems: metadata?.totalItems,
        feedbackRating: metadata?.feedbackRating,
        feedbackComment: metadata?.feedbackComment,
        feedbackSource: metadata?.feedbackSource,
        ...metadata?.context,
      },
    }),
    [sessionId, visitorId]
  );

  // Flush queued events
  const flushEvents = useCallback(async (): Promise<void> => {
    if (eventQueue.current.length === 0) return;

    const eventsToSend = [...eventQueue.current];
    eventQueue.current = [];

    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current);
      batchTimerRef.current = null;
    }

    try {
      await analyticsService.recordEventsBatch(workspaceId, eventsToSend);
    } catch (error) {
      // Re-queue failed events
      eventQueue.current = [...eventsToSend, ...eventQueue.current];
      console.error('Failed to flush recommendation events:', error);
    }
  }, [workspaceId]);

  // Send or queue an event
  const sendEvent = useCallback(
    async (event: RecordEventRequest): Promise<void> => {
      if (enableBatching) {
        eventQueue.current.push(event);

        if (eventQueue.current.length >= batchSize) {
          await flushEvents();
        } else if (!batchTimerRef.current) {
          batchTimerRef.current = setTimeout(() => {
            flushEvents();
          }, batchIntervalMs);
        }
      } else {
        try {
          await analyticsService.recordEvent(workspaceId, event);
        } catch (error) {
          console.error('Failed to record recommendation event:', error);
        }
      }
    },
    [workspaceId, enableBatching, batchSize, batchIntervalMs, flushEvents]
  );

  // Core tracking method
  const trackEvent = useCallback(
    (
      eventType: RecommendationEventType,
      metadata?: RecommendationEventMetadata
    ): void => {
      const category = getEventCategory(eventType);
      const event = buildEventRequest(eventType, category, metadata);
      sendEvent(event);
    },
    [buildEventRequest, sendEvent]
  );

  // Recommendation tracking methods
  const trackRecommendationGenerated = useCallback(
    (
      recommendationId: string,
      type: RecommendationType,
      itemCount: number,
      galleryId?: string,
      clientId?: string
    ): void => {
      trackEvent('recommendation_generated', {
        recommendationId,
        recommendationType: type,
        totalItems: itemCount,
        galleryId,
        clientId,
      });
    },
    [trackEvent]
  );

  const trackRecommendationViewed = useCallback(
    (recommendationId: string, type: RecommendationType): void => {
      trackEvent('recommendation_viewed', {
        recommendationId,
        recommendationType: type,
      });
    },
    [trackEvent]
  );

  const trackRecommendationAccepted = useCallback(
    (
      recommendationId: string,
      type: RecommendationType,
      acceptedCount: number,
      totalCount: number
    ): void => {
      trackEvent('recommendation_accepted', {
        recommendationId,
        recommendationType: type,
        totalItems: totalCount,
        context: { acceptedCount },
      });
    },
    [trackEvent]
  );

  const trackRecommendationRejected = useCallback(
    (recommendationId: string, type: RecommendationType): void => {
      trackEvent('recommendation_rejected', {
        recommendationId,
        recommendationType: type,
      });
    },
    [trackEvent]
  );

  // Item tracking methods
  const trackItemViewed = useCallback(
    (
      recommendationId: string,
      itemId: string,
      assetId: string,
      rank: number,
      viewDurationMs?: number
    ): void => {
      trackEvent('recommendation_item_viewed', {
        recommendationId,
        itemId,
        assetId,
        rank,
        viewDurationMs,
      });
    },
    [trackEvent]
  );

  const trackItemClicked = useCallback(
    (
      recommendationId: string,
      itemId: string,
      assetId: string,
      rank: number
    ): void => {
      trackEvent('recommendation_item_clicked', {
        recommendationId,
        itemId,
        assetId,
        rank,
      });
    },
    [trackEvent]
  );

  const trackItemSelected = useCallback(
    (recommendationId: string, itemId: string, assetId: string): void => {
      trackEvent('recommendation_item_selected', {
        recommendationId,
        itemId,
        assetId,
      });
    },
    [trackEvent]
  );

  const trackItemRejected = useCallback(
    (recommendationId: string, itemId: string, assetId: string): void => {
      trackEvent('recommendation_item_rejected', {
        recommendationId,
        itemId,
        assetId,
      });
    },
    [trackEvent]
  );

  const trackItemDownloaded = useCallback(
    (recommendationId: string, itemId: string, assetId: string): void => {
      trackEvent('recommendation_item_downloaded', {
        recommendationId,
        itemId,
        assetId,
      });
    },
    [trackEvent]
  );

  // A/B test tracking methods
  const trackABTestCreated = useCallback(
    (testId: string, variantCount: number): void => {
      trackEvent('ab_test_created', {
        testId,
        context: { variantCount },
      });
    },
    [trackEvent]
  );

  const trackABTestStarted = useCallback(
    (testId: string): void => {
      trackEvent('ab_test_started', { testId });
    },
    [trackEvent]
  );

  const trackABTestConcluded = useCallback(
    (testId: string, winnerVariantId?: string): void => {
      trackEvent('ab_test_concluded', {
        testId,
        variantId: winnerVariantId,
      });
    },
    [trackEvent]
  );

  const trackABTestImpression = useCallback(
    (testId: string, variantId: string): void => {
      trackEvent('ab_test_impression', { testId, variantId });
    },
    [trackEvent]
  );

  const trackABTestClick = useCallback(
    (testId: string, variantId: string): void => {
      trackEvent('ab_test_click', { testId, variantId });
    },
    [trackEvent]
  );

  const trackABTestConversion = useCallback(
    (testId: string, variantId: string): void => {
      trackEvent('ab_test_conversion', { testId, variantId });
    },
    [trackEvent]
  );

  // Feedback tracking
  const trackFeedback = useCallback(
    (
      recommendationId: string,
      rating: 'positive' | 'negative',
      source?: string,
      comment?: string
    ): void => {
      const eventType = rating === 'positive' ? 'feedback_positive' : 'feedback_negative';
      trackEvent(eventType, {
        recommendationId,
        feedbackRating: rating,
        feedbackSource: source,
        feedbackComment: comment,
      });
    },
    [trackEvent]
  );

  return {
    trackEvent,
    trackRecommendationGenerated,
    trackRecommendationViewed,
    trackRecommendationAccepted,
    trackRecommendationRejected,
    trackItemViewed,
    trackItemClicked,
    trackItemSelected,
    trackItemRejected,
    trackItemDownloaded,
    trackABTestCreated,
    trackABTestStarted,
    trackABTestConcluded,
    trackABTestImpression,
    trackABTestClick,
    trackABTestConversion,
    trackFeedback,
    flushEvents,
  };
}

/* =============================================================================
   Helper Functions
   ============================================================================= */

function getEventCategory(eventType: RecommendationEventType): RecommendationEventCategory {
  if (eventType.startsWith('recommendation_item_')) {
    return 'recommendation_item';
  }
  if (eventType.startsWith('ab_test_')) {
    return 'recommendation_ab_test';
  }
  if (eventType.startsWith('feedback_')) {
    return 'recommendation_feedback';
  }
  return 'recommendation';
}

export default useRecommendationTracking;
