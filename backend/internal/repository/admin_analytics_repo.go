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

type ActiveUserMetrics struct {
	DAU int64 `db:"dau"`
	WAU int64 `db:"wau"`
	MAU int64 `db:"mau"`
}

type EngagementMetrics struct {
	Uploads           int64 `db:"uploads"`
	GalleriesCreated  int64 `db:"galleries_created"`
	ClientInvitations int64 `db:"client_invitations"`
}

type FeatureAdoption struct {
	FeatureName string  `db:"feature_name"`
	UserCount   int64   `db:"user_count"`
	Percentage  float64 `db:"percentage"`
}

type TimeSeriesPoint struct {
	Date  time.Time `db:"date"`
	Value int64     `db:"value"`
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

func (r *AdminAnalyticsRepo) GetActiveUsers(ctx context.Context, date time.Time, stateID *uuid.UUID) (*ActiveUserMetrics, error) {
	var metrics ActiveUserMetrics

	stateFilter := ""
	args := []interface{}{date, date, date}
	if stateID != nil {
		stateFilter = "AND u.state_id = $4"
		args = append(args, *stateID)
	}

	err := r.pool.QueryRow(ctx, fmt.Sprintf(`
		SELECT
			COUNT(DISTINCT u.id) FILTER (WHERE u.last_active_at::date = $1::date) AS dau,
			COUNT(DISTINCT u.id) FILTER (WHERE u.last_active_at >= $2::date - INTERVAL '7 days') AS wau,
			COUNT(DISTINCT u.id) FILTER (WHERE u.last_active_at >= $3::date - INTERVAL '30 days') AS mau
		FROM users u
		WHERE u.status = 'active' %s`, stateFilter), args...).Scan(
		&metrics.DAU, &metrics.WAU, &metrics.MAU)
	if err != nil {
		return nil, fmt.Errorf("active users: %w", err)
	}
	return &metrics, nil
}

func (r *AdminAnalyticsRepo) GetEngagement(ctx context.Context, from time.Time, to time.Time) (*EngagementMetrics, error) {
	var metrics EngagementMetrics

	err := r.pool.QueryRow(ctx, `
		SELECT
			(SELECT COUNT(*) FROM assets WHERE created_at BETWEEN $1 AND $2) AS uploads,
			(SELECT COUNT(*) FROM galleries WHERE created_at BETWEEN $1 AND $2) AS galleries_created,
			(SELECT COUNT(*) FROM gallery_invitations WHERE created_at BETWEEN $1 AND $2) AS client_invitations`,
		from, to).Scan(&metrics.Uploads, &metrics.GalleriesCreated, &metrics.ClientInvitations)
	if err != nil {
		return nil, fmt.Errorf("engagement metrics: %w", err)
	}
	return &metrics, nil
}

func (r *AdminAnalyticsRepo) GetFeatureAdoption(ctx context.Context) ([]FeatureAdoption, error) {
	rows, err := r.pool.Query(ctx, `
		WITH total_users AS (
			SELECT COUNT(*) AS cnt FROM users WHERE status = 'active'
		),
		features AS (
			SELECT 'galleries' AS feature_name,
				   COUNT(DISTINCT user_id) AS user_count
			FROM galleries
			UNION ALL
			SELECT 'client_proofing',
				   COUNT(DISTINCT g.user_id)
			FROM gallery_invitations gi
			JOIN galleries g ON g.id = gi.gallery_id
			UNION ALL
			SELECT 'freelancer_profile',
				   COUNT(DISTINCT user_id)
			FROM freelancer_profiles
			UNION ALL
			SELECT 'gear_listings',
				   COUNT(DISTINCT owner_id)
			FROM gear_listings
			UNION ALL
			SELECT 'messaging',
				   COUNT(DISTINCT sender_id)
			FROM messages
		)
		SELECT
			f.feature_name,
			f.user_count,
			ROUND(f.user_count::numeric / NULLIF(t.cnt, 0) * 100, 2) AS percentage
		FROM features f, total_users t
		ORDER BY f.user_count DESC`)
	if err != nil {
		return nil, fmt.Errorf("feature adoption: %w", err)
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[FeatureAdoption])
}

func (r *AdminAnalyticsRepo) GetUserGrowthTimeSeries(ctx context.Context, from time.Time, to time.Time) ([]TimeSeriesPoint, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT
			created_at::date AS date,
			COUNT(*) AS value
		FROM users
		WHERE created_at BETWEEN $1 AND $2
		GROUP BY date
		ORDER BY date ASC`, from, to)
	if err != nil {
		return nil, fmt.Errorf("user growth: %w", err)
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[TimeSeriesPoint])
}