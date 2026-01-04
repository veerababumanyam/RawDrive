import { describe, it, expect } from 'vitest';
import { AI_THRESHOLDS, PAGINATION, RATE_LIMITS } from '../src/thresholds';

describe('Threshold constants', () => {
  it('has AI thresholds', () => {
    expect(AI_THRESHOLDS.FACE_DETECTION_CONFIDENCE).toBe(0.7);
    expect(AI_THRESHOLDS.FACE_CLUSTERING_SIMILARITY).toBe(0.6);
    expect(AI_THRESHOLDS.AUTO_TAG_CONFIDENCE).toBe(0.8);
  });

  it('has pagination defaults', () => {
    expect(PAGINATION.DEFAULT_PAGE).toBe(1);
    expect(PAGINATION.DEFAULT_LIMIT).toBe(20);
    expect(PAGINATION.MAX_LIMIT).toBe(100);
  });

  it('has rate limits', () => {
    expect(RATE_LIMITS.API_REQUESTS_PER_MINUTE).toBe(100);
    expect(RATE_LIMITS.AUTH_ATTEMPTS_PER_15_MIN).toBe(5);
    expect(RATE_LIMITS.UPLOADS_PER_HOUR).toBe(1000);
    expect(RATE_LIMITS.AI_OPS_PER_MINUTE).toBe(30);
  });
});
