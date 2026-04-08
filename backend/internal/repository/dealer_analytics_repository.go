package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

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
