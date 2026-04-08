-- Rollback: 031_create_m7_revenue_views

BEGIN;

DROP MATERIALIZED VIEW IF EXISTS mv_revenue_churn;
DROP MATERIALIZED VIEW IF EXISTS mv_revenue_mrr;

COMMIT;
