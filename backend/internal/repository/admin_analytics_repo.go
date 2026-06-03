package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActiveUserMetrics struct {
	DAU int64 `db:"dau" json:"dau"`
	WAU int64 `db:"wau" json:"wau"`
	MAU int64 `db:"mau" json:"mau"`
}

// AnalyticsFeatureAdoption matches the frontend FeatureAdoption type in
// frontend/src/lib/api/admin.ts: { feature, adoption_pct, active_users }.
type AnalyticsFeatureAdoption struct {
	Feature     string  `db:"feature" json:"feature"`
	AdoptionPct float64 `db:"adoption_pct" json:"adoption_pct"`
	ActiveUsers int64   `db:"active_users" json:"active_users"`
}

// GrowthTimeSeriesPoint is one daily bucket in the growth chart. Match
// to frontend GrowthMetrics.timeseries[i]: { date, new_users, cumulative }.
type GrowthTimeSeriesPoint struct {
	Date       time.Time `db:"date" json:"date"`
	NewUsers   int64     `db:"new_users" json:"new_users"`
	Cumulative int64     `db:"cumulative" json:"cumulative"`
}

// ---------------------------------------------------------------------------
// Repo
// ---------------------------------------------------------------------------

type AdminAnalyticsRepo struct {
	pool *pgxpool.Pool
}

func NewAdminAnalyticsRepo(pool *pgxpool.Pool) *AdminAnalyticsRepo {
	return &AdminAnalyticsRepo{pool: pool}
}

// GetActiveUsers reports distinct active users by time window, using
// users.last_login_at (added in migration 058) as the activity signal.
// The legacy implementation referenced u.last_active_at, which never
// existed in the schema — every active-user query failed at runtime.
func (r *AdminAnalyticsRepo) GetActiveUsers(ctx context.Context, date time.Time) (*ActiveUserMetrics, error) {
	var metrics ActiveUserMetrics
	err := r.pool.QueryRow(ctx, `
		SELECT
			COUNT(DISTINCT u.id) FILTER (WHERE u.last_login_at::date = $1::date) AS dau,
			COUNT(DISTINCT u.id) FILTER (WHERE u.last_login_at >= $1::date - INTERVAL '7 days') AS wau,
			COUNT(DISTINCT u.id) FILTER (WHERE u.last_login_at >= $1::date - INTERVAL '30 days') AS mau
		FROM users u
		WHERE u.status = 'active'`, date).Scan(
		&metrics.DAU, &metrics.WAU, &metrics.MAU)
	if err != nil {
		return nil, fmt.Errorf("active users: %w", err)
	}
	return &metrics, nil
}

// CountAssetsCreatedSince returns the number of assets created since the
// given instant. Used for the "Uploads Today" card on the engagement
// dashboard.
func (r *AdminAnalyticsRepo) CountAssetsCreatedSince(ctx context.Context, since time.Time) (int64, error) {
	var n int64
	err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM assets WHERE created_at >= $1 AND deleted_at IS NULL`, since).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("assets since: %w", err)
	}
	return n, nil
}

// CountGalleriesCreatedSince returns the number of galleries created
// since the given instant.
func (r *AdminAnalyticsRepo) CountGalleriesCreatedSince(ctx context.Context, since time.Time) (int64, error) {
	var n int64
	err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM galleries WHERE created_at >= $1 AND deleted_at IS NULL`, since).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("galleries since: %w", err)
	}
	return n, nil
}

// CountTotalUsers returns the total count of non-deleted users.
func (r *AdminAnalyticsRepo) CountTotalUsers(ctx context.Context) (int64, error) {
	var n int64
	err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM users WHERE status != 'deleted'`).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("total users: %w", err)
	}
	return n, nil
}

// CountUsersCreatedSince returns the number of users created since the
// given instant. Used for the "New This Week/Month" cards.
func (r *AdminAnalyticsRepo) CountUsersCreatedSince(ctx context.Context, since time.Time) (int64, error) {
	var n int64
	err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM users WHERE created_at >= $1 AND status != 'deleted'`, since).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("users since: %w", err)
	}
	return n, nil
}

// GetFeatureAdoption returns per-feature adoption stats keyed to the
// frontend FeatureAdoption shape. Only features whose underlying table
// actually exists in the current schema are reported; features that
// haven't been implemented yet (freelancer_profiles, gallery_invitations)
// are omitted rather than reported as zero, keeping the dashboard
// honest about what the platform actually offers today.
//
// Column sources:
//
//	galleries.created_by → distinct user count for "Client Galleries"
//	gear_listings.user_id → distinct user count for "Gear Marketplace"
//	messages.sender_id → distinct user count for "Messaging"
func (r *AdminAnalyticsRepo) GetFeatureAdoption(ctx context.Context) ([]AnalyticsFeatureAdoption, error) {
	rows, err := r.pool.Query(ctx, `
		WITH total_users AS (
			SELECT GREATEST(COUNT(*), 1) AS cnt
			FROM users WHERE status = 'active'
		),
		features AS (
			SELECT 'Client Galleries' AS feature,
			       COUNT(DISTINCT created_by)::bigint AS active_users
			FROM galleries
			WHERE created_by IS NOT NULL AND deleted_at IS NULL
			UNION ALL
			SELECT 'Gear Marketplace',
			       COUNT(DISTINCT user_id)::bigint
			FROM gear_listings
			WHERE user_id IS NOT NULL
			UNION ALL
			SELECT 'Messaging',
			       COUNT(DISTINCT sender_id)::bigint
			FROM messages
			WHERE sender_id IS NOT NULL AND deleted_at IS NULL
		)
		SELECT
			f.feature,
			f.active_users,
			ROUND((f.active_users::numeric / t.cnt) * 100, 2) AS adoption_pct
		FROM features f, total_users t
		ORDER BY f.active_users DESC`)
	if err != nil {
		return nil, fmt.Errorf("feature adoption: %w", err)
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[AnalyticsFeatureAdoption])
}

// GetUserGrowthTimeSeries returns a daily bucket of new user counts plus
// the cumulative total at each date. The cumulative column is computed
// on the DB side with a window function so the admin page can render
// the chart without further client-side maths.
func (r *AdminAnalyticsRepo) GetUserGrowthTimeSeries(ctx context.Context, from, to time.Time) ([]GrowthTimeSeriesPoint, error) {
	rows, err := r.pool.Query(ctx, `
		WITH daily AS (
			SELECT
				created_at::date AS date,
				COUNT(*)::bigint AS new_users
			FROM users
			WHERE created_at BETWEEN $1 AND $2
			  AND status != 'deleted'
			GROUP BY created_at::date
		),
		running AS (
			SELECT
				date,
				new_users,
				SUM(new_users) OVER (ORDER BY date ASC)::bigint AS cumulative
			FROM daily
		)
		SELECT date, new_users, cumulative
		FROM running
		ORDER BY date ASC`, from, to)
	if err != nil {
		return nil, fmt.Errorf("user growth series: %w", err)
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[GrowthTimeSeriesPoint])
}
