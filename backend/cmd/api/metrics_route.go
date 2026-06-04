package main

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/rawdrive/backend/internal/observability"
)

// mountMetricsRoute exposes pgx connection-pool saturation counters in
// Prometheus text format at GET /metrics.
//
// A dedicated registry is used instead of prometheus.DefaultRegisterer so the
// scrape output contains ONLY the rawdrive_pgxpool_* series. Adding the Go
// runtime / process collectors would require an explicit
// collectors.NewGoCollector()/NewProcessCollector() registration here; it is
// deliberately omitted to keep the endpoint focused on data-plane saturation.
//
// The pool is read lazily through a snapshot closure that calls dbPool.Stat()
// on every scrape, so the exported values always reflect live pool state.
//
// SECURITY: /metrics is intentionally unauthenticated, matching /health and
// /health/deep and the Prometheus scrape convention. It MUST be network-
// restricted at ingress (firewall / private network / scrape-only ACL) so the
// pool internals are not exposed publicly.
//
// PERF-RUM: the same registry also holds the Core Web Vitals RUM histogram so
// browser-reported LCP/INP/CLS/FCP/TTFB samples surface on this scrape. The
// histogram is returned so the (public, rate-limited) /api/v1/rum ingest handler
// can record into the very collector that /metrics exposes.
func mountMetricsRoute(r chi.Router, dbPool *pgxpool.Pool) *observability.WebVitalsMetrics {
	reg := prometheus.NewRegistry()
	reg.MustRegister(observability.NewPoolCollector(func() observability.PoolStats {
		return observability.PoolStatsFrom(dbPool.Stat())
	}))

	webVitals := observability.NewWebVitalsMetrics()
	reg.MustRegister(webVitals)

	r.Handle("/metrics", promhttp.HandlerFor(reg, promhttp.HandlerOpts{}))
	return webVitals
}
