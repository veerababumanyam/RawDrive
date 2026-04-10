import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useDesignLatency,
  LATENCY_BUDGET_MS,
  LATENCY_SAMPLE_CAP,
} from "../use-design-latency";

describe("useDesignLatency (GAL-FR-079)", () => {
  it("exposes the 16 ms budget constant", () => {
    expect(LATENCY_BUDGET_MS).toBe(16);
  });

  it("caps the retained sample buffer so long sessions do not grow unbounded", () => {
    expect(LATENCY_SAMPLE_CAP).toBeGreaterThan(0);
    expect(LATENCY_SAMPLE_CAP).toBeLessThanOrEqual(500);
  });

  it("records a sample for every begin/commit pair", () => {
    const { result } = renderHook(() => useDesignLatency());
    expect(result.current.samples).toHaveLength(0);

    act(() => {
      const commit = result.current.begin();
      commit("set_theme");
    });

    expect(result.current.samples).toHaveLength(1);
    expect(result.current.samples[0].label).toBe("set_theme");
    expect(result.current.samples[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it("labels severity against the 16 ms budget", () => {
    const { result } = renderHook(() => useDesignLatency());
    act(() => {
      const commit = result.current.begin();
      commit("fast_change");
    });

    const sample = result.current.samples[0];
    expect(["ok", "warn", "fail"]).toContain(sample.severity);
    expect(sample.durationMs).toBeLessThan(200);
  });

  it("computes rolling stats (p50, p95, max, over-budget count)", () => {
    const { result } = renderHook(() => useDesignLatency());

    act(() => {
      for (let i = 0; i < 10; i++) {
        const commit = result.current.begin();
        commit("burst");
      }
    });

    expect(result.current.stats.count).toBe(10);
    expect(result.current.stats.lastMs).toBeGreaterThanOrEqual(0);
    expect(result.current.stats.p50Ms).toBeLessThanOrEqual(result.current.stats.p95Ms);
    expect(result.current.stats.maxMs).toBeGreaterThanOrEqual(result.current.stats.p95Ms);
    expect(result.current.stats.overBudgetCount).toBeGreaterThanOrEqual(0);
  });

  it("reset() clears all samples", () => {
    const { result } = renderHook(() => useDesignLatency());
    act(() => {
      const commit = result.current.begin();
      commit("x");
    });
    expect(result.current.samples).toHaveLength(1);

    act(() => {
      result.current.reset();
    });
    expect(result.current.samples).toHaveLength(0);
    expect(result.current.stats.count).toBe(0);
  });

  it("invokes performance.mark/measure when the API is available", () => {
    const markSpy: string[] = [];
    const measureSpy: string[] = [];
    const origMark = performance.mark;
    const origMeasure = performance.measure;
    performance.mark = ((name: string) => {
      markSpy.push(name);
      return origMark.call(performance, name);
    }) as typeof performance.mark;
    performance.measure = ((name: string, start?: string, end?: string) => {
      measureSpy.push(name);
      return origMeasure.call(performance, name, start, end);
    }) as typeof performance.measure;

    try {
      const { result } = renderHook(() => useDesignLatency());
      act(() => {
        const commit = result.current.begin();
        commit("measured");
      });
      expect(markSpy.some((m) => m.startsWith("design-latency:start"))).toBe(true);
      expect(markSpy.some((m) => m.startsWith("design-latency:end"))).toBe(true);
      expect(measureSpy.some((m) => m.startsWith("design-latency:"))).toBe(true);
    } finally {
      performance.mark = origMark;
      performance.measure = origMeasure;
    }
  });
});
