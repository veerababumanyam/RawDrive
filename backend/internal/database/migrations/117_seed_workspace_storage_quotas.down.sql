-- 100_seed_workspace_storage_quotas.down.sql
-- Quota backfill cannot be safely reversed (cannot distinguish rows we
-- seeded from rows that were already set by other means). No-op.
SELECT 1;
