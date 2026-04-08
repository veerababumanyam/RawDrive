-- Rollback: 029_create_m7_admin_views

BEGIN;

DROP INDEX IF EXISTS idx_users_admin_filter;
DROP INDEX IF EXISTS idx_users_admin_search;
DROP MATERIALIZED VIEW IF EXISTS mv_admin_platform_stats;

COMMIT;
