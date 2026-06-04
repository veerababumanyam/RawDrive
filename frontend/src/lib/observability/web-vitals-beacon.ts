// web-vitals-beacon.ts — PERF-RUM: build and send a single Core Web Vitals RUM
// sample to the backend ingest endpoint.
//
// The payload is intentionally tiny and PII-free: the canonical metric name,
// the route TEMPLATE (never a concrete path / query string), and the numeric
// value in native web-vitals units (ms for timings, unitless for CLS). It is
// fire-and-forget: navigator.sendBeacon first (survives page unload), with a
// keepalive fetch fallback. It never throws and never blocks rendering — a
// telemetry failure must never break the app.

// RUM_ENDPOINT is same-origin so it rides the Next.js /api/v1/* rewrite to the
// backend (see frontend/next.config.ts) and avoids CORS. The backend mounts the
// public handler at POST /api/v1/rum (PERF-RUM).
export const RUM_ENDPOINT = "/api/v1/rum";

// WebVitalSample is the minimal shape we send. It is a strict subset of the
// browser's web-vitals Metric object.
export interface WebVitalSample {
  metric: string;
  route: string;
  value: number;
}

/**
 * buildWebVitalSample maps a web-vitals Metric (name + value) plus the resolved
 * route template into the wire payload. Exported for unit testing.
 */
export function buildWebVitalSample(
  metricName: string,
  value: number,
  route: string,
): WebVitalSample {
  return {
    metric: metricName,
    // Round to avoid emitting noisy sub-millisecond float precision; CLS keeps
    // 4 decimals since it lives in the 0–1 range.
    value: Number.isFinite(value)
      ? metricName === "CLS"
        ? Number(value.toFixed(4))
        : Math.round(value)
      : 0,
    route,
  };
}

/**
 * sendWebVital posts one sample to the RUM ingest endpoint, fire-and-forget.
 * Returns true if a transport was dispatched, false if none was available. It
 * swallows every error so a telemetry outage cannot surface to the user.
 *
 * The `transport` parameter is injectable so unit tests can assert the payload
 * without a real network / navigator. In the browser it defaults to
 * navigator.sendBeacon, falling back to fetch keepalive.
 */
export function sendWebVital(
  sample: WebVitalSample,
  transport?: (url: string, body: string) => boolean,
): boolean {
  const body = JSON.stringify(sample);

  try {
    if (transport) {
      return transport(RUM_ENDPOINT, body);
    }

    if (
      typeof navigator !== "undefined" &&
      typeof navigator.sendBeacon === "function"
    ) {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(RUM_ENDPOINT, blob)) {
        return true;
      }
    }

    if (typeof fetch === "function") {
      // keepalive lets the request outlive the page during unload.
      void fetch(RUM_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
        // Fire-and-forget: ignore the response, never retry.
      }).catch(() => {
        /* swallow — telemetry must never break the app */
      });
      return true;
    }
  } catch {
    /* swallow — telemetry must never break the app */
  }
  return false;
}
