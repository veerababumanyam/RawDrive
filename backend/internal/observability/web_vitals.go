package observability

import "github.com/prometheus/client_golang/prometheus"

// web_vitals.go — PERF-RUM: Core Web Vitals Real-User-Monitoring (RUM) ingest.
//
// The frontend RUM reporter (frontend/src/components/observability/WebVitalsReporter.tsx)
// posts one Core Web Vitals sample per metric, per route, as a fire-and-forget
// beacon. WebVitalsMetrics records each sample into a Prometheus histogram so
// LCP/INP/CLS/FCP/TTFB show up on the same GET /metrics scrape endpoint that
// already exports the pgx pool stats (PR #69). Field regressions are otherwise
// invisible — this is the only client-side perf signal we collect.
//
// Units: web-vitals reports timing metrics (LCP, INP, FCP, TTFB) in
// MILLISECONDS and CLS as a unitless layout-shift score. We keep each value in
// its native web-vitals unit rather than normalising, so dashboards match the
// numbers Lighthouse / PageSpeed report. The bucket set therefore spans both
// the small CLS range (≈0–1) and the millisecond timing range (≈0–10s) so every
// metric lands in a meaningful bucket on the same histogram.
//
// Labels are bounded on purpose to avoid Prometheus cardinality blow-up:
//   - metric: the canonical web-vitals name (LCP/INP/CLS/FCP/TTFB) — closed set.
//   - route:  the Next.js ROUTE TEMPLATE (e.g. "/galleries/[id]"), never the
//     concrete path. The reporter sends the template, and the handler additionally
//     rejects anything with a query string or that isn't in the allow-list, so a
//     hostile client cannot explode cardinality or leak a tokenised URL.

// CanonicalWebVitalNames is the closed set of metric names accepted by the RUM
// ingest. Anything outside this set is dropped, both to bound label cardinality
// and to reject garbage from a hostile client.
var CanonicalWebVitalNames = map[string]struct{}{
	"LCP":  {},
	"INP":  {},
	"CLS":  {},
	"FCP":  {},
	"TTFB": {},
	// FID is the deprecated predecessor of INP; accepted for older browsers
	// that still emit it so we don't silently drop their samples.
	"FID": {},
}

// IsCanonicalWebVitalName reports whether name is an accepted Core Web Vitals
// metric name.
func IsCanonicalWebVitalName(name string) bool {
	_, ok := CanonicalWebVitalNames[name]
	return ok
}

// WebVitalsMetrics records Core Web Vitals RUM samples into a Prometheus
// histogram labelled by (metric, route). Construct it once with
// NewWebVitalsMetrics, register it into the /metrics registry, and call
// Observe for each ingested sample.
type WebVitalsMetrics struct {
	hist *prometheus.HistogramVec
}

// webVitalsBuckets spans the unitless CLS range and the millisecond timing
// range so a single histogram captures every metric meaningfully.
var webVitalsBuckets = []float64{
	// CLS-scale (unitless layout shift): "good" ≤ 0.1, "needs work" ≤ 0.25.
	0.05, 0.1, 0.25, 0.5, 1,
	// millisecond timing scale (LCP/INP/FCP/TTFB).
	100, 250, 500, 1000, 2000, 2500, 4000, 6000, 10000,
}

// NewWebVitalsMetrics builds the histogram collector. The caller registers the
// returned value into a prometheus.Registerer (see mountMetricsRoute).
func NewWebVitalsMetrics() *WebVitalsMetrics {
	return &WebVitalsMetrics{
		hist: prometheus.NewHistogramVec(
			prometheus.HistogramOpts{
				Name:    "rawdrive_web_vitals",
				Help:    "Core Web Vitals RUM samples reported by the browser. Timing metrics (LCP/INP/FCP/TTFB) are in milliseconds; CLS is unitless. Labelled by metric and Next.js route template.",
				Buckets: webVitalsBuckets,
			},
			[]string{"metric", "route"},
		),
	}
}

// Describe implements prometheus.Collector.
func (m *WebVitalsMetrics) Describe(ch chan<- *prometheus.Desc) {
	m.hist.Describe(ch)
}

// Collect implements prometheus.Collector.
func (m *WebVitalsMetrics) Collect(ch chan<- prometheus.Metric) {
	m.hist.Collect(ch)
}

// Observe records one Core Web Vitals sample. metric must be a canonical name
// (see CanonicalWebVitalNames); callers are expected to validate before calling
// so the label set stays bounded. value is in the metric's native web-vitals
// unit (ms for timings, unitless for CLS).
func (m *WebVitalsMetrics) Observe(metric, route string, value float64) {
	m.hist.WithLabelValues(metric, route).Observe(value)
}
