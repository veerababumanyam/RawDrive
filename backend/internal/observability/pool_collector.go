package observability

import "github.com/prometheus/client_golang/prometheus"

// PoolCollector is a prometheus.Collector that exports pgx connection-pool
// saturation counters under the rawdrive_pgxpool_* namespace.
//
// It reads its data through a snapshot func rather than holding a live
// *pgxpool.Pool. That indirection keeps the collector unit-testable with a
// fake snapshot and decouples this package from pgx. Wire it in production with
// NewPoolCollector(func() PoolStats { return PoolStatsFrom(pool.Stat()) }).
//
// Collection is pull-based: snapshot() is invoked once per scrape inside
// Collect, so the metrics always reflect the pool state at scrape time.
type PoolCollector struct {
	snapshot func() PoolStats

	totalConns    *prometheus.Desc
	idleConns     *prometheus.Desc
	acquiredConns *prometheus.Desc
	maxConns      *prometheus.Desc

	acquireTotal         *prometheus.Desc
	emptyAcquireTotal    *prometheus.Desc
	canceledAcquireTotal *prometheus.Desc
}

// NewPoolCollector builds a PoolCollector that reads pool stats via snapshot on
// every scrape. snapshot must be non-nil; pass a closure over a live pool's
// Stat() in production or a fixed-value func in tests.
func NewPoolCollector(snapshot func() PoolStats) *PoolCollector {
	return &PoolCollector{
		snapshot: snapshot,
		totalConns: prometheus.NewDesc(
			"rawdrive_pgxpool_total_conns",
			"Total number of connections currently in the pgx pool (idle + acquired + constructing).",
			nil, nil,
		),
		idleConns: prometheus.NewDesc(
			"rawdrive_pgxpool_idle_conns",
			"Number of currently idle connections in the pgx pool.",
			nil, nil,
		),
		acquiredConns: prometheus.NewDesc(
			"rawdrive_pgxpool_acquired_conns",
			"Number of currently acquired (in-use) connections in the pgx pool.",
			nil, nil,
		),
		maxConns: prometheus.NewDesc(
			"rawdrive_pgxpool_max_conns",
			"Maximum size of the pgx pool.",
			nil, nil,
		),
		acquireTotal: prometheus.NewDesc(
			"rawdrive_pgxpool_acquire_total",
			"Cumulative count of successful connection acquisitions from the pgx pool.",
			nil, nil,
		),
		emptyAcquireTotal: prometheus.NewDesc(
			"rawdrive_pgxpool_empty_acquire_total",
			"Cumulative count of acquisitions that had to wait because the pgx pool was empty.",
			nil, nil,
		),
		canceledAcquireTotal: prometheus.NewDesc(
			"rawdrive_pgxpool_canceled_acquire_total",
			"Cumulative count of acquisitions canceled by a context before completing.",
			nil, nil,
		),
	}
}

// Describe sends the static descriptors of every metric to ch. Declaring all
// descriptors makes this a checked collector, so the registry can detect
// duplicate or inconsistent metric definitions at registration time.
func (c *PoolCollector) Describe(ch chan<- *prometheus.Desc) {
	ch <- c.totalConns
	ch <- c.idleConns
	ch <- c.acquiredConns
	ch <- c.maxConns
	ch <- c.acquireTotal
	ch <- c.emptyAcquireTotal
	ch <- c.canceledAcquireTotal
}

// Collect reads one snapshot and emits a const metric per descriptor. Gauges
// reflect instantaneous pool sizing; counters are monotonic since pool start.
func (c *PoolCollector) Collect(ch chan<- prometheus.Metric) {
	s := c.snapshot()

	ch <- prometheus.MustNewConstMetric(c.totalConns, prometheus.GaugeValue, float64(s.TotalConns))
	ch <- prometheus.MustNewConstMetric(c.idleConns, prometheus.GaugeValue, float64(s.IdleConns))
	ch <- prometheus.MustNewConstMetric(c.acquiredConns, prometheus.GaugeValue, float64(s.AcquiredConns))
	ch <- prometheus.MustNewConstMetric(c.maxConns, prometheus.GaugeValue, float64(s.MaxConns))

	ch <- prometheus.MustNewConstMetric(c.acquireTotal, prometheus.CounterValue, float64(s.AcquireCount))
	ch <- prometheus.MustNewConstMetric(c.emptyAcquireTotal, prometheus.CounterValue, float64(s.EmptyAcquireCount))
	ch <- prometheus.MustNewConstMetric(c.canceledAcquireTotal, prometheus.CounterValue, float64(s.CanceledAcquireCount))
}
