-- Migration 154 rollback.
-- Drops ONLY the partial index added by 154. Additive inverse: touches no
-- table, no column, no other index (011's idx_assets_workspace_id and
-- idx_assets_workspace_status are left intact).

BEGIN;

DROP INDEX IF EXISTS idx_assets_workspace_created;

COMMIT;
