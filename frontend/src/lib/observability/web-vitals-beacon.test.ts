import { describe, it, expect, vi } from "vitest";

import {
  buildWebVitalSample,
  sendWebVital,
  RUM_ENDPOINT,
} from "./web-vitals-beacon";

describe("buildWebVitalSample", () => {
  it("rounds timing metrics to whole milliseconds", () => {
    const s = buildWebVitalSample("LCP", 1823.4, "/galleries/[id]");
    expect(s).toEqual({ metric: "LCP", value: 1823, route: "/galleries/[id]" });
  });

  it("keeps CLS precision (unitless, small range)", () => {
    const s = buildWebVitalSample("CLS", 0.04321, "/g/[slug]");
    expect(s.metric).toBe("CLS");
    expect(s.route).toBe("/g/[slug]");
    expect(s.value).toBeCloseTo(0.0432, 4);
  });

  it("coerces a non-finite value to 0 rather than emitting NaN/Inf", () => {
    expect(buildWebVitalSample("INP", Number.NaN, "/").value).toBe(0);
    expect(buildWebVitalSample("INP", Infinity, "/").value).toBe(0);
  });
});

describe("sendWebVital", () => {
  it("posts a well-formed JSON payload to the RUM endpoint via the transport", () => {
    const transport = vi.fn().mockReturnValue(true);
    const sample = buildWebVitalSample("LCP", 1800, "/galleries/[id]");

    const dispatched = sendWebVital(sample, transport);

    expect(dispatched).toBe(true);
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, body] = transport.mock.calls[0];
    expect(url).toBe(RUM_ENDPOINT);
    const parsed = JSON.parse(body);
    expect(parsed).toEqual({
      metric: "LCP",
      value: 1800,
      route: "/galleries/[id]",
    });
  });

  it("never throws when the transport throws (telemetry must not break the app)", () => {
    const transport = vi.fn().mockImplementation(() => {
      throw new Error("network down");
    });
    expect(() =>
      sendWebVital(buildWebVitalSample("CLS", 0.1, "/"), transport),
    ).not.toThrow();
    expect(sendWebVital(buildWebVitalSample("CLS", 0.1, "/"), transport)).toBe(
      false,
    );
  });

  it("returns false when no transport is available (no navigator, no fetch)", () => {
    const origNavigator = globalThis.navigator;
    const origFetch = globalThis.fetch;
    try {
      // @ts-expect-error -- simulate a non-browser environment
      delete globalThis.navigator;
      // @ts-expect-error -- simulate fetch absence
      delete globalThis.fetch;
      expect(sendWebVital(buildWebVitalSample("TTFB", 50, "/"))).toBe(false);
    } finally {
      globalThis.navigator = origNavigator;
      globalThis.fetch = origFetch;
    }
  });

  it("uses navigator.sendBeacon when available", () => {
    const beacon = vi.fn().mockReturnValue(true);
    const origNavigator = globalThis.navigator;
    try {
      Object.defineProperty(globalThis, "navigator", {
        value: { sendBeacon: beacon },
        configurable: true,
        writable: true,
      });
      const dispatched = sendWebVital(
        buildWebVitalSample("FCP", 900, "/g/[slug]"),
      );
      expect(dispatched).toBe(true);
      expect(beacon).toHaveBeenCalledTimes(1);
      expect(beacon.mock.calls[0][0]).toBe(RUM_ENDPOINT);
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        value: origNavigator,
        configurable: true,
        writable: true,
      });
    }
  });
});
