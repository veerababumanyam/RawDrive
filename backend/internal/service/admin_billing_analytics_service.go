package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const defaultBillingAnalyticsWindowDays = 30

type AdminBillingAnalyticsService struct {
	db *pgxpool.Pool
}

func NewAdminBillingAnalyticsService(db *pgxpool.Pool) *AdminBillingAnalyticsService {
	return &AdminBillingAnalyticsService{db: db}
}

type AdminBillingAnalyticsDashboard struct {
	GeneratedAt      time.Time                          `json:"generated_at"`
	WindowDays       int                                `json:"window_days"`
	Summary          AdminBillingAnalyticsSummary       `json:"summary"`
	Plans            []AdminBillingPlanAnalytics        `json:"plans"`
	RevenueByProduct []AdminBillingProductRevenue       `json:"revenue_by_product"`
	Lifecycle        AdminBillingLifecycleAnalytics     `json:"lifecycle"`
	Approvals        AdminBillingApprovalAnalytics      `json:"approvals"`
	RecentOrders     []AdminBillingAnalyticsRecentOrder `json:"recent_orders"`
}

type AdminBillingAnalyticsSummary struct {
	ActiveSubscribers              int64 `json:"active_subscribers"`
	MRRPaise                       int64 `json:"mrr_paise"`
	ARRPaise                       int64 `json:"arr_paise"`
	SubscriptionRevenuePaise       int64 `json:"subscription_revenue_paise"`
	StorageBoosterRevenuePaise     int64 `json:"storage_booster_revenue_paise"`
	ExpiryExtensionRevenuePaise    int64 `json:"expiry_extension_revenue_paise"`
	EventUploadRevenuePaise        int64 `json:"event_upload_revenue_paise"`
	ActiveStorageBoosters          int64 `json:"active_storage_boosters"`
	ChurnRiskCount                 int64 `json:"churn_risk_count"`
	PendingRenewalFailures         int64 `json:"pending_renewal_failures"`
	PendingPricingApprovals        int64 `json:"pending_pricing_approvals"`
	SafeReductionOverageWorkspaces int64 `json:"safe_reduction_overage_workspaces"`
}

type AdminBillingPlanAnalytics struct {
	TierSlug           string `json:"tier_slug"`
	PlanName           string `json:"plan_name"`
	ActiveSubscribers  int64  `json:"active_subscribers"`
	PastDueSubscribers int64  `json:"past_due_subscribers"`
	MRRPaise           int64  `json:"mrr_paise"`
	ARRPaise           int64  `json:"arr_paise"`
	QuotaBytes         int64  `json:"quota_bytes"`
}

type AdminBillingProductRevenue struct {
	OrderType    string `json:"order_type"`
	PaidOrders   int64  `json:"paid_orders"`
	RevenuePaise int64  `json:"revenue_paise"`
	AveragePaise int64  `json:"average_paise"`
}

type AdminBillingLifecycleAnalytics struct {
	DueRenewalReminders       int64 `json:"due_renewal_reminders"`
	DueExpiryWarnings         int64 `json:"due_expiry_warnings"`
	DueDeletionWarnings       int64 `json:"due_deletion_warnings"`
	FailedLifecycleJobs       int64 `json:"failed_lifecycle_jobs"`
	QueuedPricingEmailBatches int64 `json:"queued_pricing_email_batches"`
	SentProofs                int64 `json:"sent_proofs"`
	FailedProofs              int64 `json:"failed_proofs"`
}

type AdminBillingApprovalAnalytics struct {
	Draft           int64 `json:"draft"`
	PendingApproval int64 `json:"pending_approval"`
	Approved        int64 `json:"approved"`
	Published       int64 `json:"published"`
	Rejected        int64 `json:"rejected"`
}

type AdminBillingAnalyticsRecentOrder struct {
	ID          uuid.UUID  `json:"id"`
	SourceTable string     `json:"source_table"`
	OrderType   string     `json:"order_type"`
	TargetType  string     `json:"target_type"`
	TargetID    *uuid.UUID `json:"target_id,omitempty"`
	Status      string     `json:"status"`
	Provider    string     `json:"provider"`
	AmountPaise int64      `json:"amount_paise"`
	Currency    string     `json:"currency"`
	WorkspaceID uuid.UUID  `json:"workspace_id"`
	CreatedAt   time.Time  `json:"created_at"`
	PaidAt      *time.Time `json:"paid_at,omitempty"`
}

func (s *AdminBillingAnalyticsService) GetDashboard(ctx context.Context, windowDays int) (*AdminBillingAnalyticsDashboard, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("admin billing analytics service unavailable")
	}
	windowDays = normalizeBillingAnalyticsWindowDays(windowDays)
	now := time.Now().UTC()
	from := now.AddDate(0, 0, -windowDays)

	summary, err := s.fetchBillingSummary(ctx, from, now)
	if err != nil {
		return nil, err
	}
	plans, err := s.fetchPlanAnalytics(ctx)
	if err != nil {
		return nil, err
	}
	revenueByProduct, err := s.fetchProductRevenue(ctx, from)
	if err != nil {
		return nil, err
	}
	lifecycle, err := s.fetchLifecycleAnalytics(ctx, from, now)
	if err != nil {
		return nil, err
	}
	approvals, err := s.fetchApprovalAnalytics(ctx)
	if err != nil {
		return nil, err
	}
	recentOrders, err := s.fetchRecentOrders(ctx)
	if err != nil {
		return nil, err
	}
	summary.PendingPricingApprovals = approvals.PendingApproval

	return &AdminBillingAnalyticsDashboard{
		GeneratedAt:      now,
		WindowDays:       windowDays,
		Summary:          summary,
		Plans:            plans,
		RevenueByProduct: revenueByProduct,
		Lifecycle:        lifecycle,
		Approvals:        approvals,
		RecentOrders:     recentOrders,
	}, nil
}

func normalizeBillingAnalyticsWindowDays(days int) int {
	if days <= 0 {
		return defaultBillingAnalyticsWindowDays
	}
	if days > 365 {
		return 365
	}
	return days
}

func (s *AdminBillingAnalyticsService) fetchBillingSummary(ctx context.Context, from, now time.Time) (AdminBillingAnalyticsSummary, error) {
	var summary AdminBillingAnalyticsSummary
	if err := s.db.QueryRow(ctx, `
		SELECT
		    COUNT(*) FILTER (WHERE status = 'active')::bigint,
		    COALESCE(SUM(CASE
		        WHEN status = 'active' AND COALESCE(billing_interval, 'monthly') = 'annual'
		            THEN amount_paisa / 12
		        WHEN status = 'active'
		            THEN amount_paisa
		        ELSE 0
		    END), 0)::bigint,
		    COALESCE(SUM(CASE
		        WHEN status = 'active' AND COALESCE(billing_interval, 'monthly') = 'annual'
		            THEN amount_paisa
		        WHEN status = 'active'
		            THEN amount_paisa * 12
		        ELSE 0
		    END), 0)::bigint,
		    COUNT(*) FILTER (
		        WHERE status IN ('active', 'past_due')
		          AND expires_at IS NOT NULL
		          AND expires_at >= $1::timestamptz
		          AND expires_at <= $1::timestamptz + INTERVAL '14 days'
		    )::bigint
		FROM subscriptions`,
		now,
	).Scan(
		&summary.ActiveSubscribers,
		&summary.MRRPaise,
		&summary.ARRPaise,
		&summary.ChurnRiskCount,
	); err != nil {
		return summary, fmt.Errorf("fetch billing subscription summary: %w", err)
	}
	if err := s.db.QueryRow(ctx, `
		SELECT
		    COALESCE(SUM(amount_paise) FILTER (WHERE status = 'paid'), 0)::bigint
		FROM subscription_upgrade_orders
		WHERE updated_at >= $1`,
		from,
	).Scan(&summary.SubscriptionRevenuePaise); err != nil {
		return summary, fmt.Errorf("fetch subscription revenue: %w", err)
	}
	if err := s.db.QueryRow(ctx, `
		SELECT
		    COALESCE(SUM(amount_paise) FILTER (WHERE order_type = 'storage_booster' AND status = 'paid'), 0)::bigint,
		    COALESCE(SUM(amount_paise) FILTER (WHERE order_type = 'gallery_extension' AND status = 'paid'), 0)::bigint,
		    COALESCE(SUM(amount_paise) FILTER (WHERE order_type = 'event_upload' AND status = 'paid'), 0)::bigint
		FROM billing_orders
		WHERE COALESCE(paid_at, updated_at, created_at) >= $1`,
		from,
	).Scan(
		&summary.StorageBoosterRevenuePaise,
		&summary.ExpiryExtensionRevenuePaise,
		&summary.EventUploadRevenuePaise,
	); err != nil {
		return summary, fmt.Errorf("fetch product revenue summary: %w", err)
	}
	if err := s.db.QueryRow(ctx, `
		SELECT COUNT(*)::bigint
		FROM workspace_storage_boosters
		WHERE status = 'active'
		  AND (expires_at IS NULL OR expires_at > $1)`,
		now,
	).Scan(&summary.ActiveStorageBoosters); err != nil {
		return summary, fmt.Errorf("fetch active storage boosters: %w", err)
	}
	if err := s.db.QueryRow(ctx, `
		WITH failed_orders AS (
		    SELECT id FROM subscription_upgrade_orders
		     WHERE order_type = 'subscription_renewal'
		       AND status = 'failed'
		       AND updated_at >= $1
		    UNION ALL
		    SELECT id FROM billing_orders
		     WHERE order_type = 'subscription_renewal'
		       AND status = 'failed'
		       AND updated_at >= $1
		), failed_jobs AS (
		    SELECT id FROM billing_lifecycle_jobs
		     WHERE job_type = 'payment_failed'
		       AND status IN ('pending', 'failed')
		       AND updated_at >= $1
		)
		SELECT ((SELECT COUNT(*) FROM failed_orders) + (SELECT COUNT(*) FROM failed_jobs))::bigint`,
		from,
	).Scan(&summary.PendingRenewalFailures); err != nil {
		return summary, fmt.Errorf("fetch pending renewal failures: %w", err)
	}
	if err := s.db.QueryRow(ctx, `
		SELECT COUNT(*)::bigint
		FROM workspace_storage
		WHERE used_bytes + derivative_bytes + COALESCE(reserved_bytes, 0) > quota_bytes`,
	).Scan(&summary.SafeReductionOverageWorkspaces); err != nil {
		return summary, fmt.Errorf("fetch storage overage summary: %w", err)
	}
	return summary, nil
}

func (s *AdminBillingAnalyticsService) fetchPlanAnalytics(ctx context.Context) ([]AdminBillingPlanAnalytics, error) {
	rows, err := s.db.Query(ctx, `
		SELECT
		    COALESCE(NULLIF(s.tier_slug, ''), 'unknown') AS tier_slug,
		    COALESCE(MAX(p.name), MAX(NULLIF(s.tier_slug, '')), 'Unknown plan') AS plan_name,
		    COUNT(*) FILTER (WHERE s.status = 'active')::bigint AS active_subscribers,
		    COUNT(*) FILTER (WHERE s.status = 'past_due')::bigint AS past_due_subscribers,
		    COALESCE(SUM(CASE
		        WHEN s.status = 'active' AND COALESCE(s.billing_interval, 'monthly') = 'annual'
		            THEN s.amount_paisa / 12
		        WHEN s.status = 'active'
		            THEN s.amount_paisa
		        ELSE 0
		    END), 0)::bigint AS mrr_paise,
		    COALESCE(SUM(CASE
		        WHEN s.status = 'active' AND COALESCE(s.billing_interval, 'monthly') = 'annual'
		            THEN s.amount_paisa
		        WHEN s.status = 'active'
		            THEN s.amount_paisa * 12
		        ELSE 0
		    END), 0)::bigint AS arr_paise,
		    COALESCE(MAX(p.quota_bytes), 0)::bigint AS quota_bytes
		FROM subscriptions s
		LEFT JOIN subscription_plans p ON p.tier = s.tier_slug
		WHERE s.status IN ('active', 'past_due', 'trialing')
		GROUP BY COALESCE(NULLIF(s.tier_slug, ''), 'unknown')
		ORDER BY active_subscribers DESC, mrr_paise DESC, tier_slug
		LIMIT 20`)
	if err != nil {
		return nil, fmt.Errorf("fetch billing plan analytics: %w", err)
	}
	defer rows.Close()

	plans := []AdminBillingPlanAnalytics{}
	for rows.Next() {
		var plan AdminBillingPlanAnalytics
		if err := rows.Scan(
			&plan.TierSlug,
			&plan.PlanName,
			&plan.ActiveSubscribers,
			&plan.PastDueSubscribers,
			&plan.MRRPaise,
			&plan.ARRPaise,
			&plan.QuotaBytes,
		); err != nil {
			return nil, err
		}
		plans = append(plans, plan)
	}
	return plans, rows.Err()
}

func (s *AdminBillingAnalyticsService) fetchProductRevenue(ctx context.Context, from time.Time) ([]AdminBillingProductRevenue, error) {
	rows, err := s.db.Query(ctx, `
		SELECT
		    order_type,
		    COUNT(*) FILTER (WHERE status = 'paid')::bigint AS paid_orders,
		    COALESCE(SUM(amount_paise) FILTER (WHERE status = 'paid'), 0)::bigint AS revenue_paise,
		    COALESCE(AVG(amount_paise) FILTER (WHERE status = 'paid'), 0)::bigint AS average_paise
		FROM billing_orders
		WHERE COALESCE(paid_at, updated_at, created_at) >= $1
		GROUP BY order_type
		ORDER BY revenue_paise DESC, paid_orders DESC, order_type`,
		from,
	)
	if err != nil {
		return nil, fmt.Errorf("fetch product revenue: %w", err)
	}
	defer rows.Close()

	out := []AdminBillingProductRevenue{}
	for rows.Next() {
		var row AdminBillingProductRevenue
		if err := rows.Scan(&row.OrderType, &row.PaidOrders, &row.RevenuePaise, &row.AveragePaise); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func (s *AdminBillingAnalyticsService) fetchLifecycleAnalytics(ctx context.Context, from, now time.Time) (AdminBillingLifecycleAnalytics, error) {
	var out AdminBillingLifecycleAnalytics
	if err := s.db.QueryRow(ctx, `
		SELECT
		    COUNT(*) FILTER (WHERE job_type = 'renewal_reminder' AND status = 'pending' AND due_at <= $1::timestamptz + INTERVAL '7 days')::bigint,
		    COUNT(*) FILTER (WHERE job_type = 'expiry_warning' AND status = 'pending' AND due_at <= $1::timestamptz + INTERVAL '7 days')::bigint,
		    COUNT(*) FILTER (WHERE job_type = 'deletion_warning' AND status = 'pending' AND due_at <= $1::timestamptz + INTERVAL '7 days')::bigint,
		    COUNT(*) FILTER (WHERE status = 'failed')::bigint
		FROM billing_lifecycle_jobs`,
		now,
	).Scan(
		&out.DueRenewalReminders,
		&out.DueExpiryWarnings,
		&out.DueDeletionWarnings,
		&out.FailedLifecycleJobs,
	); err != nil {
		return out, fmt.Errorf("fetch lifecycle jobs: %w", err)
	}
	if err := s.db.QueryRow(ctx, `
		SELECT COUNT(*)::bigint
		FROM pricing_email_batches
		WHERE status IN ('queued', 'sending')`,
	).Scan(&out.QueuedPricingEmailBatches); err != nil {
		return out, fmt.Errorf("fetch pricing email batches: %w", err)
	}
	if err := s.db.QueryRow(ctx, `
		SELECT
		    COUNT(*) FILTER (WHERE status = 'sent')::bigint,
		    COUNT(*) FILTER (WHERE status = 'failed')::bigint
		FROM billing_notification_proofs
		WHERE created_at >= $1`,
		from,
	).Scan(&out.SentProofs, &out.FailedProofs); err != nil {
		return out, fmt.Errorf("fetch notification proofs: %w", err)
	}
	return out, nil
}

func (s *AdminBillingAnalyticsService) fetchApprovalAnalytics(ctx context.Context) (AdminBillingApprovalAnalytics, error) {
	var out AdminBillingApprovalAnalytics
	if err := s.db.QueryRow(ctx, `
		SELECT
		    COUNT(*) FILTER (WHERE status = 'draft')::bigint,
		    COUNT(*) FILTER (WHERE status = 'pending_approval')::bigint,
		    COUNT(*) FILTER (WHERE status = 'approved')::bigint,
		    COUNT(*) FILTER (WHERE status = 'published')::bigint,
		    COUNT(*) FILTER (WHERE status = 'rejected')::bigint
		FROM pricing_change_requests`,
	).Scan(&out.Draft, &out.PendingApproval, &out.Approved, &out.Published, &out.Rejected); err != nil {
		return out, fmt.Errorf("fetch approval analytics: %w", err)
	}
	return out, nil
}

func (s *AdminBillingAnalyticsService) fetchRecentOrders(ctx context.Context) ([]AdminBillingAnalyticsRecentOrder, error) {
	rows, err := s.db.Query(ctx, `
		SELECT id, source_table, order_type, target_type, target_id, status, provider,
		       amount_paise, currency, workspace_id, created_at, paid_at
		FROM (
		    SELECT id, 'billing_orders'::text AS source_table, order_type, target_type,
		           target_id, status, provider, amount_paise, currency, workspace_id,
		           created_at, paid_at
		      FROM billing_orders
		    UNION ALL
		    SELECT id, 'subscription_upgrade_orders'::text AS source_table,
		           COALESCE(order_type, 'subscription_upgrade') AS order_type,
		           'workspace'::text AS target_type,
		           workspace_id AS target_id,
		           status, provider, amount_paise, 'INR'::text AS currency,
		           workspace_id, created_at,
		           CASE WHEN status = 'paid' THEN updated_at ELSE NULL END AS paid_at
		      FROM subscription_upgrade_orders
		) orders
		ORDER BY created_at DESC
		LIMIT 12`)
	if err != nil {
		return nil, fmt.Errorf("fetch recent billing orders: %w", err)
	}
	defer rows.Close()

	orders := []AdminBillingAnalyticsRecentOrder{}
	for rows.Next() {
		var order AdminBillingAnalyticsRecentOrder
		var targetID *uuid.UUID
		var paidAt *time.Time
		if err := rows.Scan(
			&order.ID,
			&order.SourceTable,
			&order.OrderType,
			&order.TargetType,
			&targetID,
			&order.Status,
			&order.Provider,
			&order.AmountPaise,
			&order.Currency,
			&order.WorkspaceID,
			&order.CreatedAt,
			&paidAt,
		); err != nil {
			return nil, err
		}
		order.TargetID = targetID
		order.PaidAt = paidAt
		orders = append(orders, order)
	}
	if err := rows.Err(); err != nil && err != pgx.ErrNoRows {
		return nil, err
	}
	return orders, nil
}
