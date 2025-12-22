/**
 * A/B Testing Service
 *
 * Provides variant assignment, persistence, and tracking for landing page experiments.
 * Uses sessionStorage for consistency across page reloads within a session.
 * Integrates with analytics when available.
 */

// Storage key for A/B test assignments
const AB_TEST_STORAGE_KEY = 'rawdrive_ab_tests';

/**
 * Experiment definition with variants and optional weights
 */
export interface Experiment {
  /** Unique experiment identifier */
  id: string;
  /** Human-readable experiment name */
  name: string;
  /** Variant options with optional weights (default equal distribution) */
  variants: Variant[];
  /** Whether the experiment is currently active */
  active: boolean;
  /** Optional description for documentation */
  description?: string;
}

/**
 * Individual variant within an experiment
 */
export interface Variant {
  /** Unique variant identifier */
  id: string;
  /** Human-readable variant name */
  name: string;
  /** Weight for random assignment (default 1) */
  weight?: number;
}

/**
 * User's assigned variants stored in session
 */
export interface AssignedVariants {
  [experimentId: string]: {
    variantId: string;
    assignedAt: number;
  };
}

/**
 * A/B test event for analytics
 */
export interface ABTestEvent {
  experimentId: string;
  experimentName: string;
  variantId: string;
  variantName: string;
  eventType: 'impression' | 'conversion' | 'interaction';
  metadata?: Record<string, unknown>;
  timestamp: number;
}

/**
 * Active experiments configuration
 * Add new experiments here
 */
export const EXPERIMENTS: Experiment[] = [
  {
    id: 'hero_cta_text',
    name: 'Hero CTA Text',
    description: 'Test different primary CTA button text in hero section',
    active: true,
    variants: [
      { id: 'control', name: 'Start Free Trial', weight: 1 },
      { id: 'variant_a', name: 'Try RawDrive Free', weight: 1 },
      { id: 'variant_b', name: 'Get Started Free', weight: 1 },
    ],
  },
  {
    id: 'pricing_display',
    name: 'Pricing Display Order',
    description: 'Test pricing tier highlighting strategy',
    active: true,
    variants: [
      { id: 'control', name: 'Highlight Professional', weight: 1 },
      { id: 'variant_a', name: 'Highlight Business', weight: 1 },
    ],
  },
  {
    id: 'social_proof_position',
    name: 'Social Proof Position',
    description: 'Test social proof section placement',
    active: false, // Currently inactive
    variants: [
      { id: 'control', name: 'After Hero', weight: 1 },
      { id: 'variant_a', name: 'After Workflow', weight: 1 },
    ],
  },
];

/**
 * Get stored variant assignments from sessionStorage
 */
export function getStoredAssignments(): AssignedVariants {
  if (typeof window === 'undefined') return {};

  try {
    const stored = sessionStorage.getItem(AB_TEST_STORAGE_KEY);
    if (!stored) return {};
    return JSON.parse(stored);
  } catch {
    return {};
  }
}

/**
 * Save variant assignments to sessionStorage
 */
export function setStoredAssignments(assignments: AssignedVariants): void {
  if (typeof window === 'undefined') return;

  try {
    sessionStorage.setItem(AB_TEST_STORAGE_KEY, JSON.stringify(assignments));
  } catch (error) {
    console.warn('Failed to store A/B test assignments:', error);
  }
}

/**
 * Select a random variant based on weights
 */
export function selectWeightedVariant(variants: Variant[]): Variant {
  const totalWeight = variants.reduce((sum, v) => sum + (v.weight ?? 1), 0);
  let random = Math.random() * totalWeight;

  for (const variant of variants) {
    random -= variant.weight ?? 1;
    if (random <= 0) {
      return variant;
    }
  }

  // Fallback to first variant (shouldn't happen)
  return variants[0];
}

/**
 * Get or assign a variant for an experiment
 * Returns the assigned variant, ensuring consistency across page reloads
 */
export function getVariant(experimentId: string): Variant | null {
  const experiment = EXPERIMENTS.find((e) => e.id === experimentId);
  if (!experiment || !experiment.active) {
    return null;
  }

  const assignments = getStoredAssignments();

  // Check for existing assignment
  if (assignments[experimentId]) {
    const assignedVariantId = assignments[experimentId].variantId;
    const variant = experiment.variants.find((v) => v.id === assignedVariantId);
    if (variant) {
      return variant;
    }
  }

  // Assign new variant
  const selectedVariant = selectWeightedVariant(experiment.variants);

  // Store assignment
  const newAssignments: AssignedVariants = {
    ...assignments,
    [experimentId]: {
      variantId: selectedVariant.id,
      assignedAt: Date.now(),
    },
  };
  setStoredAssignments(newAssignments);

  return selectedVariant;
}

/**
 * Get all active experiment assignments for the current user
 */
export function getAllAssignments(): Array<{
  experiment: Experiment;
  variant: Variant;
}> {
  return EXPERIMENTS.filter((e) => e.active)
    .map((experiment) => {
      const variant = getVariant(experiment.id);
      return variant ? { experiment, variant } : null;
    })
    .filter(Boolean) as Array<{ experiment: Experiment; variant: Variant }>;
}

/**
 * Track an A/B test event
 * Integrates with analytics service when available
 */
export function trackABTestEvent(
  experimentId: string,
  eventType: ABTestEvent['eventType'],
  metadata?: Record<string, unknown>
): void {
  const experiment = EXPERIMENTS.find((e) => e.id === experimentId);
  if (!experiment) return;

  const variant = getVariant(experimentId);
  if (!variant) return;

  const event: ABTestEvent = {
    experimentId,
    experimentName: experiment.name,
    variantId: variant.id,
    variantName: variant.name,
    eventType,
    metadata,
    timestamp: Date.now(),
  };

  // Log in development
  if (import.meta.env.DEV) {
    console.log('[A/B Test Event]', event);
  }

  // Send to analytics when available
  // Analytics integration will be added in Task 19
  if (typeof window !== 'undefined' && (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag) {
    const gtag = (window as unknown as { gtag: (...args: unknown[]) => void }).gtag;
    gtag('event', `ab_test_${eventType}`, {
      experiment_id: experimentId,
      experiment_name: experiment.name,
      variant_id: variant.id,
      variant_name: variant.name,
      ...metadata,
    });
  }
}

/**
 * Track impression (when user sees a variant)
 */
export function trackImpression(
  experimentId: string,
  metadata?: Record<string, unknown>
): void {
  trackABTestEvent(experimentId, 'impression', metadata);
}

/**
 * Track conversion (when user completes desired action)
 */
export function trackConversion(
  experimentId: string,
  metadata?: Record<string, unknown>
): void {
  trackABTestEvent(experimentId, 'conversion', metadata);
}

/**
 * Track interaction (when user engages with variant)
 */
export function trackInteraction(
  experimentId: string,
  metadata?: Record<string, unknown>
): void {
  trackABTestEvent(experimentId, 'interaction', metadata);
}

/**
 * Clear all A/B test assignments (useful for testing)
 */
export function clearAssignments(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(AB_TEST_STORAGE_KEY);
}

/**
 * Force a specific variant for testing purposes
 * Only works in development mode
 */
export function forceVariant(experimentId: string, variantId: string): boolean {
  if (!import.meta.env.DEV) {
    console.warn('forceVariant is only available in development mode');
    return false;
  }

  const experiment = EXPERIMENTS.find((e) => e.id === experimentId);
  if (!experiment) {
    console.warn(`Experiment "${experimentId}" not found`);
    return false;
  }

  const variant = experiment.variants.find((v) => v.id === variantId);
  if (!variant) {
    console.warn(
      `Variant "${variantId}" not found in experiment "${experimentId}"`
    );
    return false;
  }

  const assignments = getStoredAssignments();
  const newAssignments: AssignedVariants = {
    ...assignments,
    [experimentId]: {
      variantId,
      assignedAt: Date.now(),
    },
  };
  setStoredAssignments(newAssignments);

  return true;
}

// Export utilities for testing
export const abTestingUtils = {
  getStoredAssignments,
  setStoredAssignments,
  selectWeightedVariant,
  clearAssignments,
  forceVariant,
  EXPERIMENTS,
  AB_TEST_STORAGE_KEY,
};
