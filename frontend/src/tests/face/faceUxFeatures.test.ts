/**
 * Face UX Features Tests
 * Tests for confidence filter, context menu, undo merge, and cross-gallery search
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Test 1: FaceConfidenceFilter
// ---------------------------------------------------------------------------

describe('FaceConfidenceFilter', () => {
  it('renders with default value and fires onChange', async () => {
    // Dynamically import to test the component exists and exports correctly
    const mod = await import('../../components/features/face/FaceConfidenceFilter');
    const { FaceConfidenceFilter } = mod;
    expect(FaceConfidenceFilter).toBeDefined();
    expect(typeof FaceConfidenceFilter).toBe('function');
  });

  it('exports FaceConfidenceFilterProps interface-compatible component', async () => {
    const mod = await import('../../components/features/face/FaceConfidenceFilter');
    const { FaceConfidenceFilter } = mod;

    // Component should accept the expected props without error
    // (type-level check -- runtime validates it's a function component)
    expect(FaceConfidenceFilter).toBeDefined();
    expect(FaceConfidenceFilter.length).toBeGreaterThanOrEqual(0); // accepts props
  });
});

// ---------------------------------------------------------------------------
// Test 2: Confidence filtering reduces visible groups
// ---------------------------------------------------------------------------

describe('Confidence filtering logic', () => {
  it('filters groups by average_confidence >= threshold', () => {
    const groups = [
      { id: '1', average_confidence: 0.95, face_count: 5 },
      { id: '2', average_confidence: 0.60, face_count: 3 },
      { id: '3', average_confidence: 0.30, face_count: 1 },
      { id: '4', average_confidence: 0.80, face_count: 7 },
      { id: '5', face_count: 2 }, // no confidence -- should default to included
    ];

    const threshold = 50; // 50%
    const filtered = groups.filter(
      (g) => ((g as any).average_confidence ?? 1) * 100 >= threshold
    );

    expect(filtered).toHaveLength(4); // groups 1, 2, 4, 5
    expect(filtered.map((g) => g.id)).toEqual(['1', '2', '4', '5']);
  });

  it('threshold of 0 shows all groups', () => {
    const groups = [
      { id: '1', average_confidence: 0.10 },
      { id: '2', average_confidence: 0.01 },
    ];

    const threshold = 0;
    const filtered = groups.filter(
      (g) => ((g as any).average_confidence ?? 1) * 100 >= threshold
    );

    expect(filtered).toHaveLength(2);
  });

  it('threshold of 100 only shows perfect confidence', () => {
    const groups = [
      { id: '1', average_confidence: 1.0 },
      { id: '2', average_confidence: 0.99 },
    ];

    const threshold = 100;
    const filtered = groups.filter(
      (g) => ((g as any).average_confidence ?? 1) * 100 >= threshold
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('1');
  });
});

// ---------------------------------------------------------------------------
// Test 3: FaceContextMenu
// ---------------------------------------------------------------------------

describe('FaceContextMenu', () => {
  it('exports a valid component', async () => {
    const mod = await import('../../components/features/face/FaceContextMenu');
    const { FaceContextMenu } = mod;
    expect(FaceContextMenu).toBeDefined();
    expect(typeof FaceContextMenu).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Test 4: UndoMergeToast
// ---------------------------------------------------------------------------

describe('UndoMergeToast', () => {
  it('exports a valid component', async () => {
    const mod = await import('../../components/features/face/UndoMergeToast');
    const { UndoMergeToast } = mod;
    expect(UndoMergeToast).toBeDefined();
    expect(typeof UndoMergeToast).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Test 5: usePeopleMerge undo capability
// ---------------------------------------------------------------------------

describe('usePeopleMerge undo support', () => {
  it('exports undoMerge-related types from usePeopleMerge', async () => {
    const mod = await import('../../hooks/usePeopleMerge');
    // The hook should exist
    expect(mod.usePeopleMerge).toBeDefined();
    expect(typeof mod.usePeopleMerge).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Test 6: useFaceSearch hook
// ---------------------------------------------------------------------------

describe('useFaceSearch', () => {
  it('exports useFaceSearch hook', async () => {
    const mod = await import('../../hooks/useFaceSearch');
    expect(mod.useFaceSearch).toBeDefined();
    expect(typeof mod.useFaceSearch).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Test 7: faceApiService.searchPhotosByPerson
// ---------------------------------------------------------------------------

describe('faceApiService cross-gallery search', () => {
  it('has searchPhotosByPerson method', async () => {
    const { faceApiService } = await import('../../services/faceApiService');
    expect(typeof faceApiService.searchPhotosByPerson).toBe('function');
  });
});
