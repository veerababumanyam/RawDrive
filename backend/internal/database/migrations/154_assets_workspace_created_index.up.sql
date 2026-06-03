-- Migration 154: assets dashboard-grid hot-path covering index.
--
-- AssetRepo.List (repository/asset_repo.go) backs the workspace asset grid:
--   WHERE workspace_id = $1 AND deleted_at IS NULL ... ORDER BY created_at DESC
-- where created_at DESC is the default sort. Migration 011 ships only
-- idx_assets_workspace_id (workspace_id) and idx_assets_workspace_status
-- (workspace_id, status) WHERE deleted_at IS NULL — neither serves the
-- created_at ordering, so EXPLAIN shows
--   Limit -> Sort (Sort Key: created_at DESC) -> Index Scan ... Filter: workspace_id
-- on every dashboard grid page (PERF-02 in the 2026-06-04 perf audit).
--
-- This adds the partial composite that turns the default grid page into an
-- index range scan with no Sort. Partial on deleted_at IS NULL to match the
-- query's live-rows guard and keep the index small. Additive + idempotent;
-- no table is touched, fully reversible by 154_*.down.sql.
--
-- Numbered 154: the next free number in the perf-audit index wave after 153
-- (gallery/album hot-path indexes); both are independent additive indexes
-- applied per-version by the schema_migrations runner.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_assets_workspace_created ON assets (workspace_id, created_at DESC) WHERE deleted_at IS NULL;

COMMIT;
