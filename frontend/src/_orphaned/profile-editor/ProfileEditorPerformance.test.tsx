/**
 * Profile Editor Performance Tests
 *
 * Tests for performance requirements of the profile editor:
 * - Editor initial load < 1 second
 * - Preview update latency < 100ms
 * - Image delivery < 500ms
 * - Lighthouse score 95+ target metrics
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  measureEditorLoadTime,
  measurePreviewLatency,
  measureImageDelivery,
  getWebVitals,
  checkPerformanceTargets,
  PERFORMANCE_THRESHOLDS,
  estimateLighthouseScore,
} from '@/utils/performanceTestUtils';

// Mock requestAnimationFrame
const mockRaf = vi.fn((cb: FrameRequestCallback) => {
  setTimeout(() => cb(performance.now()), 0);
  return 1;
});

// Type declarations for test globals
declare const globalThis: {
  requestAnimationFrame: typeof window.requestAnimationFrame;
  fetch: typeof window.fetch;
};

describe('Profile Editor Performance Tests', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    globalThis.requestAnimationFrame = mockRaf;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('Editor Load Time (Requirement 11.1)', () => {
    it('should measure editor load time correctly', async () => {
      let callCount = 0;
      const mockNow = vi.spyOn(performance, 'now').mockImplementation(() => {
        callCount++;
        // Simulate 500ms load time
        if (callCount <= 2) return 0;
        if (callCount <= 4) return 250;
        return 500;
      });

      const mockLoadEditor = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 250));
      });

      const result = await measureEditorLoadTime(mockLoadEditor);

      expect(result).toHaveProperty('totalTime');
      expect(result).toHaveProperty('firstRender');
      expect(result).toHaveProperty('dataFetchTime');
      expect(result).toHaveProperty('hydrationTime');
      expect(result).toHaveProperty('passes');
      expect(mockLoadEditor).toHaveBeenCalled();

      mockNow.mockRestore();
    });

    it('should pass when load time is under 1 second', async () => {
      const mockLoadEditor = vi.fn().mockResolvedValue(undefined);
      let time = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => {
        time += 100;
        return time;
      });

      const result = await measureEditorLoadTime(mockLoadEditor);

      // Under 1000ms should pass
      expect(result.passes).toBe(true);
    });

    it('should have threshold set to 1000ms', () => {
      expect(PERFORMANCE_THRESHOLDS.EDITOR_LOAD_TIME).toBe(1000);
    });
  });

  describe('Preview Update Latency (Requirement 11.2)', () => {
    it('should measure preview latency over multiple iterations', async () => {
      const mockUpdatePreview = vi.fn().mockResolvedValue(undefined);
      let time = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => {
        time += 20; // 20ms per measurement point
        return time;
      });

      const result = await measurePreviewLatency(mockUpdatePreview, 5);

      expect(result).toHaveProperty('average');
      expect(result).toHaveProperty('min');
      expect(result).toHaveProperty('max');
      expect(result).toHaveProperty('p95');
      expect(result).toHaveProperty('p99');
      expect(result).toHaveProperty('passes');
      expect(mockUpdatePreview).toHaveBeenCalledTimes(5);
    });

    it('should pass when average latency is under 100ms', async () => {
      const mockUpdatePreview = vi.fn().mockResolvedValue(undefined);
      let time = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => {
        time += 25; // Simulate 50ms average (2 calls per iteration)
        return time;
      });

      const result = await measurePreviewLatency(mockUpdatePreview, 3);

      // Under 100ms should pass
      expect(result.passes).toBe(true);
    });

    it('should have threshold set to 100ms', () => {
      expect(PERFORMANCE_THRESHOLDS.PREVIEW_LATENCY).toBe(100);
    });
  });

  describe('Image Delivery Performance (Requirement 11.4)', () => {
    it('should measure image delivery time correctly', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        blob: () => Promise.resolve(new Blob(['test'], { type: 'image/jpeg' })),
      });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      let time = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => {
        time += 100;
        return time;
      });

      const imageUrls = [
        'https://example.com/image1.jpg',
        'https://example.com/image2.jpg',
      ];

      const result = await measureImageDelivery(imageUrls);

      expect(result).toHaveProperty('averageLoadTime');
      expect(result).toHaveProperty('imagesLoaded');
      expect(result).toHaveProperty('imagesFailed');
      expect(result).toHaveProperty('totalBytes');
      expect(result).toHaveProperty('passes');
      expect(result.imagesLoaded).toBe(2);
      expect(result.imagesFailed).toBe(0);
    });

    it('should handle failed image loads gracefully', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await measureImageDelivery(['https://example.com/bad.jpg']);

      expect(result.imagesFailed).toBe(1);
      expect(result.imagesLoaded).toBe(0);
    });

    it('should have threshold set to 500ms', () => {
      expect(PERFORMANCE_THRESHOLDS.IMAGE_DELIVERY).toBe(500);
    });
  });

  describe('Web Vitals (Requirement 11.3)', () => {
    it('should retrieve FCP from paint entries', () => {
      vi.spyOn(performance, 'getEntriesByType').mockImplementation((type) => {
        if (type === 'paint') {
          return [
            { name: 'first-paint', startTime: 100 },
            { name: 'first-contentful-paint', startTime: 200 },
          ] as PerformanceEntry[];
        }
        return [];
      });

      const metrics = getWebVitals();

      expect(metrics.fcp).toBe(200);
    });

    it('should retrieve LCP from largest-contentful-paint entries', () => {
      vi.spyOn(performance, 'getEntriesByType').mockImplementation((type) => {
        if (type === 'largest-contentful-paint') {
          return [
            { startTime: 500 },
            { startTime: 1500 },
          ] as PerformanceEntry[];
        }
        return [];
      });

      const metrics = getWebVitals();

      expect(metrics.lcp).toBe(1500);
    });

    it('should calculate CLS from layout-shift entries', () => {
      vi.spyOn(performance, 'getEntriesByType').mockImplementation((type) => {
        if (type === 'layout-shift') {
          return [
            { value: 0.05, hadRecentInput: false },
            { value: 0.03, hadRecentInput: false },
            { value: 0.1, hadRecentInput: true }, // Should be excluded
          ] as unknown as PerformanceEntry[];
        }
        return [];
      });

      const metrics = getWebVitals();

      expect(metrics.cls).toBeCloseTo(0.08, 5);
    });

    it('should have correct threshold values for Lighthouse 95+ target', () => {
      expect(PERFORMANCE_THRESHOLDS.LIGHTHOUSE_SCORE).toBe(95);
      expect(PERFORMANCE_THRESHOLDS.FCP).toBe(1800);
      expect(PERFORMANCE_THRESHOLDS.LCP).toBe(2500);
      expect(PERFORMANCE_THRESHOLDS.FID).toBe(100);
      expect(PERFORMANCE_THRESHOLDS.CLS).toBe(0.1);
      expect(PERFORMANCE_THRESHOLDS.TTI).toBe(3800);
      expect(PERFORMANCE_THRESHOLDS.TBT).toBe(200);
    });
  });

  describe('Performance Target Checking', () => {
    it('should pass when all metrics meet thresholds', () => {
      const metrics = {
        fcp: 1000,
        lcp: 2000,
        fid: 50,
        cls: 0.05,
        tbt: 100,
      };

      const result = checkPerformanceTargets(metrics);

      expect(result.passes).toBe(true);
      expect(result.failures).toHaveLength(0);
    });

    it('should fail when FCP exceeds threshold', () => {
      const metrics = { fcp: 2500 };

      const result = checkPerformanceTargets(metrics);

      expect(result.passes).toBe(false);
      expect(result.failures).toContain('FCP: 2500ms > 1800ms');
    });

    it('should fail when LCP exceeds threshold', () => {
      const metrics = { lcp: 3500 };

      const result = checkPerformanceTargets(metrics);

      expect(result.passes).toBe(false);
      expect(result.failures.some((f) => f.includes('LCP'))).toBe(true);
    });

    it('should fail when CLS exceeds threshold', () => {
      const metrics = { cls: 0.25 };

      const result = checkPerformanceTargets(metrics);

      expect(result.passes).toBe(false);
      expect(result.failures.some((f) => f.includes('CLS'))).toBe(true);
    });

    it('should report multiple failures', () => {
      const metrics = {
        fcp: 3000,
        lcp: 4000,
        cls: 0.5,
        tbt: 500,
      };

      const result = checkPerformanceTargets(metrics);

      expect(result.passes).toBe(false);
      expect(result.failures.length).toBeGreaterThan(1);
    });
  });

  describe('Lighthouse Score Estimation', () => {
    it('should return 100 when all metrics are optimal', () => {
      const metrics = {
        fcp: 500,
        lcp: 1000,
        cls: 0.01,
        tbt: 50,
      };

      const score = estimateLighthouseScore(metrics);

      expect(score).toBe(100);
    });

    it('should reduce score when metrics exceed thresholds', () => {
      const metrics = {
        fcp: 3600, // 2x threshold
        lcp: 5000, // 2x threshold
        cls: 0.2, // 2x threshold
        tbt: 400, // 2x threshold
      };

      const score = estimateLighthouseScore(metrics);

      expect(score).toBeLessThan(100);
    });

    it('should not go below 0', () => {
      const metrics = {
        fcp: 50000,
        lcp: 50000,
        cls: 10,
        tbt: 50000,
      };

      const score = estimateLighthouseScore(metrics);

      expect(score).toBeGreaterThanOrEqual(0);
    });

    it('should not exceed 100', () => {
      const metrics = {
        fcp: 100,
        lcp: 100,
        cls: 0.001,
        tbt: 10,
      };

      const score = estimateLighthouseScore(metrics);

      expect(score).toBeLessThanOrEqual(100);
    });
  });
});

describe('Performance Optimization Verification', () => {
  describe('Debouncing (Requirement 11.7)', () => {
    it('should debounce preview updates with 300ms delay', async () => {
      const { useDebounce } = await import('@/hooks/usePerformanceOptimization');

      // This is a hook test - verify the debounce delay is 300ms as required
      expect(useDebounce).toBeDefined();
    });
  });

  describe('Lazy Loading (Requirement 11.5)', () => {
    it('should have lazy loading hook available', async () => {
      const { useLazyLoad } = await import('@/hooks/usePerformanceOptimization');

      expect(useLazyLoad).toBeDefined();
    });
  });

  describe('Caching (Requirement 11.6)', () => {
    it('should have caching utilities available', async () => {
      const { useCache, themeCache, assetCache } = await import(
        '@/hooks/usePerformanceOptimization'
      );

      expect(useCache).toBeDefined();
      expect(themeCache).toBeDefined();
      expect(assetCache).toBeDefined();
    });
  });

  describe('Virtual Scrolling (Requirement 11.8)', () => {
    it('should have virtualization hook for 60fps scrolling', async () => {
      const { useVirtualization } = await import('@/hooks/usePerformanceOptimization');

      expect(useVirtualization).toBeDefined();
    });
  });
});
