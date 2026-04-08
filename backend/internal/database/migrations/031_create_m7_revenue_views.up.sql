-- M7 Admin Command Center: Revenue analytics materialized views
-- Migration: 031_create_m7_revenue_views

BEGIN;

DROP MATERIALIZED VIEW IF EXISTS mv_revenue_mrr CASCADE;
CREATE MATERIALIZED VIEW mv_revenue_mrr AS
SELECT
    date_trunc('month', COALESCE(i.paid_at, i.created_at)) AS month,
    i.state_id,
    SUM(i.total_paisa) AS total_mrr_paisa,
    COUNT(DISTINCT i.workspace_id) AS subscriber_count
FROM invoices i
WHERE i.status IN ('paid', 'partially_paid')
GROUP BY 1, 2;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_revenue_mrr ON mv_revenue_mrr (month, state_id);

DROP MATERIALIZED VIEW IF EXISTS mv_revenue_churn CASCADE;
CREATE MATERIALIZED VIEW mv_revenue_churn AS
SELECT
    date_trunc('month', i.updated_at) AS month,
    i.state_id,
    COUNT(*) AS churned_count,
    SUM(i.total_paisa) AS churned_mrr_paisa
FROM invoices i
WHERE i.status IN ('cancelled', 'refunded')
GROUP BY 1, 2;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_revenue_churn ON mv_revenue_churn (month, state_id);

COMMIT;
