package ai

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SpendRepo handles ai_usage_logs table operations.
type SpendRepo struct {
	pool *pgxpool.Pool
}

// NewSpendRepo creates a SpendRepo.
func NewSpendRepo(pool *pgxpool.Pool) *SpendRepo {
	return &SpendRepo{pool: pool}
}

// LogUsage inserts a single AI usage record.
func (r *SpendRepo) LogUsage(ctx context.Context, log *AIUsageLog) error {
	if log.ID == uuid.Nil {
		log.ID = uuid.New()
	}
	log.CreatedAt = time.Now()

	_, err := r.pool.Exec(ctx,
		`INSERT INTO ai_usage_logs (id, workspace_id, operation, model, input_tokens,
		 output_tokens, cost_estimate_paisa, asset_id, job_id, created_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		log.ID, log.WorkspaceID, log.Operation, log.Model,
		log.InputTokens, log.OutputTokens, log.CostEstimatePaisa,
		log.AssetID, log.JobID, log.CreatedAt)
	if err != nil {
		return fmt.Errorf("spend repo: log usage: %w", err)
	}
	return nil
}

// GetMonthlySummary returns aggregated spend for a workspace in the month containing refTime.
func (r *SpendRepo) GetMonthlySummary(ctx context.Context, workspaceID uuid.UUID, refTime time.Time) (*SpendSummary, error) {
	monthStart := time.Date(refTime.Year(), refTime.Month(), 1, 0, 0, 0, 0, time.UTC)
	monthEnd := monthStart.AddDate(0, 1, 0).Add(-time.Nanosecond)

	summary := &SpendSummary{
		WorkspaceID: workspaceID,
		PeriodStart: monthStart,
		PeriodEnd:   monthEnd,
		ByOperation: make(map[string]int64),
	}

	rows, err := r.pool.Query(ctx,
		`SELECT operation, COALESCE(SUM(cost_estimate_paisa), 0)
		 FROM ai_usage_logs
		 WHERE workspace_id = $1 AND created_at >= $2 AND created_at <= $3
		 GROUP BY operation`, workspaceID, monthStart, monthEnd)
	if err != nil {
		return nil, fmt.Errorf("spend repo: monthly summary: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var op string
		var cost int64
		if err := rows.Scan(&op, &cost); err != nil {
			return nil, fmt.Errorf("spend repo: scan: %w", err)
		}
		summary.ByOperation[op] = cost
		summary.TotalPaisa += cost
	}

	return summary, rows.Err()
}

// GetDailySpend returns per-day aggregated spend in the given date range.
func (r *SpendRepo) GetDailySpend(ctx context.Context, workspaceID uuid.UUID, from, to time.Time) ([]DailySpend, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT date_trunc('day', created_at)::date AS day, operation,
		 COALESCE(SUM(cost_estimate_paisa), 0) AS cost
		 FROM ai_usage_logs
		 WHERE workspace_id = $1 AND created_at >= $2 AND created_at < $3
		 GROUP BY day, operation
		 ORDER BY day ASC`, workspaceID, from, to.AddDate(0, 0, 1))
	if err != nil {
		return nil, fmt.Errorf("spend repo: daily spend: %w", err)
	}
	defer rows.Close()

	dayMap := make(map[string]*DailySpend)
	for rows.Next() {
		var day time.Time
		var op string
		var cost int64
		if err := rows.Scan(&day, &op, &cost); err != nil {
			return nil, fmt.Errorf("spend repo: scan daily: %w", err)
		}
		key := day.Format("2006-01-02")
		ds, ok := dayMap[key]
		if !ok {
			ds = &DailySpend{Date: day, ByOperation: make(map[string]int64)}
			dayMap[key] = ds
		}
		ds.ByOperation[op] = cost
		ds.TotalPaisa += cost
	}

	var result []DailySpend
	for _, ds := range dayMap {
		result = append(result, *ds)
	}
	return result, rows.Err()
}
