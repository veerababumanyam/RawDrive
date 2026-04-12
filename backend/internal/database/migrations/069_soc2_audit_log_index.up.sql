-- 069_soc2_audit_log_index.up.sql
--
-- SOC2 CC7.4: audit log query performance for date-range sampling.
-- The existing audit_log table (migration 009) has no index on created_at.
-- Auditors query "show me all actions between date X and Y" — without an
-- index this is a full table scan.
--
-- Also adds a composite index on (actor_id, created_at) for per-user audit
-- trails, which auditors request for CC6.2 access reviews.
--
-- CONCURRENTLY is not used here because golang-migrate holds a transaction.
-- For production with large tables, run these manually with CONCURRENTLY
-- before applying the migration.

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at
    ON audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor_created
    ON audit_log (actor_id, created_at DESC)
    WHERE actor_id IS NOT NULL;

-- Retention visibility: a view that shows the oldest and newest audit entries.
-- SOC2 auditors will ask "can you show me a log entry from 11 months ago?"
-- This view answers that instantly.
CREATE OR REPLACE VIEW audit_log_retention_check AS
SELECT
    COUNT(*) AS total_entries,
    MIN(created_at) AS oldest_entry,
    MAX(created_at) AS newest_entry,
    NOW() - MIN(created_at) AS retention_span,
    CASE
        WHEN MIN(created_at) < NOW() - INTERVAL '365 days' THEN 'PASS: >1 year retention'
        ELSE 'INFO: <1 year of data (expected for new deployments)'
    END AS retention_status
FROM audit_log;
