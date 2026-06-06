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

// AdminDealerStateReport is the super-admin statewide dealer report row.
// Revenue is state-wide, not attribution-only: it lets platform staff see what
// a dealer's state would pay at the dealer's configured commission, falling
// back to the report default for pending/unconfigured dealers.
type AdminDealerStateReport struct {
	DealerID               uuid.UUID `json:"dealer_id"`
	BusinessName           string    `json:"business_name"`
	Email                  string    `json:"email"`
	StateID                int       `json:"state_id"`
	StateName              string    `json:"state_name"`
	TerritoryType          string    `json:"territory_type"`
	Status                 string    `json:"status"`
	CommissionRatePct      float64   `json:"commission_rate_pct"`
	TotalSubscriptionPaisa int64     `json:"total_subscription_paisa"`
	DealerSharePaisa       int64     `json:"dealer_share_paisa"`
	SubscriberCount        int64     `json:"subscriber_count"`
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

// GetAdminStateReports returns one statewide monthly report row per non-deleted
// dealer. A dealer without an assigned commission uses fallbackCommissionRatePct
// so pending applications can still be reviewed against the platform default.
func (r *DealerAnalyticsRepo) GetAdminStateReports(ctx context.Context, from, to time.Time, fallbackCommissionRatePct float64) ([]AdminDealerStateReport, error) {
	rows, err := r.DB.Query(ctx, `
		SELECT
				d.id,
				d.business_name,
				COALESCE(u.email, '') AS email,
				d.state_id,
				st.name AS state_name,
				d.territory_type,
			d.status,
			COALESCE(d.commission_rate_pct, $3::numeric)::float8 AS commission_rate_pct,
			COALESCE(SUM(s.amount_paisa), 0)::bigint AS total_subscription_paisa,
			ROUND(
				COALESCE(SUM(s.amount_paisa), 0)::numeric *
				COALESCE(d.commission_rate_pct, $3::numeric) / 100
			)::bigint AS dealer_share_paisa,
			COUNT(DISTINCT s.user_id)::bigint AS subscriber_count
			FROM dealers d
			JOIN states st ON st.id = d.state_id
			LEFT JOIN users u ON u.id = d.user_id
			LEFT JOIN workspaces w ON w.state_id = d.state_id
			LEFT JOIN subscriptions s ON s.workspace_id = w.id
			AND s.status = 'active'
			AND s.tier_slug != 'free'
			AND COALESCE(s.started_at, s.created_at) >= $1
			AND COALESCE(s.started_at, s.created_at) < $2
			WHERE d.deleted_at IS NULL
			GROUP BY d.id, d.business_name, u.email, d.state_id, st.name, d.territory_type, d.status, d.commission_rate_pct, d.approved_at, d.created_at
			ORDER BY
				st.name ASC,
				CASE d.status WHEN 'approved' THEN 0 ELSE 1 END,
				CASE d.territory_type
					WHEN 'primary' THEN 0
					WHEN 'secondary' THEN 1
					ELSE 2
				END,
				d.approved_at DESC NULLS LAST,
				d.created_at DESC,
				d.business_name ASC
		`, from, to, fallbackCommissionRatePct)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []AdminDealerStateReport
	for rows.Next() {
		var row AdminDealerStateReport
		if err := rows.Scan(
			&row.DealerID,
			&row.BusinessName,
			&row.Email,
			&row.StateID,
			&row.StateName,
			&row.TerritoryType,
			&row.Status,
			&row.CommissionRatePct,
			&row.TotalSubscriptionPaisa,
			&row.DealerSharePaisa,
			&row.SubscriberCount,
		); err != nil {
			return nil, err
		}
		result = append(result, row)
	}
	return result, rows.Err()
}
