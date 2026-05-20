-- 100_seed_workspace_storage_quotas.up.sql
-- Backfill workspace_storage rows that are missing or have quota_bytes = 0.
-- Plan quotas (bytes) — keep in sync with service.PlanDefaultQuotaBytes:
--   free:         1 GB  = 1,073,741,824
--   starter:      30 GB = 32,212,254,720
--   professional: 300 GB = 322,122,547,200
--   business:     3 TB  = 3,298,534,883,328
--   enterprise:   6 TB  = 6,597,069,766,656

-- Insert rows for workspaces that have never had a workspace_storage record.
INSERT INTO workspace_storage (workspace_id, used_bytes, derivative_bytes, quota_bytes)
SELECT
    w.id,
    0,
    0,
    CASE w.plan_tier
        WHEN 'starter'      THEN 32212254720
        WHEN 'professional' THEN 322122547200
        WHEN 'business'     THEN 3298534883328
        WHEN 'enterprise'   THEN 6597069766656
        ELSE                     1073741824
    END
FROM workspaces w
WHERE NOT EXISTS (
    SELECT 1 FROM workspace_storage ws WHERE ws.workspace_id = w.id
)
ON CONFLICT (workspace_id) DO NOTHING;

-- Update existing rows where quota was never seeded (= 0).
UPDATE workspace_storage ws
SET quota_bytes = CASE w.plan_tier
    WHEN 'starter'      THEN 32212254720
    WHEN 'professional' THEN 322122547200
    WHEN 'business'     THEN 3298534883328
    WHEN 'enterprise'   THEN 6597069766656
    ELSE                     1073741824
END
FROM workspaces w
WHERE ws.workspace_id = w.id
  AND ws.quota_bytes = 0;
