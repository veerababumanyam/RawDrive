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

// RevenueRecord is the district-level revenue record shown on the admin
// dashboard when a super-admin filters revenue by state/district.
type RevenueRecord struct {
	StateID         int    `db:"state_id" json:"state_id"`
	StateName       string `db:"state_name" json:"state_name"`
	District        string `db:"district" json:"district"`
	Revenue         int64  `db:"revenue" json:"revenue_paisa"`
	SubscriberCount int64  `db:"subscriber_count" json:"subscriber_count"`
}

// RevenueReportDealer is the approved dealer who should receive a shared
// revenue report for a state.
type RevenueReportDealer struct {
	DealerID          uuid.UUID `db:"dealer_id" json:"dealer_id"`
	BusinessName      string    `db:"business_name" json:"business_name"`
	Email             string    `db:"email" json:"email"`
	CommissionRatePct float64   `db:"commission_rate_pct" json:"commission_rate_pct"`
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
	//
	// A subscription's state lives on its WORKSPACE, not the subscription row:
	// subscriptions.state_id is NULL on every real (revenue-bearing) subscription
	// and is only populated on comped/test rows, so the old `s.state_id = st.id`
	// join dropped all real revenue and every state reported ₹0. Route attribution
	// through subscriptions.workspace_id → workspaces.state_id instead. Subscriptions
	// without a workspace (or whose workspace has no state) are unattributable and
	// fall out — you can't bill a state you can't identify.
	_ = from
	_ = to
	rows, err := r.pool.Query(ctx, `
		SELECT
			st.name AS state_name,
			COALESCE(SUM(s.amount_paisa), 0) AS revenue,
			COUNT(DISTINCT s.user_id) AS subscriber_count
		FROM states st
		LEFT JOIN workspaces w ON w.state_id = st.id
		LEFT JOIN subscriptions s ON s.workspace_id = w.id AND s.status = 'active' AND s.tier_slug != 'free'
		GROUP BY st.id, st.name
		ORDER BY revenue DESC`)
	if err != nil {
		return nil, fmt.Errorf("revenue by state: %w", err)
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[StateRevenue])
}

func (r *AdminRevenueRepo) GetStateName(ctx context.Context, stateID int) (string, error) {
	var name string
	if err := r.pool.QueryRow(ctx,
		`SELECT name FROM states WHERE id = $1`, stateID,
	).Scan(&name); err != nil {
		if err == pgx.ErrNoRows {
			return "", ErrNotFound
		}
		return "", fmt.Errorf("revenue state lookup: %w", err)
	}
	return name, nil
}

func (r *AdminRevenueRepo) GetApprovedDealerForState(ctx context.Context, stateID int, defaultCommissionRatePct float64) (*RevenueReportDealer, error) {
	var dealer RevenueReportDealer
	err := r.pool.QueryRow(ctx, `
		SELECT
			d.id AS dealer_id,
			d.business_name,
			COALESCE(u.email, '') AS email,
			COALESCE(d.commission_rate_pct, $2) AS commission_rate_pct
		FROM dealers d
		LEFT JOIN users u ON u.id = d.user_id
		WHERE d.state_id = $1
			AND d.status = 'approved'
			AND d.deleted_at IS NULL
		ORDER BY
			CASE d.territory_type
				WHEN 'primary' THEN 0
				WHEN 'secondary' THEN 1
				ELSE 2
			END,
			d.approved_at DESC NULLS LAST,
			d.created_at DESC
		LIMIT 1`, stateID, defaultCommissionRatePct,
	).Scan(&dealer.DealerID, &dealer.BusinessName, &dealer.Email, &dealer.CommissionRatePct)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("approved dealer for revenue report: %w", err)
	}
	return &dealer, nil
}

func (r *AdminRevenueRepo) GetRecordsByStateDistrict(ctx context.Context, stateID int, district string) ([]RevenueRecord, error) {
	// Keep this on the same attribution path as GetByState:
	// subscription.workspace_id -> workspaces.state_id. District is optional
	// and comes from the workspace owner first, then the subscription user.
	rows, err := r.pool.Query(ctx, `
		WITH attributed AS (
			SELECT
				st.id AS state_id,
				st.name AS state_name,
				COALESCE(
					NULLIF(BTRIM(owner_user.district), ''),
					NULLIF(BTRIM(subscription_user.district), ''),
					'Unassigned'
				) AS district,
				s.amount_paisa,
				s.user_id
			FROM subscriptions s
			JOIN workspaces w ON w.id = s.workspace_id
			JOIN states st ON st.id = w.state_id
			LEFT JOIN users owner_user ON owner_user.id = w.owner_id
			LEFT JOIN users subscription_user ON subscription_user.id = s.user_id
			WHERE w.state_id = $1
				AND s.status = 'active'
				AND s.tier_slug != 'free'
		)
		SELECT
			state_id,
			state_name,
			district,
			COALESCE(SUM(amount_paisa), 0) AS revenue,
			COUNT(DISTINCT user_id) AS subscriber_count
		FROM attributed
		WHERE $2 = '' OR LOWER(district) = LOWER($2)
		GROUP BY state_id, state_name, district
		ORDER BY revenue DESC, district ASC`, stateID, district)
	if err != nil {
		return nil, fmt.Errorf("revenue records by state/district: %w", err)
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[RevenueRecord])
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
