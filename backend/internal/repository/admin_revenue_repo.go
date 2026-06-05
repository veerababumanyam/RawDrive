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
	MRR              int64   `db:"mrr"`               // paisa
	ARR              int64   `db:"arr"`               // paisa
	ChurnRate        float64 `db:"churn_rate"`        // percentage
	LTV              int64   `db:"ltv"`               // paisa
	ARPU             int64   `db:"arpu"`              // paisa
	TotalSubscribers int64   `db:"total_subscribers"` // unique active users
}

// RevenueTimeSeries matches the frontend contract in
// frontend/src/lib/api/admin.ts (period / revenue_paisa / subscribers).
// Period is a pre-formatted "YYYY-MM" (or "YYYY-Www", or "YYYY-MM-DD"
// depending on granularity) string so the UI can render it directly
// without reparsing a time.Time. Without these JSON tags Go's default
// encoder emits PascalCase keys that the frontend silently ignores —
// that's why Module P12 on the revenue dashboard was showing ₹NaN.
type RevenueTimeSeries struct {
	Period      string `db:"period" json:"period"`
	Revenue     int64  `db:"revenue" json:"revenue_paisa"`
	Subscribers int64  `db:"subscriptions" json:"subscribers"`
	Churn       int64  `db:"churn" json:"churn"`
}

// StateRevenue is the JSON shape the frontend revenue page renders
// under state_breakdown — matches frontend RevenueData.state_breakdown
// in lib/api/admin.ts (state_name + revenue_paisa + subscriber_count).
// state_id is intentionally omitted: states.id is INT in the real
// schema (migration 005), the frontend does not read it, and keeping
// it on the struct would force an INT → UUID scan which fails.
type StateRevenue struct {
	StateName       string `db:"state_name" json:"state_name"`
	Revenue         int64  `db:"revenue" json:"revenue_paisa"`
	SubscriberCount int64  `db:"subscriber_count" json:"subscriber_count"`
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

	// Metrics computed from subscriptions only. The legacy version of
	// this query also joined payments.subscription_id, but the real
	// payments table (M14 commerce) uses invoice_id — there is no
	// subscription_id column. LTV is derived from amount_paisa on the
	// subscription row rather than cumulative payments until the
	// billing subsystem wires subscription-linked payment history.
	err := r.pool.QueryRow(ctx, fmt.Sprintf(`
		SELECT
			COALESCE(SUM(s.amount_paisa) FILTER (WHERE s.status = 'active' AND s.tier_slug != 'free'), 0) AS mrr,
			COALESCE(SUM(
				CASE WHEN COALESCE(s.billing_interval, 'monthly') = 'annual'
					THEN s.amount_paisa
					ELSE s.amount_paisa * 12
				END
			) FILTER (WHERE s.status = 'active' AND s.tier_slug != 'free'), 0) AS arr,
			CASE
				WHEN COUNT(*) FILTER (WHERE s.status = 'active' AND s.tier_slug != 'free') = 0 THEN 0
				ELSE ROUND(
					COUNT(*) FILTER (WHERE s.status = 'churned' AND s.tier_slug != 'free' AND s.cancelled_at BETWEEN $1 AND $2)::numeric /
					NULLIF(COUNT(*) FILTER (WHERE s.created_at < $2 AND s.tier_slug != 'free'), 0)::numeric * 100, 2
				)
			END AS churn_rate,
			COALESCE(SUM(s.amount_paisa) FILTER (WHERE s.status = 'active' AND s.tier_slug != 'free'), 0) AS ltv,
			CASE
				WHEN COUNT(DISTINCT s.user_id) FILTER (WHERE s.status = 'active' AND s.tier_slug != 'free') = 0 THEN 0
				-- SUM(bigint) returns numeric in Postgres, so without the ::bigint
				-- cast this division is NUMERIC division and yields a fractional
				-- value (e.g. 133233.33) that fails to scan into the int64 ARPU
				-- field ("cannot convert ... to integer") → handler 500. Casting
				-- the sum to bigint restores the intended integer (paisa) division.
				ELSE COALESCE(SUM(s.amount_paisa) FILTER (WHERE s.status = 'active' AND s.tier_slug != 'free')::bigint / NULLIF(COUNT(DISTINCT s.user_id) FILTER (WHERE s.status = 'active' AND s.tier_slug != 'free'), 0), 0)
			END AS arpu,
			COALESCE(COUNT(DISTINCT s.user_id) FILTER (WHERE s.status = 'active' AND s.tier_slug != 'free'), 0) AS total_subscribers
		FROM subscriptions s
		WHERE s.created_at <= $2 %s`, stateFilter), args...).Scan(
		&metrics.MRR, &metrics.ARR, &metrics.ChurnRate, &metrics.LTV, &metrics.ARPU, &metrics.TotalSubscribers)
	if err != nil {
		return nil, fmt.Errorf("revenue metrics: %w", err)
	}

	return &metrics, nil
}

func (r *AdminRevenueRepo) GetTimeSeries(ctx context.Context, from time.Time, to time.Time, granularity string) ([]RevenueTimeSeries, error) {
	// truncFunc picks the date_trunc bucket; periodFmt picks a to_char
	// pattern that matches the frontend's UX (monthly = "2026-04",
	// weekly = "2026-W15", daily = "2026-04-12"). Keeping the formatting
	// in SQL lets us skip an extra round-trip through time.Time on the
	// Go side and keeps the JSON payload a human-readable string.
	truncFunc := "day"
	periodFmt := "YYYY-MM-DD"
	switch granularity {
	case "week":
		truncFunc = "week"
		periodFmt = `IYYY-"W"IW`
	case "month", "monthly":
		truncFunc = "month"
		periodFmt = "YYYY-MM"
	}

	// Time-series computed from subscription created_at/cancelled_at
	// rather than joining payments.subscription_id (which does not
	// exist — see GetMetrics comment). Revenue is bucketed by
	// subscription start date using the subscription's amount_paisa.
	rows, err := r.pool.Query(ctx, fmt.Sprintf(`
		SELECT
			to_char(date_trunc('%s', s.created_at), '%s') AS period,
			COALESCE(SUM(s.amount_paisa), 0) AS revenue,
			COUNT(DISTINCT s.user_id) AS subscriptions,
			COUNT(DISTINCT s.user_id) FILTER (WHERE s.status = 'churned' AND s.cancelled_at >= date_trunc('%s', s.created_at)) AS churn
		FROM subscriptions s
		WHERE s.created_at BETWEEN $1 AND $2
			AND s.tier_slug != 'free'
		GROUP BY date_trunc('%s', s.created_at)
		ORDER BY date_trunc('%s', s.created_at) ASC`, truncFunc, periodFmt, truncFunc, truncFunc, truncFunc), from, to)
	if err != nil {
		return nil, fmt.Errorf("revenue time series: %w", err)
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[RevenueTimeSeries])
}

func (r *AdminRevenueRepo) GetByState(ctx context.Context, from time.Time, to time.Time) ([]StateRevenue, error) {
	// State breakdown computed from active subscriptions only. The
	// legacy join against payments.subscription_id has been removed
	// (no such column exists on the M14 commerce payments table).
	// Signature keeps from/to for stability but this is an active
	// snapshot, not a time-range query.
	_ = from
	_ = to
	rows, err := r.pool.Query(ctx, `
		SELECT
			st.name AS state_name,
			COALESCE(SUM(s.amount_paisa), 0) AS revenue,
			COUNT(DISTINCT s.user_id) AS subscriber_count
		FROM states st
		LEFT JOIN subscriptions s ON s.state_id = st.id AND s.status = 'active' AND s.tier_slug != 'free'
		GROUP BY st.id, st.name
		ORDER BY revenue DESC`)
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
