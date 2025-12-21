/**
 * Performance Testing Utilities
 *
 * Utilities for testing and monitoring performance of the profile editor
 * including load times, preview latency, and rendering performance.
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4
 */

// =============================================================================
// Types
// =============================================================================

export interface PerformanceMetrics {
  /** Time to first contentful paint */
  fcp: number;
  /** Time to largest contentful paint */
  lcp: number;
  /** First input delay */
  fid: number;
  /** Cumulative layout shift */
  cls: number;
  /** Time to interactive */
  tti: number;
  /** Total blocking time */
  tbt: number;
}

export interface LoadTimeResult {
  /** Total load time in ms */
  totalTime: number;
  /** Time to first render */
  firstRender: number;
  /** Time for data fetching */
  dataFetchTime: number;
  /** Time for component hydration */
  hydrationTime: number;
  /** Passes threshold */
  passes: boolean;
}

export interface LatencyResult {
  /** Average latency in ms */
  average: number;
  /** Minimum latency */
  min: number;
  /** Maximum latency */
  max: number;
  /** 95th percentile */
  p95: number;
  /** 99th percentile */
  p99: number;
  /** Passes threshold */
  passes: boolean;
}

export interface ImagePerformanceResult {
  /** Average load time in ms */
  averageLoadTime: number;
  /** Images loaded */
  imagesLoaded: number;
  /** Images failed */
  imagesFailed: number;
  /** Total bytes transferred */
  totalBytes: number;
  /** Passes threshold */
  passes: boolean;
}

export interface PerformanceReport {
  timestamp: string;
  editorLoad: LoadTimeResult;
  previewLatency: LatencyResult;
  imageDelivery: ImagePerformanceResult;
  webVitals: Partial<PerformanceMetrics>;
  recommendations: string[];
}

// =============================================================================
// Performance Thresholds
// =============================================================================

export const PERFORMANCE_THRESHOLDS = {
  /** Editor load time target (ms) */
  EDITOR_LOAD_TIME: 1000,
  /** Preview update latency target (ms) */
  PREVIEW_LATENCY: 100,
  /** Image delivery target (ms) */
  IMAGE_DELIVERY: 500,
  /** Lighthouse score target */
  LIGHTHOUSE_SCORE: 95,
  /** FCP target (ms) */
  FCP: 1800,
  /** LCP target (ms) */
  LCP: 2500,
  /** FID target (ms) */
  FID: 100,
  /** CLS target */
  CLS: 0.1,
  /** TTI target (ms) */
  TTI: 3800,
  /** TBT target (ms) */
  TBT: 200,
};

// =============================================================================
// Performance Measurement Functions
// =============================================================================

/**
 * Measure editor load time
 * Requirement 11.1: Editor initial load < 1 second
 */
export async function measureEditorLoadTime(
  loadEditor: () => Promise<void>
): Promise<LoadTimeResult> {
  const startTime = performance.now();

  // Mark first render
  let firstRenderTime = 0;
  const markFirstRender = () => {
    if (firstRenderTime === 0) {
      firstRenderTime = performance.now() - startTime;
    }
  };

  // Use requestAnimationFrame to detect first paint
  requestAnimationFrame(markFirstRender);

  // Measure data fetch time
  const dataFetchStart = performance.now();
  await loadEditor();
  const dataFetchTime = performance.now() - dataFetchStart;

  // Wait for next frame to ensure hydration complete
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const hydrationTime = performance.now() - startTime - dataFetchTime;

  const totalTime = performance.now() - startTime;

  return {
    totalTime,
    firstRender: firstRenderTime || totalTime,
    dataFetchTime,
    hydrationTime,
    passes: totalTime < PERFORMANCE_THRESHOLDS.EDITOR_LOAD_TIME,
  };
}

/**
 * Measure preview update latency
 * Requirement 11.2: Preview update latency < 100ms
 */
export async function measurePreviewLatency(
  updatePreview: () => Promise<void>,
  iterations = 10
): Promise<LatencyResult> {
  const latencies: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await updatePreview();
    // Wait for next animation frame to ensure render complete
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const latency = performance.now() - start;
    latencies.push(latency);

    // Small delay between iterations
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  // Sort for percentile calculation
  latencies.sort((a, b) => a - b);

  const average = latencies.reduce((sum, l) => sum + l, 0) / latencies.length;
  const p95Index = Math.floor(latencies.length * 0.95);
  const p99Index = Math.floor(latencies.length * 0.99);

  return {
    average,
    min: latencies[0],
    max: latencies[latencies.length - 1],
    p95: latencies[p95Index] || latencies[latencies.length - 1],
    p99: latencies[p99Index] || latencies[latencies.length - 1],
    passes: average < PERFORMANCE_THRESHOLDS.PREVIEW_LATENCY,
  };
}

/**
 * Measure image delivery performance
 * Requirement 11.4: Image delivery < 500ms
 */
export async function measureImageDelivery(
  imageUrls: string[]
): Promise<ImagePerformanceResult> {
  const results: { time: number; size: number; success: boolean }[] = [];

  await Promise.all(
    imageUrls.map(async (url) => {
      const start = performance.now();
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        const time = performance.now() - start;
        results.push({ time, size: blob.size, success: true });
      } catch {
        const time = performance.now() - start;
        results.push({ time, size: 0, success: false });
      }
    })
  );

  const successful = results.filter((r) => r.success);
  const averageLoadTime =
    successful.length > 0
      ? successful.reduce((sum, r) => sum + r.time, 0) / successful.length
      : 0;

  return {
    averageLoadTime,
    imagesLoaded: successful.length,
    imagesFailed: results.length - successful.length,
    totalBytes: successful.reduce((sum, r) => sum + r.size, 0),
    passes: averageLoadTime < PERFORMANCE_THRESHOLDS.IMAGE_DELIVERY,
  };
}

/**
 * Get Web Vitals metrics
 * Requirement 11.3: Lighthouse score 95+
 */
export function getWebVitals(): Partial<PerformanceMetrics> {
  const metrics: Partial<PerformanceMetrics> = {};

  // Get performance entries
  const paintEntries = performance.getEntriesByType('paint');
  const fcpEntry = paintEntries.find((e) => e.name === 'first-contentful-paint');
  if (fcpEntry) {
    metrics.fcp = fcpEntry.startTime;
  }

  // Get LCP from PerformanceObserver if available
  const lcpEntries = performance.getEntriesByType(
    'largest-contentful-paint'
  ) as PerformanceEntry[];
  if (lcpEntries.length > 0) {
    metrics.lcp = lcpEntries[lcpEntries.length - 1].startTime;
  }

  // Get CLS from layout-shift entries
  const layoutShiftEntries = performance.getEntriesByType('layout-shift') as (PerformanceEntry & {
    value: number;
    hadRecentInput: boolean;
  })[];
  if (layoutShiftEntries.length > 0) {
    metrics.cls = layoutShiftEntries
      .filter((e) => !e.hadRecentInput)
      .reduce((sum, e) => sum + e.value, 0);
  }

  return metrics;
}

/**
 * Observe Web Vitals in real-time
 */
export function observeWebVitals(
  callback: (metric: { name: string; value: number }) => void
): () => void {
  const observers: PerformanceObserver[] = [];

  // Observe LCP
  try {
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1];
      callback({ name: 'LCP', value: lastEntry.startTime });
    });
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
    observers.push(lcpObserver);
  } catch {
    // LCP not supported
  }

  // Observe FID
  try {
    const fidObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries() as (PerformanceEntry & {
        processingStart: number;
      })[];
      entries.forEach((entry) => {
        callback({
          name: 'FID',
          value: entry.processingStart - entry.startTime,
        });
      });
    });
    fidObserver.observe({ type: 'first-input', buffered: true });
    observers.push(fidObserver);
  } catch {
    // FID not supported
  }

  // Observe CLS
  try {
    let clsValue = 0;
    const clsObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries() as (PerformanceEntry & {
        value: number;
        hadRecentInput: boolean;
      })[];
      entries.forEach((entry) => {
        if (!entry.hadRecentInput) {
          clsValue += entry.value;
          callback({ name: 'CLS', value: clsValue });
        }
      });
    });
    clsObserver.observe({ type: 'layout-shift', buffered: true });
    observers.push(clsObserver);
  } catch {
    // CLS not supported
  }

  // Return cleanup function
  return () => {
    observers.forEach((o) => o.disconnect());
  };
}

// =============================================================================
// Performance Report Generation
// =============================================================================

/**
 * Generate comprehensive performance report
 */
export async function generatePerformanceReport(
  loadEditor: () => Promise<void>,
  updatePreview: () => Promise<void>,
  imageUrls: string[] = []
): Promise<PerformanceReport> {
  const recommendations: string[] = [];

  // Measure editor load
  const editorLoad = await measureEditorLoadTime(loadEditor);
  if (!editorLoad.passes) {
    recommendations.push(
      `Editor load time (${editorLoad.totalTime.toFixed(0)}ms) exceeds target (${PERFORMANCE_THRESHOLDS.EDITOR_LOAD_TIME}ms). Consider lazy loading non-critical components.`
    );
  }

  // Measure preview latency
  const previewLatency = await measurePreviewLatency(updatePreview);
  if (!previewLatency.passes) {
    recommendations.push(
      `Preview latency (${previewLatency.average.toFixed(0)}ms) exceeds target (${PERFORMANCE_THRESHOLDS.PREVIEW_LATENCY}ms). Consider debouncing updates or optimizing render logic.`
    );
  }

  // Measure image delivery
  const imageDelivery =
    imageUrls.length > 0
      ? await measureImageDelivery(imageUrls)
      : {
          averageLoadTime: 0,
          imagesLoaded: 0,
          imagesFailed: 0,
          totalBytes: 0,
          passes: true,
        };

  if (!imageDelivery.passes) {
    recommendations.push(
      `Image delivery (${imageDelivery.averageLoadTime.toFixed(0)}ms) exceeds target (${PERFORMANCE_THRESHOLDS.IMAGE_DELIVERY}ms). Consider using image optimization or CDN.`
    );
  }

  // Get Web Vitals
  const webVitals = getWebVitals();

  // Check Web Vitals thresholds
  if (webVitals.fcp && webVitals.fcp > PERFORMANCE_THRESHOLDS.FCP) {
    recommendations.push(
      `FCP (${webVitals.fcp.toFixed(0)}ms) exceeds target (${PERFORMANCE_THRESHOLDS.FCP}ms). Optimize critical rendering path.`
    );
  }

  if (webVitals.lcp && webVitals.lcp > PERFORMANCE_THRESHOLDS.LCP) {
    recommendations.push(
      `LCP (${webVitals.lcp.toFixed(0)}ms) exceeds target (${PERFORMANCE_THRESHOLDS.LCP}ms). Optimize largest content element loading.`
    );
  }

  if (webVitals.cls && webVitals.cls > PERFORMANCE_THRESHOLDS.CLS) {
    recommendations.push(
      `CLS (${webVitals.cls.toFixed(3)}) exceeds target (${PERFORMANCE_THRESHOLDS.CLS}). Add size attributes to images and avoid dynamic content insertion.`
    );
  }

  return {
    timestamp: new Date().toISOString(),
    editorLoad,
    previewLatency,
    imageDelivery,
    webVitals,
    recommendations,
  };
}

// =============================================================================
// Performance Monitoring
// =============================================================================

/**
 * Start continuous performance monitoring
 */
export function startPerformanceMonitoring(
  onMetric: (metric: { name: string; value: number; timestamp: number }) => void,
  interval = 5000
): () => void {
  const stopWebVitals = observeWebVitals((metric) => {
    onMetric({ ...metric, timestamp: Date.now() });
  });

  // Periodic memory check (if available)
  let memoryInterval: ReturnType<typeof setInterval> | null = null;
  if ('memory' in performance) {
    memoryInterval = setInterval(() => {
      const memory = (performance as { memory?: { usedJSHeapSize: number } })
        .memory;
      if (memory) {
        onMetric({
          name: 'JSHeapSize',
          value: memory.usedJSHeapSize,
          timestamp: Date.now(),
        });
      }
    }, interval);
  }

  return () => {
    stopWebVitals();
    if (memoryInterval) {
      clearInterval(memoryInterval);
    }
  };
}

/**
 * Check if current performance meets targets
 */
export function checkPerformanceTargets(
  metrics: Partial<PerformanceMetrics>
): {
  passes: boolean;
  failures: string[];
} {
  const failures: string[] = [];

  if (metrics.fcp && metrics.fcp > PERFORMANCE_THRESHOLDS.FCP) {
    failures.push(`FCP: ${metrics.fcp.toFixed(0)}ms > ${PERFORMANCE_THRESHOLDS.FCP}ms`);
  }

  if (metrics.lcp && metrics.lcp > PERFORMANCE_THRESHOLDS.LCP) {
    failures.push(`LCP: ${metrics.lcp.toFixed(0)}ms > ${PERFORMANCE_THRESHOLDS.LCP}ms`);
  }

  if (metrics.fid && metrics.fid > PERFORMANCE_THRESHOLDS.FID) {
    failures.push(`FID: ${metrics.fid.toFixed(0)}ms > ${PERFORMANCE_THRESHOLDS.FID}ms`);
  }

  if (metrics.cls && metrics.cls > PERFORMANCE_THRESHOLDS.CLS) {
    failures.push(`CLS: ${metrics.cls.toFixed(3)} > ${PERFORMANCE_THRESHOLDS.CLS}`);
  }

  if (metrics.tbt && metrics.tbt > PERFORMANCE_THRESHOLDS.TBT) {
    failures.push(`TBT: ${metrics.tbt.toFixed(0)}ms > ${PERFORMANCE_THRESHOLDS.TBT}ms`);
  }

  return {
    passes: failures.length === 0,
    failures,
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Format duration to human readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Calculate estimated Lighthouse score from Web Vitals
 * This is a rough estimate - actual Lighthouse scoring is more complex
 */
export function estimateLighthouseScore(
  metrics: Partial<PerformanceMetrics>
): number {
  let score = 100;

  // Deduct points for each metric that exceeds threshold
  if (metrics.fcp) {
    const fcpPenalty = Math.max(
      0,
      ((metrics.fcp - PERFORMANCE_THRESHOLDS.FCP) / PERFORMANCE_THRESHOLDS.FCP) * 10
    );
    score -= fcpPenalty;
  }

  if (metrics.lcp) {
    const lcpPenalty = Math.max(
      0,
      ((metrics.lcp - PERFORMANCE_THRESHOLDS.LCP) / PERFORMANCE_THRESHOLDS.LCP) * 25
    );
    score -= lcpPenalty;
  }

  if (metrics.cls) {
    const clsPenalty = Math.max(
      0,
      ((metrics.cls - PERFORMANCE_THRESHOLDS.CLS) / PERFORMANCE_THRESHOLDS.CLS) * 15
    );
    score -= clsPenalty;
  }

  if (metrics.tbt) {
    const tbtPenalty = Math.max(
      0,
      ((metrics.tbt - PERFORMANCE_THRESHOLDS.TBT) / PERFORMANCE_THRESHOLDS.TBT) * 25
    );
    score -= tbtPenalty;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}
