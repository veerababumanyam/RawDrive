package service

import (
	"context"
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

type AdminHealthService struct {
	healthRepo *repository.AdminHealthRepo
}

func NewAdminHealthService(healthRepo *repository.AdminHealthRepo) *AdminHealthService {
	return &AdminHealthService{healthRepo: healthRepo}
}

func (s *AdminHealthService) GetMetrics(ctx context.Context, serviceName, metricType string, from, to time.Time) ([]repository.MetricPoint, error) {
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
