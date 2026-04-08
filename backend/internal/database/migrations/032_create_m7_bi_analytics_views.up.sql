-- M7 Admin Command Center: BI analytics materialized views
-- Migration: 032_create_m7_bi_analytics_views

BEGIN;

DROP MATERIALIZED VIEW IF EXISTS mv_bi_daily_active CASCADE;
CREATE MATERIALIZED VIEW mv_bi_daily_active AS
SELECT
    date_trunc('day', u.updated_at) AS activity_date,
    u.state_id,
    'user'::text AS platform_role,
    COUNT(DISTINCT u.id) AS active_users
FROM users u
WHERE u.updated_at IS NOT NULL
GROUP BY 1, 2, 3;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_bi_daily_active ON mv_bi_daily_active (activity_date, state_id, platform_role);

DROP MATERIALIZED VIEW IF EXISTS mv_bi_uploads CASCADE;
CREATE MATERIALIZED VIEW mv_bi_uploads AS
SELECT
    date_trunc('day', a.created_at) AS upload_date,
    w.state_id,
    COUNT(*) AS upload_count,
    SUM(a.size_bytes) AS total_bytes,
    AVG(a.size_bytes) AS avg_file_size
FROM assets a
JOIN workspaces w ON w.id = a.workspace_id
WHERE a.deleted_at IS NULL
GROUP BY 1, 2;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_bi_uploads ON mv_bi_uploads (upload_date, state_id);

COMMIT;
