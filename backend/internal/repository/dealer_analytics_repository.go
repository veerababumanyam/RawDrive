package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// StatePhotographer is a photographer registered in the dealer's state.
type StatePhotographer struct {
	UserID             uuid.UUID `json:"user_id"`
	FullName           string    `json:"full_name"`
	Email              string    `json:"email"`
	SubscriptionPlan   string    `json:"subscription_plan"`   // tier_slug or empty string
	SubscriptionStatus string    `json:"subscription_status"` // "active" or "none"
}

// DailyRevenueShare holds one calendar day's subscription revenue and the dealer's share.
type DailyRevenueShare struct {
	Date                   string  `json:"date"` // "YYYY-MM-DD"
	TotalSubscriptionPaisa int64   `json:"total_subscription_paisa"`
	CommissionRatePct      float64 `json:"commission_rate_pct"`
	RevenueSharePaisa      int64   `json:"revenue_share_paisa"`
	SubscriberCount        int     `json:"subscriber_count"`
}

type DealerAnalyticsRepo struct {
	DB *pgxpool.Pool
}

func NewDealerAnalyticsRepo(db *pgxpool.Pool) *DealerAnalyticsRepo {
	return &DealerAnalyticsRepo{DB: db}
}

// GetReferralCounts returns total, active, and churned workspace counts for a dealer.
func (r *DealerAnalyticsRepo) GetReferralCounts(ctx context.Context, dealerID uuid.UUID) (total, active, churned int, err error) {
	err = r.DB.QueryRow(ctx, `
		SELECT
			COUNT(*),
			COUNT(*) FILTER (WHERE w.id IN (SELECT workspace_id FROM subscriptions WHERE status = 'active')),
			COUNT(*) FILTER (WHERE w.id IN (SELECT workspace_id FROM subscriptions WHERE status = 'cancelled'))
		FROM dealer_attributions da
		JOIN workspaces w ON da.workspace_id = w.id
		WHERE da.dealer_id = $1 AND da.is_current = true
	`, dealerID).Scan(&total, &active, &churned)
	return
}

// GetRevenueForPeriod returns total attributed revenue in paisa for a dealer in a date range.
func (r *DealerAnalyticsRepo) GetRevenueForPeriod(ctx context.Context, dealerID uuid.UUID, start, end time.Time) (int64, error) {
	var revenue int64
	err := r.DB.QueryRow(ctx, `
		SELECT COALESCE(SUM(i.total_paisa), 0)
		FROM invoices i
		JOIN dealer_attributions da ON da.workspace_id = i.workspace_id AND da.is_current = true
		WHERE da.dealer_id = $1 AND i.created_at BETWEEN $2 AND $3
	`, dealerID, start, end).Scan(&revenue)
	return revenue, err
}

// GetPhotographersByState returns all photographers in the given state with their active subscription.
func (r *DealerAnalyticsRepo) GetPhotographersByState(ctx context.Context, stateID int) ([]StatePhotographer, error) {
	rows, err := r.DB.Query(ctx, `
		SELECT
			u.id,
			COALESCE(u.display_name, '') AS full_name,
			COALESCE(u.email, '') AS email,
			COALESCE(sub.tier_slug, '') AS subscription_plan,
			CASE WHEN sub.tier_slug IS NOT NULL THEN 'active' ELSE 'none' END AS subscription_status
		FROM users u
		LEFT JOIN LATERAL (
			SELECT tier_slug
			FROM subscriptions
			WHERE user_id = u.id AND status = 'active'
			ORDER BY started_at DESC
			LIMIT 1
		) sub ON true
		WHERE u.platform_role = 'photographer'
		  AND u.state_id = $1
		ORDER BY u.display_name NULLS LAST
	`, stateID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []StatePhotographer
	for rows.Next() {
		var p StatePhotographer
		if err := rows.Scan(&p.UserID, &p.FullName, &p.Email, &p.SubscriptionPlan, &p.SubscriptionStatus); err != nil {
			return nil, err
		}
		result = append(result, p)
	}
	return result, rows.Err()
}

// GetDailyRevenueShares returns per-day subscription revenue for photographers in stateID
// during the given calendar month, with the dealer's share calculated from commissionRatePct.
func (r *DealerAnalyticsRepo) GetDailyRevenueShares(ctx context.Context, stateID int, commissionRatePct float64, year, month int) ([]DailyRevenueShare, error) {
	rows, err := r.DB.Query(ctx, `
		SELECT
			TO_CHAR(s.started_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day,
			SUM(s.amount_paisa) AS total_subscription_paisa,
			COUNT(DISTINCT s.user_id) AS subscriber_count
		FROM subscriptions s
		JOIN users u ON u.id = s.user_id
		WHERE u.platform_role = 'photographer'
		  AND u.state_id = $1
		  AND EXTRACT(YEAR FROM s.started_at AT TIME ZONE 'Asia/Kolkata') = $2
		  AND EXTRACT(MONTH FROM s.started_at AT TIME ZONE 'Asia/Kolkata') = $3
		GROUP BY day
		ORDER BY day
	`, stateID, year, month)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []DailyRevenueShare
	for rows.Next() {
		var d DailyRevenueShare
		if err := rows.Scan(&d.Date, &d.TotalSubscriptionPaisa, &d.SubscriberCount); err != nil {
			return nil, err
		}
		d.CommissionRatePct = commissionRatePct
		d.RevenueSharePaisa = int64(float64(d.TotalSubscriptionPaisa) * commissionRatePct / 100.0)
		result = append(result, d)
	}
	return result, rows.Err()
}
