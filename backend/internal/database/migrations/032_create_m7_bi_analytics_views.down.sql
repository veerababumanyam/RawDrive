-- Rollback: 032_create_m7_bi_analytics_views

BEGIN;

DROP MATERIALIZED VIEW IF EXISTS mv_bi_uploads;
DROP MATERIALIZED VIEW IF EXISTS mv_bi_daily_active;

COMMIT;
