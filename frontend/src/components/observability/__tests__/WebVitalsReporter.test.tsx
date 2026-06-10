import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const webVitalsState = vi.hoisted(() => ({
  callback: null as null | ((metric: { name: string; value: number }) => void),
}));

const observabilityMocks = vi.hoisted(() => ({
  buildWebVitalSample: vi.fn((metric: string, value: number, route: string) => ({
    metric,
    value,
    route,
  })),
  sendWebVital: vi.fn(),
}));

vi.mock("next/web-vitals", () => ({
  useReportWebVitals: (
    callback: (metric: { name: string; value: number }) => void,
  ) => {
    webVitalsState.callback = callback;
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/login",
}));

vi.mock("@/lib/observability/web-vitals-beacon", () => ({
  buildWebVitalSample: observabilityMocks.buildWebVitalSample,
  sendWebVital: observabilityMocks.sendWebVital,
}));

import { WebVitalsReporter } from "../WebVitalsReporter";

describe("WebVitalsReporter", () => {
  it("does not emit RUM beacons in development/test mode", () => {
    render(<WebVitalsReporter />);

    webVitalsState.callback?.({ name: "LCP", value: 1200 });

    expect(observabilityMocks.sendWebVital).not.toHaveBeenCalled();
  });
});
