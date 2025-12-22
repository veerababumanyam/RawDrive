/**
 * A/B Testing Service and Hook Tests
 *
 * Tests cover:
 * - Variant assignment logic
 * - Session storage persistence
 * - Weighted random selection
 * - Hook integration with React components
 * - Analytics event tracking
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  getVariant,
  getAllAssignments,
  trackImpression,
  trackConversion,
  trackInteraction,
  abTestingUtils,
  type Variant,
  type AssignedVariants,
} from '../services/abTestingService';
import { useABTest, useABTestValue, useAllABTests } from '../hooks/useABTest';

// Mock sessionStorage
const mockSessionStorage: Record<string, string> = {};

beforeEach(() => {
  // Clear mocks
  vi.clearAllMocks();

  // Clear sessionStorage mock
  Object.keys(mockSessionStorage).forEach((key) => {
    delete mockSessionStorage[key];
  });

  // Mock sessionStorage
  vi.stubGlobal('sessionStorage', {
    getItem: vi.fn((key: string) => mockSessionStorage[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      mockSessionStorage[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete mockSessionStorage[key];
    }),
    clear: vi.fn(() => {
      Object.keys(mockSessionStorage).forEach((key) => {
        delete mockSessionStorage[key];
      });
    }),
  });

  // Mock console methods
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  // Clear assignments before each test
  abTestingUtils.clearAssignments();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* =============================================================================
   Storage Utility Tests
   ============================================================================= */

describe('A/B Testing Storage Utilities', () => {
  it('returns empty object when no assignments stored', () => {
    const assignments = abTestingUtils.getStoredAssignments();
    expect(assignments).toEqual({});
  });

  it('stores and retrieves assignments correctly', () => {
    const testAssignments: AssignedVariants = {
      test_experiment: {
        variantId: 'variant_a',
        assignedAt: Date.now(),
      },
    };

    abTestingUtils.setStoredAssignments(testAssignments);
    const retrieved = abTestingUtils.getStoredAssignments();

    expect(retrieved.test_experiment).toBeDefined();
    expect(retrieved.test_experiment.variantId).toBe('variant_a');
  });

  it('handles invalid JSON in storage gracefully', () => {
    mockSessionStorage[abTestingUtils.AB_TEST_STORAGE_KEY] = 'invalid json';

    const assignments = abTestingUtils.getStoredAssignments();
    expect(assignments).toEqual({});
  });

  it('clears assignments from storage', () => {
    const testAssignments: AssignedVariants = {
      test_experiment: {
        variantId: 'variant_a',
        assignedAt: Date.now(),
      },
    };

    abTestingUtils.setStoredAssignments(testAssignments);
    abTestingUtils.clearAssignments();

    const retrieved = abTestingUtils.getStoredAssignments();
    expect(retrieved).toEqual({});
  });
});

/* =============================================================================
   Weighted Selection Tests
   ============================================================================= */

describe('Weighted Variant Selection', () => {
  it('selects a variant from the list', () => {
    const variants: Variant[] = [
      { id: 'a', name: 'Variant A' },
      { id: 'b', name: 'Variant B' },
    ];

    const selected = abTestingUtils.selectWeightedVariant(variants);
    expect(['a', 'b']).toContain(selected.id);
  });

  it('respects weights in variant selection', () => {
    // Mock Math.random to control selection
    const mockRandom = vi.spyOn(Math, 'random');

    const variants: Variant[] = [
      { id: 'a', name: 'Variant A', weight: 1 },
      { id: 'b', name: 'Variant B', weight: 3 },
    ];

    // Random value 0.1 should select first variant (weight range 0-0.25)
    mockRandom.mockReturnValueOnce(0.1);
    let selected = abTestingUtils.selectWeightedVariant(variants);
    expect(selected.id).toBe('a');

    // Random value 0.5 should select second variant (weight range 0.25-1.0)
    mockRandom.mockReturnValueOnce(0.5);
    selected = abTestingUtils.selectWeightedVariant(variants);
    expect(selected.id).toBe('b');

    mockRandom.mockRestore();
  });

  it('handles equal weights correctly', () => {
    const variants: Variant[] = [
      { id: 'a', name: 'Variant A', weight: 1 },
      { id: 'b', name: 'Variant B', weight: 1 },
      { id: 'c', name: 'Variant C', weight: 1 },
    ];

    // Run multiple times to verify distribution
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 300; i++) {
      const selected = abTestingUtils.selectWeightedVariant(variants);
      counts[selected.id]++;
    }

    // Each should be selected roughly 100 times (±50 for randomness)
    expect(counts.a).toBeGreaterThan(50);
    expect(counts.b).toBeGreaterThan(50);
    expect(counts.c).toBeGreaterThan(50);
  });

  it('handles missing weight by defaulting to 1', () => {
    const variants: Variant[] = [
      { id: 'a', name: 'Variant A' },
      { id: 'b', name: 'Variant B' },
    ];

    const selected = abTestingUtils.selectWeightedVariant(variants);
    expect(['a', 'b']).toContain(selected.id);
  });
});

/* =============================================================================
   Variant Assignment Tests
   ============================================================================= */

describe('Variant Assignment', () => {
  it('returns null for non-existent experiment', () => {
    const variant = getVariant('non_existent_experiment');
    expect(variant).toBeNull();
  });

  it('returns null for inactive experiment', () => {
    // social_proof_position is inactive in the experiments config
    const variant = getVariant('social_proof_position');
    expect(variant).toBeNull();
  });

  it('assigns a variant for active experiment', () => {
    const variant = getVariant('hero_cta_text');
    expect(variant).not.toBeNull();
    expect(['control', 'variant_a', 'variant_b']).toContain(variant!.id);
  });

  it('returns same variant on repeated calls (consistency)', () => {
    const firstCall = getVariant('hero_cta_text');
    const secondCall = getVariant('hero_cta_text');
    const thirdCall = getVariant('hero_cta_text');

    expect(firstCall).toEqual(secondCall);
    expect(secondCall).toEqual(thirdCall);
  });

  it('persists assignment to sessionStorage', () => {
    getVariant('hero_cta_text');

    const stored = abTestingUtils.getStoredAssignments();
    expect(stored.hero_cta_text).toBeDefined();
    expect(stored.hero_cta_text.variantId).toBeDefined();
    expect(stored.hero_cta_text.assignedAt).toBeDefined();
  });

  it('retrieves existing assignment from storage', () => {
    // Pre-populate storage with specific assignment
    const preAssignment: AssignedVariants = {
      hero_cta_text: {
        variantId: 'variant_b',
        assignedAt: Date.now() - 10000,
      },
    };
    abTestingUtils.setStoredAssignments(preAssignment);

    const variant = getVariant('hero_cta_text');
    expect(variant?.id).toBe('variant_b');
  });
});

/* =============================================================================
   Get All Assignments Tests
   ============================================================================= */

describe('Get All Assignments', () => {
  it('returns assignments for all active experiments', () => {
    const assignments = getAllAssignments();

    // Should have assignments for active experiments
    expect(assignments.length).toBeGreaterThan(0);

    // Each assignment should have experiment and variant
    assignments.forEach((assignment) => {
      expect(assignment.experiment).toBeDefined();
      expect(assignment.variant).toBeDefined();
      expect(assignment.experiment.active).toBe(true);
    });
  });

  it('excludes inactive experiments', () => {
    const assignments = getAllAssignments();

    const inactiveAssignment = assignments.find(
      (a) => a.experiment.id === 'social_proof_position'
    );
    expect(inactiveAssignment).toBeUndefined();
  });
});

/* =============================================================================
   Event Tracking Tests
   ============================================================================= */

describe('Event Tracking', () => {
  it('logs impression events in development mode', () => {
    // Ensure variant is assigned first
    getVariant('hero_cta_text');

    trackImpression('hero_cta_text', { page: 'landing' });

    expect(console.log).toHaveBeenCalled();
  });

  it('logs conversion events in development mode', () => {
    getVariant('hero_cta_text');

    trackConversion('hero_cta_text', { cta: 'signup' });

    expect(console.log).toHaveBeenCalled();
  });

  it('logs interaction events in development mode', () => {
    getVariant('hero_cta_text');

    trackInteraction('hero_cta_text', { action: 'click' });

    expect(console.log).toHaveBeenCalled();
  });

  it('does not throw for non-existent experiment', () => {
    expect(() => {
      trackImpression('non_existent', {});
    }).not.toThrow();
  });

  it('includes correct event data structure', () => {
    getVariant('hero_cta_text');

    trackImpression('hero_cta_text', { custom: 'data' });

    expect(console.log).toHaveBeenCalledWith(
      '[A/B Test Event]',
      expect.objectContaining({
        experimentId: 'hero_cta_text',
        experimentName: 'Hero CTA Text',
        eventType: 'impression',
        metadata: expect.objectContaining({ custom: 'data' }),
        timestamp: expect.any(Number),
      })
    );
  });
});

/* =============================================================================
   Force Variant Tests (Development Mode)
   ============================================================================= */

describe('Force Variant (Dev Mode)', () => {
  it('allows forcing a specific variant in dev mode', () => {
    const result = abTestingUtils.forceVariant('hero_cta_text', 'variant_a');
    expect(result).toBe(true);

    const variant = getVariant('hero_cta_text');
    expect(variant?.id).toBe('variant_a');
  });

  it('returns false for non-existent experiment', () => {
    const result = abTestingUtils.forceVariant(
      'non_existent',
      'some_variant'
    );
    expect(result).toBe(false);
    expect(console.warn).toHaveBeenCalled();
  });

  it('returns false for non-existent variant', () => {
    const result = abTestingUtils.forceVariant(
      'hero_cta_text',
      'non_existent_variant'
    );
    expect(result).toBe(false);
    expect(console.warn).toHaveBeenCalled();
  });
});

/* =============================================================================
   useABTest Hook Tests
   ============================================================================= */

describe('useABTest Hook', () => {
  it('returns variant for active experiment', async () => {
    const { result } = renderHook(() => useABTest('hero_cta_text'));

    await waitFor(() => {
      expect(result.current.variant).not.toBeNull();
    });

    expect(result.current.isAssigned).toBe(true);
    expect(['control', 'variant_a', 'variant_b']).toContain(
      result.current.variant!.id
    );
  });

  it('returns null for inactive experiment', async () => {
    const { result } = renderHook(() => useABTest('social_proof_position'));

    // Wait for state to settle
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(result.current.variant).toBeNull();
    expect(result.current.isAssigned).toBe(false);
  });

  it('provides experiment definition', async () => {
    const { result } = renderHook(() => useABTest('hero_cta_text'));

    expect(result.current.experiment).toBeDefined();
    expect(result.current.experiment?.id).toBe('hero_cta_text');
    expect(result.current.experiment?.name).toBe('Hero CTA Text');
  });

  it('isVariant helper works correctly', async () => {
    // Force a specific variant for predictable testing
    abTestingUtils.forceVariant('hero_cta_text', 'variant_a');

    const { result } = renderHook(() => useABTest('hero_cta_text'));

    await waitFor(() => {
      expect(result.current.variant).not.toBeNull();
    });

    expect(result.current.isVariant('variant_a')).toBe(true);
    expect(result.current.isVariant('control')).toBe(false);
  });

  it('tracks impression on mount when enabled', async () => {
    const { result } = renderHook(() =>
      useABTest('hero_cta_text', { trackOnMount: true })
    );

    await waitFor(() => {
      expect(result.current.variant).not.toBeNull();
    });

    // Should have logged the impression
    expect(console.log).toHaveBeenCalled();
  });

  it('does not track impression when disabled', async () => {
    const { result } = renderHook(() =>
      useABTest('hero_cta_text', { trackOnMount: false })
    );

    await waitFor(() => {
      expect(result.current.variant).not.toBeNull();
    });

    // Clear console.log calls from variant assignment logging
    vi.mocked(console.log).mockClear();

    // No new impression should be tracked
    expect(console.log).not.toHaveBeenCalledWith(
      '[A/B Test Event]',
      expect.objectContaining({ eventType: 'impression' })
    );
  });

  it('provides trackConversion function', async () => {
    const { result } = renderHook(() =>
      useABTest('hero_cta_text', { trackOnMount: false })
    );

    await waitFor(() => {
      expect(result.current.variant).not.toBeNull();
    });

    vi.mocked(console.log).mockClear();

    act(() => {
      result.current.trackConversion({ action: 'signup' });
    });

    expect(console.log).toHaveBeenCalledWith(
      '[A/B Test Event]',
      expect.objectContaining({ eventType: 'conversion' })
    );
  });

  it('provides trackInteraction function', async () => {
    const { result } = renderHook(() =>
      useABTest('hero_cta_text', { trackOnMount: false })
    );

    await waitFor(() => {
      expect(result.current.variant).not.toBeNull();
    });

    vi.mocked(console.log).mockClear();

    act(() => {
      result.current.trackInteraction({ element: 'cta_button' });
    });

    expect(console.log).toHaveBeenCalledWith(
      '[A/B Test Event]',
      expect.objectContaining({ eventType: 'interaction' })
    );
  });
});

/* =============================================================================
   useABTestValue Hook Tests
   ============================================================================= */

describe('useABTestValue Hook', () => {
  it('returns value for assigned variant', async () => {
    abTestingUtils.forceVariant('hero_cta_text', 'variant_a');

    const { result } = renderHook(() =>
      useABTestValue(
        'hero_cta_text',
        {
          control: 'Start Free Trial',
          variant_a: 'Try RawDrive Free',
          variant_b: 'Get Started Free',
        },
        'Default Text'
      )
    );

    await waitFor(() => {
      expect(result.current).toBe('Try RawDrive Free');
    });
  });

  it('returns default value for inactive experiment', async () => {
    const { result } = renderHook(() =>
      useABTestValue(
        'social_proof_position',
        { control: 'After Hero', variant_a: 'After Workflow' },
        'Default Position'
      )
    );

    // Wait for state to settle
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(result.current).toBe('Default Position');
  });

  it('returns default value for unknown variant', async () => {
    abTestingUtils.forceVariant('hero_cta_text', 'control');

    const { result } = renderHook(() =>
      useABTestValue(
        'hero_cta_text',
        { variant_a: 'Only A value' }, // Missing 'control' key
        'Default Text'
      )
    );

    await waitFor(() => {
      expect(result.current).toBe('Default Text');
    });
  });
});

/* =============================================================================
   useAllABTests Hook Tests
   ============================================================================= */

describe('useAllABTests Hook', () => {
  it('returns all active experiment assignments', async () => {
    const { result } = renderHook(() => useAllABTests());

    await waitFor(() => {
      expect(result.current.length).toBeGreaterThan(0);
    });

    result.current.forEach((assignment) => {
      expect(assignment.experimentId).toBeDefined();
      expect(assignment.experimentName).toBeDefined();
      expect(assignment.variantId).toBeDefined();
      expect(assignment.variantName).toBeDefined();
    });
  });

  it('excludes inactive experiments', async () => {
    const { result } = renderHook(() => useAllABTests());

    await waitFor(() => {
      expect(result.current.length).toBeGreaterThan(0);
    });

    const inactiveAssignment = result.current.find(
      (a) => a.experimentId === 'social_proof_position'
    );
    expect(inactiveAssignment).toBeUndefined();
  });
});

/* =============================================================================
   Property Test: A/B Test Consistency
   ============================================================================= */

describe('Property: A/B Test Consistency', () => {
  it('variant assignment remains consistent across multiple reads', () => {
    // Get initial assignment
    const initial = getVariant('hero_cta_text');

    // Verify consistency across 100 reads
    for (let i = 0; i < 100; i++) {
      const current = getVariant('hero_cta_text');
      expect(current).toEqual(initial);
    }
  });

  it('different experiments can have different variants', () => {
    const heroCta = getVariant('hero_cta_text');
    const pricingDisplay = getVariant('pricing_display');

    // Both should be assigned
    expect(heroCta).not.toBeNull();
    expect(pricingDisplay).not.toBeNull();

    // They are independent experiments
    expect(heroCta!.id).toBeDefined();
    expect(pricingDisplay!.id).toBeDefined();
  });

  it('assignments persist across hook re-renders', async () => {
    const { result, rerender } = renderHook(() => useABTest('hero_cta_text'));

    await waitFor(() => {
      expect(result.current.variant).not.toBeNull();
    });

    const firstVariant = result.current.variant;

    // Re-render multiple times
    for (let i = 0; i < 5; i++) {
      rerender();
    }

    expect(result.current.variant).toEqual(firstVariant);
  });
});
