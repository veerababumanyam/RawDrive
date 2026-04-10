"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// GAL-FR-079: Sub-frame preview latency measurement for the design studio.
// We target a 16 ms budget (single 60 fps frame) for simple state changes like
// focal point drags, theme swaps, and grid slider moves. This hook wraps the
// browser Performance API so every design mutation is timed end-to-end from
// dispatch through the next paint.

export const LATENCY_BUDGET_MS = 16;
export const LATENCY_SAMPLE_CAP = 120; // ~2 seconds at 60 fps
const MARK_PREFIX = "design-latency";

type Severity = "ok" | "warn" | "fail";

export interface LatencySample {
  label: string;
  durationMs: number;
  severity: Severity;
  timestamp: number;
}

export interface LatencyStats {
  count: number;
  lastMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  overBudgetCount: number;
}

function hasPerformanceApi(): boolean {
  return (
    typeof performance !== "undefined" &&
    typeof performance.mark === "function" &&
    typeof performance.measure === "function"
  );
}

function severityFor(ms: number): Severity {
  if (ms <= LATENCY_BUDGET_MS) return "ok";
  if (ms <= LATENCY_BUDGET_MS * 2) return "warn";
  return "fail";
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[idx];
}

/**
 * useDesignLatency returns a `begin` function that opens a measurement and
 * returns a `commit(label)` continuation. Call `commit` inside a
 * `requestAnimationFrame` so the sample covers the full dispatch → render cycle.
 */
export function useDesignLatency() {
  const [samples, setSamples] = useState<LatencySample[]>([]);
  const markCounter = useRef(0);

  const begin = useCallback(() => {
    const id = markCounter.current++;
    const startMark = `${MARK_PREFIX}:start:${id}`;
    const endMark = `${MARK_PREFIX}:end:${id}`;
    const measureName = `${MARK_PREFIX}:${id}`;

    let start = 0;
    if (hasPerformanceApi()) {
      try {
        performance.mark(startMark);
      } catch {
        /* ignore — some browsers cap mark count */
      }
      start = performance.now();
    } else {
      start = Date.now();
    }

    return function commit(label: string): LatencySample {
      let durationMs: number;
      if (hasPerformanceApi()) {
        try {
          performance.mark(endMark);
          performance.measure(measureName, startMark, endMark);
          const entries = performance.getEntriesByName(measureName);
          durationMs =
            entries.length > 0
              ? entries[entries.length - 1].duration
              : performance.now() - start;
        } catch {
          durationMs = performance.now() - start;
        } finally {
          try {
            performance.clearMarks(startMark);
            performance.clearMarks(endMark);
            performance.clearMeasures(measureName);
          } catch {
            /* ignore */
          }
        }
      } else {
        durationMs = Date.now() - start;
      }

      const sample: LatencySample = {
        label,
        durationMs,
        severity: severityFor(durationMs),
        timestamp: Date.now(),
      };
      setSamples((prev) => {
        const next =
          prev.length >= LATENCY_SAMPLE_CAP
            ? prev.slice(-LATENCY_SAMPLE_CAP + 1)
            : prev.slice();
        next.push(sample);
        return next;
      });
      return sample;
    };
  }, []);

  const reset = useCallback(() => setSamples([]), []);

  const stats: LatencyStats = (() => {
    if (samples.length === 0) {
      return { count: 0, lastMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0, overBudgetCount: 0 };
    }
    const sorted = samples.map((s) => s.durationMs).sort((a, b) => a - b);
    const overBudget = samples.filter((s) => s.durationMs > LATENCY_BUDGET_MS).length;
    return {
      count: samples.length,
      lastMs: samples[samples.length - 1].durationMs,
      p50Ms: percentile(sorted, 0.5),
      p95Ms: percentile(sorted, 0.95),
      maxMs: sorted[sorted.length - 1],
      overBudgetCount: overBudget,
    };
  })();

  useEffect(() => () => setSamples([]), []);

  return { begin, reset, samples, stats, budgetMs: LATENCY_BUDGET_MS };
}
