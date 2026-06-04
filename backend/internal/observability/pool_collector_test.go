package observability

import (
	"strings"
	"testing"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/testutil"
)

// fakeSnapshot returns a fixed PoolStats so the collector can be exercised
// without a live *pgxpool.Pool. The values are chosen to be distinct so a
// mis-wired metric (e.g. reading IdleConns into total_conns) is caught.
func fakeSnapshot() PoolStats {
	return PoolStats{
		TotalConns:           7,
		IdleConns:            3,
		AcquiredConns:        4,
		MaxConns:             10,
		AcquireCount:         123,
		EmptyAcquireCount:    5,
		CanceledAcquireCount: 2,
	}
}

func TestPoolCollector_CollectAndCompare(t *testing.T) {
	c := NewPoolCollector(fakeSnapshot)

	reg := prometheus.NewRegistry()
	if err := reg.Register(c); err != nil {
		t.Fatalf("register collector: %v", err)
	}

	const expected = `
# HELP rawdrive_pgxpool_acquire_total Cumulative count of successful connection acquisitions from the pgx pool.
# TYPE rawdrive_pgxpool_acquire_total counter
rawdrive_pgxpool_acquire_total 123
# HELP rawdrive_pgxpool_acquired_conns Number of currently acquired (in-use) connections in the pgx pool.
# TYPE rawdrive_pgxpool_acquired_conns gauge
rawdrive_pgxpool_acquired_conns 4
# HELP rawdrive_pgxpool_canceled_acquire_total Cumulative count of acquisitions canceled by a context before completing.
# TYPE rawdrive_pgxpool_canceled_acquire_total counter
rawdrive_pgxpool_canceled_acquire_total 2
# HELP rawdrive_pgxpool_empty_acquire_total Cumulative count of acquisitions that had to wait because the pgx pool was empty.
# TYPE rawdrive_pgxpool_empty_acquire_total counter
rawdrive_pgxpool_empty_acquire_total 5
# HELP rawdrive_pgxpool_idle_conns Number of currently idle connections in the pgx pool.
# TYPE rawdrive_pgxpool_idle_conns gauge
rawdrive_pgxpool_idle_conns 3
# HELP rawdrive_pgxpool_max_conns Maximum size of the pgx pool.
# TYPE rawdrive_pgxpool_max_conns gauge
rawdrive_pgxpool_max_conns 10
# HELP rawdrive_pgxpool_total_conns Total number of connections currently in the pgx pool (idle + acquired + constructing).
# TYPE rawdrive_pgxpool_total_conns gauge
rawdrive_pgxpool_total_conns 7
`

	if err := testutil.CollectAndCompare(c, strings.NewReader(expected)); err != nil {
		t.Fatalf("unexpected metrics: %v", err)
	}
}

func TestPoolCollector_AllSevenMetricsPresent(t *testing.T) {
	c := NewPoolCollector(fakeSnapshot)

	wantNames := []string{
		"rawdrive_pgxpool_total_conns",
		"rawdrive_pgxpool_idle_conns",
		"rawdrive_pgxpool_acquired_conns",
		"rawdrive_pgxpool_max_conns",
		"rawdrive_pgxpool_acquire_total",
		"rawdrive_pgxpool_empty_acquire_total",
		"rawdrive_pgxpool_canceled_acquire_total",
	}

	got := testutil.CollectAndCount(c)
	if got != len(wantNames) {
		t.Fatalf("expected %d metrics, collected %d", len(wantNames), got)
	}

	for _, name := range wantNames {
		if n := testutil.CollectAndCount(c, name); n != 1 {
			t.Errorf("metric %q: expected 1 sample, got %d", name, n)
		}
	}
}

func TestPoolCollector_ValuesPerMetric(t *testing.T) {
	c := NewPoolCollector(fakeSnapshot)

	cases := map[string]float64{
		"rawdrive_pgxpool_total_conns":            7,
		"rawdrive_pgxpool_idle_conns":             3,
		"rawdrive_pgxpool_acquired_conns":         4,
		"rawdrive_pgxpool_max_conns":              10,
		"rawdrive_pgxpool_acquire_total":          123,
		"rawdrive_pgxpool_empty_acquire_total":    5,
		"rawdrive_pgxpool_canceled_acquire_total": 2,
	}

	for name, want := range cases {
		if got := testutil.ToFloat64(collectorForMetric(c, name)); got != want {
			t.Errorf("metric %q = %v, want %v", name, got, want)
		}
	}
}

// collectorForMetric returns a single-metric view of the PoolCollector so
// testutil.ToFloat64 (which requires exactly one sample) can read each gauge
// or counter individually.
func collectorForMetric(c *PoolCollector, name string) prometheus.Collector {
	return singleMetricCollector{c: c, name: name}
}

type singleMetricCollector struct {
	c    *PoolCollector
	name string
}

func (s singleMetricCollector) Describe(ch chan<- *prometheus.Desc) {}

func (s singleMetricCollector) Collect(ch chan<- prometheus.Metric) {
	inner := make(chan prometheus.Metric, 16)
	go func() {
		s.c.Collect(inner)
		close(inner)
	}()
	for m := range inner {
		if strings.Contains(m.Desc().String(), `"`+s.name+`"`) {
			ch <- m
		}
	}
}
