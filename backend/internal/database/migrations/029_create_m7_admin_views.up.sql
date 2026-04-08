-- M7 Admin Command Center: Platform stats materialized view and admin search indexes
-- Migration: 029_create_m7_admin_views

BEGIN;

DROP MATERIALIZED VIEW IF EXISTS mv_admin_platform_stats CASCADE;
CREATE MATERIALIZED VIEW mv_admin_platform_stats AS
SELECT
    (SELECT COUNT(*) FROM users) AS total_users,
    (SELECT COUNT(*) FROM users WHERE updated_at > NOW() - INTERVAL '30 days') AS active_users_30d,
    (SELECT COUNT(*) FROM workspaces) AS total_workspaces,
    (SELECT COUNT(*) FROM galleries WHERE deleted_at IS NULL) AS total_galleries,
    (SELECT COALESCE(SUM(size_bytes), 0) FROM assets WHERE deleted_at IS NULL) AS total_storage_bytes,
    NOW() AS refreshed_at;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_admin_platform_stats ON mv_admin_platform_stats (refreshed_at);

CREATE INDEX IF NOT EXISTS idx_users_admin_search ON users USING gin (
    to_tsvector('english', COALESCE(display_name, '') || ' ' || COALESCE(email, '') || ' ' || COALESCE(phone, ''))
);

CREATE INDEX IF NOT EXISTS idx_users_admin_filter ON users (state_id, onboarding_step, created_at DESC);

COMMIT;
