import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getVariant,
  trackImpression,
  trackConversion,
  trackInteraction,
  type Variant,
  type Experiment,
  EXPERIMENTS,
} from '../services/abTestingService';

/* =============================================================================
   useABTest Hook

   Provides access to A/B test variants with automatic impression tracking.
   Use this hook in components that need to render different variants.
   ============================================================================= */

interface UseABTestOptions {
  /** Track impression automatically on mount (default: true) */
  trackOnMount?: boolean;
  /** Additional metadata to include with events */
  metadata?: Record<string, unknown>;
}

interface UseABTestReturn {
  /** The assigned variant, or null if experiment not active */
  variant: Variant | null;
  /** The full experiment definition */
  experiment: Experiment | undefined;
  /** Whether a variant has been assigned */
  isAssigned: boolean;
  /** Check if current variant matches a specific variant ID */
  isVariant: (variantId: string) => boolean;
  /** Track a conversion event */
  trackConversion: (additionalMetadata?: Record<string, unknown>) => void;
  /** Track an interaction event */
  trackInteraction: (additionalMetadata?: Record<string, unknown>) => void;
}

export const useABTest = (
  experimentId: string,
  options: UseABTestOptions = {}
): UseABTestReturn => {
  const { trackOnMount = true, metadata } = options;

  const [variant, setVariant] = useState<Variant | null>(null);
  const [hasTrackedImpression, setHasTrackedImpression] = useState(false);

  const experiment = useMemo(
    () => EXPERIMENTS.find((e) => e.id === experimentId),
    [experimentId]
  );

  // Get or assign variant on mount
  useEffect(() => {
    const assignedVariant = getVariant(experimentId);
    setVariant(assignedVariant);
  }, [experimentId]);

  // Track impression on mount if enabled
  useEffect(() => {
    if (trackOnMount && variant && !hasTrackedImpression) {
      trackImpression(experimentId, {
        ...metadata,
        location: typeof window !== 'undefined' ? window.location.pathname : '',
      });
      setHasTrackedImpression(true);
    }
  }, [trackOnMount, variant, hasTrackedImpression, experimentId, metadata]);

  const isVariant = useCallback(
    (variantId: string): boolean => {
      return variant?.id === variantId;
    },
    [variant]
  );

  const handleTrackConversion = useCallback(
    (additionalMetadata?: Record<string, unknown>) => {
      trackConversion(experimentId, { ...metadata, ...additionalMetadata });
    },
    [experimentId, metadata]
  );

  const handleTrackInteraction = useCallback(
    (additionalMetadata?: Record<string, unknown>) => {
      trackInteraction(experimentId, { ...metadata, ...additionalMetadata });
    },
    [experimentId, metadata]
  );

  return {
    variant,
    experiment,
    isAssigned: variant !== null,
    isVariant,
    trackConversion: handleTrackConversion,
    trackInteraction: handleTrackInteraction,
  };
};

/* =============================================================================
   useABTestValue Hook

   Simplified hook that just returns the appropriate value based on variant.
   Use when you just need to switch between values without tracking logic.
   ============================================================================= */

export function useABTestValue<T>(
  experimentId: string,
  variantValues: Record<string, T>,
  defaultValue: T
): T {
  const { variant } = useABTest(experimentId, { trackOnMount: false });

  if (!variant) {
    return defaultValue;
  }

  return variantValues[variant.id] ?? defaultValue;
}

/* =============================================================================
   useAllABTests Hook

   Returns all active experiment assignments for debugging or analytics.
   ============================================================================= */

interface ExperimentAssignment {
  experimentId: string;
  experimentName: string;
  variantId: string;
  variantName: string;
}

export function useAllABTests(): ExperimentAssignment[] {
  const [assignments, setAssignments] = useState<ExperimentAssignment[]>([]);

  useEffect(() => {
    const activeAssignments = EXPERIMENTS.filter((e) => e.active).map(
      (experiment) => {
        const variant = getVariant(experiment.id);
        return variant
          ? {
              experimentId: experiment.id,
              experimentName: experiment.name,
              variantId: variant.id,
              variantName: variant.name,
            }
          : null;
      }
    ).filter(Boolean) as ExperimentAssignment[];

    setAssignments(activeAssignments);
  }, []);

  return assignments;
}

export default useABTest;
