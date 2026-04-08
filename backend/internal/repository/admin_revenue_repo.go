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

type RevenueMetrics struct {
	MRR       int64   `db:"mrr"`        // paisa
	ARR       int64   `db:"arr"`        // paisa
	ChurnRate float64 `db:"churn_rate"` // percentage
	LTV       int64   `db:"ltv"`        // paisa
	ARPU      int64   `db:"arpu"`       // paisa
}

type RevenueTimeSeries struct {
	Date          time.Time `db:"date"`
	Revenue       int64     `db:"revenue"`        // paisa
	Subscriptions int64     `db:"subscriptions"`
	Churn         int64     `db:"churn"`
}

type StateRevenue struct {
	StateID         uuid.UUID `db:"state_id"`
	StateName       string    `db:"state_name"`
	Revenue         int64     `db:"revenue"` // paisa
	SubscriberCount int64     `db:"subscriber_count"`
}

// ---------------------------------------------------------------------------
// Repo
// ---------------------------------------------------------------------------

type AdminRevenueRepo struct {
	pool *pgxpool.Pool
}

func NewAdminRevenueRepo(pool *pgxpool.Pool) *AdminRevenueRepo {
	return &AdminRevenueRepo{pool: pool}
}

func (r *AdminRevenueRepo) GetMetrics(ctx context.Context, from time.Time, to time.Time, stateID *uuid.UUID) (*RevenueMetrics, error) {
	var metrics RevenueMetrics

	stateFilter := ""
	args := []interface{}{from, to}
	if stateID != nil {
		stateFilter = "AND s.state_id = $3"
		args = append(args, *stateID)
	}

	// MRR from active subscriptions
	err := r.pool.QueryRow(ctx, fmt.Sprintf(`
		SELECT
			COALESCE(SUM(s.amount_paisa), 0) AS mrr,
			COALESCE(SUM(s.amount_paisa), 0) * 12 AS arr,
			CASE
				WHEN COUNT(*) FILTER (WHERE s.status = 'active') = 0 THEN 0
				ELSE ROUND(
					COUNT(*) FILTER (WHERE s.status = 'churned' AND s.cancelled_at BETWEEN $1 AND $2)::numeric /
					NULLIF(COUNT(*) FILTER (WHERE s.created_at < $2), 0)::numeric * 100, 2
				)
			END AS churn_rate,
			CASE
				WHEN COUNT(*) FILTER (WHERE s.status = 'active') = 0 THEN 0
				ELSE COALESCE(SUM(p.amount_paisa) / NULLIF(COUNT(DISTINCT s.user_id), 0), 0)
			END AS ltv,
			CASE
				WHEN COUNT(DISTINCT s.user_id) FILTER (WHERE s.status = 'active') = 0 THEN 0
				ELSE COALESCE(SUM(s.amount_paisa) FILTER (WHERE s.status = 'active') / NULLIF(COUNT(DISTINCT s.user_id) FILTER (WHERE s.status = 'active'), 0), 0)
			END AS arpu
		FROM subscriptions s
		LEFT JOIN payments p ON p.subscription_id = s.id AND p.status = 'completed'
		WHERE s.created_at <= $2 %s`, stateFilter), args...).Scan(
		&metrics.MRR, &metrics.ARR, &metrics.ChurnRate, &metrics.LTV, &metrics.ARPU)
	if err != nil {
		return nil, fmt.Errorf("revenue metrics: %w", err)
	}

	return &metrics, nil
}

func (r *AdminRevenueRepo) GetTimeSeries(ctx context.Context, from time.Time, to time.Time, granularity string) ([]RevenueTimeSeries, error) {
	truncFunc := "day"
	switch granularity {
	case "week":
		truncFunc = "week"
	case "month":
		truncFunc = "month"
	}

	rows, err := r.pool.Query(ctx, fmt.Sprintf(`
		SELECT
			date_trunc('%s', p.created_at)::date AS date,
			COALESCE(SUM(p.amount_paisa), 0) AS revenue,
			COUNT(DISTINCT s.id) AS subscriptions,
			COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'churned' AND s.cancelled_at >= date_trunc('%s', p.created_at)) AS churn
		FROM payments p
		JOIN subscriptions s ON s.id = p.subscription_id
		WHERE p.status = 'completed'
		  AND p.created_at BETWEEN $1 AND $2
		GROUP BY date
		ORDER BY date ASC`, truncFunc, truncFunc), from, to)
	if err != nil {
		return nil, fmt.Errorf("revenue time series: %w", err)
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[RevenueTimeSeries])
}

func (r *AdminRevenueRepo) GetByState(ctx context.Context, from time.Time, to time.Time) ([]StateRevenue, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT
			st.id AS state_id,
			st.name AS state_name,
			COALESCE(SUM(p.amount_paisa), 0) AS revenue,
			COUNT(DISTINCT s.user_id) AS subscriber_count
		FROM states st
		LEFT JOIN subscriptions s ON s.state_id = st.id AND s.status = 'active'
		LEFT JOIN payments p ON p.subscription_id = s.id AND p.status = 'completed' AND p.created_at BETWEEN $1 AND $2
		GROUP BY st.id, st.name
		ORDER BY revenue DESC`, from, to)
	if err != nil {
		return nil, fmt.Errorf("revenue by state: %w", err)
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[StateRevenue])
}

func (r *AdminRevenueRepo) RefreshViews(ctx context.Context) error {
	views := []string{
		"mv_revenue_mrr",
		"mv_revenue_arr",
		"mv_bi_daily_active",
	}
	for _, v := range views {
		_, err := r.pool.Exec(ctx, fmt.Sprintf("REFRESH MATERIALIZED VIEW CONCURRENTLY %s", v))
		if err != nil {
			// View might not exist yet — log but don't fail hard.
			return fmt.Errorf("refresh view %s: %w", v, err)
		}
	}
	return nil
}