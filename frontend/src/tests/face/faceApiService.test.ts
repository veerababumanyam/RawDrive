/**
 * Face API Service Tests
 * Tests for response normalization and cache invalidation patterns
 */

import { describe, it, expect } from 'vitest';
import { normalizePaginatedResponse, type NormalizedPaginatedResponse } from '../../services/faceApiService';

describe('normalizePaginatedResponse', () => {
  it('normalizes { data: [...], meta: {...} } response format', () => {
    const response = {
      data: [{ id: '1', name: 'Alice' }, { id: '2', name: 'Bob' }],
      meta: { total: 10, page: 2, per_page: 2 },
    };

    const result = normalizePaginatedResponse<{ id: string; name: string }>(response);

    expect(result.data).toHaveLength(2);
    expect(result.data[0].id).toBe('1');
    expect(result.meta.total).toBe(10);
    expect(result.meta.page).toBe(2);
    expect(result.meta.per_page).toBe(2);
  });

  it('normalizes direct array response [...] to standard format', () => {
    const response = [{ id: '1' }, { id: '2' }, { id: '3' }];

    const result = normalizePaginatedResponse<{ id: string }>(response);

    expect(result.data).toHaveLength(3);
    expect(result.meta.total).toBe(3);
    expect(result.meta.page).toBe(1);
    expect(result.meta.per_page).toBe(3);
  });

  it('normalizes { data: [...] } without meta to standard format with default meta', () => {
    const response = {
      data: [{ id: '1' }],
    };

    const result = normalizePaginatedResponse<{ id: string }>(response);

    expect(result.data).toHaveLength(1);
    expect(result.meta.total).toBe(1);
    expect(result.meta.page).toBe(1);
    expect(result.meta.per_page).toBe(1);
  });

  it('returns empty data for null/undefined/empty response', () => {
    const resultNull = normalizePaginatedResponse(null);
    expect(resultNull.data).toHaveLength(0);
    expect(resultNull.meta.total).toBe(0);

    const resultUndefined = normalizePaginatedResponse(undefined);
    expect(resultUndefined.data).toHaveLength(0);

    const resultEmpty = normalizePaginatedResponse({});
    expect(resultEmpty.data).toHaveLength(0);
  });

  it('handles response with data but partial meta', () => {
    const response = {
      data: [{ id: '1' }, { id: '2' }],
      meta: { total: 5 },
    };

    const result = normalizePaginatedResponse<{ id: string }>(response);

    expect(result.data).toHaveLength(2);
    expect(result.meta.total).toBe(5);
    expect(result.meta.page).toBe(1);
    expect(result.meta.per_page).toBe(2);
  });
});
