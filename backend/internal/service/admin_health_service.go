package service

import (
	"context"
	"runtime"
	"time"

	"github.com/rawdrive/backend/internal/repository"
)

type SystemStatus struct {
	Overall   string          `json:"overall"`
	Services  []ServiceStatus `json:"services"`
	CheckedAt time.Time       `json:"checked_at"`
}

type ServiceStatus struct {
	Name    string  `json:"name"`
	Status  string  `json:"status"`
	Latency float64 `json:"latency_ms"`
}

// serviceStartupTime is set once at service construction so the uptime
// reported by GetSummary reflects actual process uptime. Using a struct
// field rather than a package-level var keeps the service testable and
// avoids coupling multiple processes to a single clock.
type AdminHealthService struct {
	healthRepo  *repository.AdminHealthRepo
	startupTime time.Time
}

func NewAdminHealthService(healthRepo *repository.AdminHealthRepo) *AdminHealthService {
	return &AdminHealthService{
		healthRepo:  healthRepo,
		startupTime: time.Now(),
	}
}

// GetSummary assembles the flat SystemSummary the frontend expects. It
// pulls the latest recorded value for each metric_type from
// system_metrics (returning 0 when no samples exist yet), falls back to
// a live workspace storage sum for storage_used_bytes, and computes
// uptime / memory usage from the running Go process. CPU and disk
// percentages are left at 0 pending a proper OS-level collector — they
// are accurate zeros (no data) rather than stale placeholders.
func (s *AdminHealthService) GetSummary(ctx context.Context) (*repository.SystemSummary, error) {
	summary := &repository.SystemSummary{}

	// Latest recorded percentile latencies. When the metrics collector
	// has never run these will all be 0, which the frontend renders as
	// "0 ms" — not ideal but honest. Once a collector populates the
	// table the same read path produces real numbers.
	for _, pair := range []struct {
		metric string
		field  *float64
	}{
		{"latency_p50", &summary.APILatencyP50Ms},
		{"latency_p95", &summary.APILatencyP95Ms},
		{"latency_p99", &summary.APILatencyP99Ms},
		{"error_rate", &summary.ErrorRatePct},
		{"cpu", &summary.CPUUsagePct},
		{"disk", &summary.DiskUsagePct},
	} {
		value, err := s.healthRepo.GetLatestValueByType(ctx, pair.metric)
		if err != nil {
			return nil, err
		}
		*pair.field = value
	}

	// queue_depth is stored as a float but reported as an integer count.
	queueFloat, err := s.healthRepo.GetLatestValueByType(ctx, "queue_depth")
	if err != nil {
		return nil, err
	}
	summary.QueueDepth = int64(queueFloat)

	// Storage: prefer live sum over users.storage_used so the number is
	// meaningful immediately, without waiting for a collector tick.
	storage, err := s.healthRepo.GetTotalStorageUsed(ctx)
	if err != nil {
		return nil, err
	}
	summary.StorageUsedBytes = storage

	// Uptime and Go heap memory are computed from the live process.
	summary.UptimeSeconds = int64(time.Since(s.startupTime).Seconds())
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)
	if mem.Sys > 0 {
		summary.MemoryUsagePct = float64(mem.HeapInuse) / float64(mem.Sys) * 100
	}

	return summary, nil
}

func (s *AdminHealthService) GetMetricsTimeSeries(ctx context.Context, serviceName, metricType string, from, to time.Time) ([]repository.MetricPoint, error) {
	return s.healthRepo.GetMetricTimeSeries(ctx, serviceName, metricType, from, to)
}

func (s *AdminHealthService) GetLatest(ctx context.Context, serviceName string) ([]repository.MetricPoint, error) {
	return s.healthRepo.GetLatestMetrics(ctx, serviceName)
}

func (s *AdminHealthService) GetAlertThresholds(ctx context.Context) ([]repository.AlertThreshold, error) {
	return s.healthRepo.GetAlertThresholds(ctx)
}

func (s *AdminHealthService) RecordMetric(ctx context.Context, serviceName, metricType string, value float64, unit string, endpoint *string) error {
	return s.healthRepo.InsertMetric(ctx, serviceName, metricType, value, unit, endpoint)
}
