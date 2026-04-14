import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useBandwidthTest } from "../useBandwidthTest";
import type { BandwidthTransport } from "../useBandwidthTest";

// Build a mock transport that reports fixed elapsed ms for the 5MB probe.
// kbps = (bytes * 8) / elapsedMs — so 5MB / 800ms ≈ 50000 kbps.
function mockTransport(elapsedMs: number): BandwidthTransport {
  return {
    uploadProbe: vi.fn(async (bytes: number) => {
      void bytes;
      return elapsedMs;
    }),
  };
}

describe("useBandwidthTest", () => {
  it("starts in idle state", () => {
    const { result } = renderHook(() => useBandwidthTest(mockTransport(800)));
    expect(result.current.status).toBe("idle");
    expect(result.current.mbps).toBe(0);
  });

  it("measures uplink Mbps using the injected transport (5MB / 800ms ≈ 50 Mbps)", async () => {
    const t = mockTransport(800);
    const { result } = renderHook(() => useBandwidthTest(t));

    await act(async () => {
      await result.current.run();
    });

    expect(result.current.status).toBe("done");
    // 5 * 1024 * 1024 * 8 / 800 / 1000 ≈ 52.43 Mbps — tolerate a small window.
    expect(result.current.mbps).toBeGreaterThan(40);
    expect(result.current.mbps).toBeLessThan(60);
    expect(t.uploadProbe).toHaveBeenCalled();
  });

  it("classifies high bandwidth as 1080p60 tier", async () => {
    const { result } = renderHook(() => useBandwidthTest(mockTransport(500)));
    await act(async () => { await result.current.run(); });
    expect(result.current.classify().tier).toBe("1080p60");
    expect(result.current.classify().verdict).toBe("pass");
  });

  it("classifies mid bandwidth as 1080p30", async () => {
    // 5MB * 8 / X ms / 1000 = ~6 Mbps → X ≈ 6990ms
    const { result } = renderHook(() => useBandwidthTest(mockTransport(6990)));
    await act(async () => { await result.current.run(); });
    const c = result.current.classify();
    expect(c.tier).toBe("1080p30");
  });

  it("classifies low bandwidth as poor with downgrade recommendation", async () => {
    // ~2 Mbps → elapsed ≈ 20971ms
    const { result } = renderHook(() => useBandwidthTest(mockTransport(20971)));
    await act(async () => { await result.current.run(); });
    const c = result.current.classify();
    expect(c.verdict).toBe("poor");
    expect(c.tier).toBe("below-720p30");
    expect(c.recommendations.join(" ")).toMatch(/below 3 Mbps|upgrade/i);
  });

  it("transitions to error on transport failure", async () => {
    const t: BandwidthTransport = {
      uploadProbe: vi.fn(async () => { throw new Error("network"); }),
    };
    const { result } = renderHook(() => useBandwidthTest(t));
    await act(async () => {
      await result.current.run().catch(() => {});
    });
    expect(result.current.status).toBe("error");
  });
});
