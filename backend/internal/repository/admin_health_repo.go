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
	ServiceName string    `db:"service_name"`
	Status      string    `db:"status"`
	Uptime      float64   `db:"uptime"`
	LastCheck   time.Time `db:"last_check"`
}

type MetricPoint struct {
	Timestamp time.Time `db:"timestamp"`
	Value     float64   `db:"value"`
	Unit      string    `db:"unit"`
}

type AlertThreshold struct {
	ID          uuid.UUID `db:"id"`
	ServiceName string    `db:"service_name"`
	MetricType  string    `db:"metric_type"`
	Operator    string    `db:"operator"`
	Threshold   float64   `db:"threshold"`
	Severity    string    `db:"severity"`
	Enabled     bool      `db:"enabled"`
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
		INSERT INTO system_metrics (id, service_name, metric_type, value, unit, endpoint, created_at)
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
			created_at AS timestamp,
			value,
			unit
		FROM system_metrics
		WHERE service_name = $1
		ORDER BY metric_type, created_at DESC`, serviceName)
	if err != nil {
		return nil, fmt.Errorf("latest metrics: %w", err)
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[MetricPoint])
}

func (r *AdminHealthRepo) GetMetricTimeSeries(ctx context.Context, serviceName string, metricType string, from time.Time, to time.Time) ([]MetricPoint, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT
			created_at AS timestamp,
			value,
			unit
		FROM system_metrics
		WHERE service_name = $1 AND metric_type = $2
		  AND created_at BETWEEN $3 AND $4
		ORDER BY created_at ASC`, serviceName, metricType, from, to)
	if err != nil {
		return nil, fmt.Errorf("metric time series: %w", err)
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[MetricPoint])
}

func (r *AdminHealthRepo) GetAlertThresholds(ctx context.Context) ([]AlertThreshold, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, service_name, metric_type, operator, threshold, severity, enabled
		FROM alert_thresholds
		WHERE enabled = true
		ORDER BY service_name, metric_type`)
	if err != nil {
		return nil, fmt.Errorf("alert thresholds: %w", err)
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[AlertThreshold])
}

func (r *AdminHealthRepo) PruneOldMetrics(ctx context.Context, olderThan time.Time) (int64, error) {
	tag, err := r.pool.Exec(ctx,
		`DELETE FROM system_metrics WHERE created_at < $1`, olderThan)
	if err != nil {
		return 0, fmt.Errorf("prune metrics: %w", err)
	}
	return tag.RowsAffected(), nil
}