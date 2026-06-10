"use client";

// WebVitalsReporter — PERF-RUM: Real-User-Monitoring for Core Web Vitals.
//
// Mounted once in the root layout, this renders nothing and registers a
// web-vitals callback via Next's useReportWebVitals. Each LCP/INP/CLS/FCP/TTFB
// sample is beaconed to the backend RUM ingest (POST /api/v1/rum), labelled by
// the current route TEMPLATE so field regressions become visible on the
// Prometheus /metrics scrape. It is fire-and-forget and PII-free: it sends only
// the metric name, the route template (never the concrete path or query
// string), and the numeric value.
//
// It never throws and never blocks rendering — a telemetry failure must not
// affect the user-facing app.

import { useReportWebVitals } from "next/web-vitals";
import { usePathname } from "next/navigation";

import { routeTemplateFromPathname } from "@/lib/observability/route-template";
import {
  buildWebVitalSample,
  sendWebVital,
} from "@/lib/observability/web-vitals-beacon";

// Minimal shape of the web-vitals Metric we read. Next bundles web-vitals
// internally and re-exports the callback; we type only the fields we use so we
// don't depend on the (untyped) compiled Metric export.
interface ReportedMetric {
  name: string;
  value: number;
}

export function WebVitalsReporter(): null {
  const pathname = usePathname();

  useReportWebVitals((metric: ReportedMetric) => {
    if (process.env.NODE_ENV !== "production") return;
    try {
      const route = routeTemplateFromPathname(pathname);
      const sample = buildWebVitalSample(metric.name, metric.value, route);
      sendWebVital(sample);
    } catch {
      /* swallow — telemetry must never break the app */
    }
  });

  return null;
}
