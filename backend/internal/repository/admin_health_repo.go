package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type HealthStatus struct {
	ServiceName string    `db:"service_name" json:"service_name"`
	Status      string    `db:"status" json:"status"`
	Uptime      float64   `db:"uptime" json:"uptime"`
	LastCheck   time.Time `db:"last_check" json:"last_check"`
}

type MetricPoint struct {
	Timestamp time.Time `db:"timestamp" json:"timestamp"`
	Value     float64   `db:"value" json:"value"`
	Unit      string    `db:"unit" json:"unit"`
}

// AlertThreshold mirrors the real schema in migration 033 —
// alert_thresholds(id, metric_type, service_name, warning_threshold,
// critical_threshold, enabled, created_at, updated_at). The previous
// shape (operator/threshold/severity) never matched the table and every
// SELECT against it failed at runtime.
type AlertThreshold struct {
	ID                uuid.UUID `db:"id" json:"id"`
	MetricType        string    `db:"metric_type" json:"metric_type"`
	ServiceName       *string   `db:"service_name" json:"service_name,omitempty"`
	WarningThreshold  float64   `db:"warning_threshold" json:"warning_threshold"`
	CriticalThreshold float64   `db:"critical_threshold" json:"critical_threshold"`
	Enabled           bool      `db:"enabled" json:"enabled"`
}

// SystemSummary is the flat aggregate returned by GET /api/v1/admin/system/metrics.
// Field shape matches the frontend SystemMetrics TypeScript interface
// (frontend/src/lib/api/admin.ts) so the admin System Health page can
// render it directly without additional client-side mapping.
type SystemSummary struct {
	APILatencyP50Ms  float64 `json:"api_latency_p50_ms"`
	APILatencyP95Ms  float64 `json:"api_latency_p95_ms"`
	APILatencyP99Ms  float64 `json:"api_latency_p99_ms"`
	ErrorRatePct     float64 `json:"error_rate_pct"`
	QueueDepth       int64   `json:"queue_depth"`
	StorageUsedBytes int64   `json:"storage_used_bytes"`
	CPUUsagePct      float64 `json:"cpu_usage_pct"`
	MemoryUsagePct   float64 `json:"memory_usage_pct"`
	DiskUsagePct     float64 `json:"disk_usage_pct"`
	UptimeSeconds    int64   `json:"uptime_seconds"`
}

// ---------------------------------------------------------------------------
// Repo
// ---------------------------------------------------------------------------

type AdminHealthRepo struct {
	pool *pgxpool.Pool
}

func NewAdminHealthRepo(pool *pgxpool.Pool) *AdminHealthRepo {
	return &AdminHealthRepo{pool: pool}
}

func (r *AdminHealthRepo) InsertMetric(ctx context.Context, serviceName string, metricType string, value float64, unit string, endpoint *string) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO system_metrics (id, service_name, metric_type, value, unit, endpoint, recorded_at)
		VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
		uuid.New(), serviceName, metricType, value, unit, endpoint)
	if err != nil {
		return fmt.Errorf("insert metric: %w", err)
	}
	return nil
}

func (r *AdminHealthRepo) GetLatestMetrics(ctx context.Context, serviceName string) ([]MetricPoint, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT DISTINCT ON (metric_type)
			recorded_at AS timestamp,
			value,
			unit
		FROM system_metrics
		WHERE service_name = $1
		ORDER BY metric_type, recorded_at DESC`, serviceName)
	if err != nil {
		return nil, fmt.Errorf("latest metrics: %w", err)
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[MetricPoint])
}

func (r *AdminHealthRepo) GetMetricTimeSeries(ctx context.Context, serviceName string, metricType string, from time.Time, to time.Time) ([]MetricPoint, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT
			recorded_at AS timestamp,
			value,
			unit
		FROM system_metrics
		WHERE service_name = $1 AND metric_type = $2
		  AND recorded_at BETWEEN $3 AND $4
		ORDER BY recorded_at ASC`, serviceName, metricType, from, to)
	if err != nil {
		return nil, fmt.Errorf("metric time series: %w", err)
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[MetricPoint])
}

// GetLatestValueByType returns the most recent value for a given metric
// type across all services, or 0 when no rows exist. Used by
// GetSystemSummary to assemble the flat aggregate snapshot.
func (r *AdminHealthRepo) GetLatestValueByType(ctx context.Context, metricType string) (float64, error) {
	var value float64
	err := r.pool.QueryRow(ctx, `
		SELECT COALESCE(
			(SELECT value FROM system_metrics
			 WHERE metric_type = $1
			 ORDER BY recorded_at DESC LIMIT 1),
			0)`, metricType).Scan(&value)
	if err != nil {
		return 0, fmt.Errorf("latest %s: %w", metricType, err)
	}
	return value, nil
}

// GetTotalStorageUsed sums size_bytes across all non-deleted assets.
// Used as a live value for the storage_used_bytes field in SystemSummary.
// There is no denormalized storage_used column on users; the assets
// table is the source of truth.
func (r *AdminHealthRepo) GetTotalStorageUsed(ctx context.Context) (int64, error) {
	var total int64
	err := r.pool.QueryRow(ctx,
		`SELECT COALESCE(SUM(size_bytes), 0) FROM assets WHERE deleted_at IS NULL`).Scan(&total)
	if err != nil {
		return 0, fmt.Errorf("total storage: %w", err)
	}
	return total, nil
}

func (r *AdminHealthRepo) GetAlertThresholds(ctx context.Context) ([]AlertThreshold, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, metric_type, service_name, warning_threshold, critical_threshold, enabled
		FROM alert_thresholds
		WHERE enabled = true
		ORDER BY service_name NULLS LAST, metric_type`)
	if err != nil {
		return nil, fmt.Errorf("alert thresholds: %w", err)
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[AlertThreshold])
}

func (r *AdminHealthRepo) PruneOldMetrics(ctx context.Context, olderThan time.Time) (int64, error) {
	tag, err := r.pool.Exec(ctx,
		`DELETE FROM system_metrics WHERE recorded_at < $1`, olderThan)
	if err != nil {
		return 0, fmt.Errorf("prune metrics: %w", err)
	}
	return tag.RowsAffected(), nil
}
