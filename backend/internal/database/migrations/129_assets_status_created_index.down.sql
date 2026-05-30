-- Revert F-033: drop the partial (status, created_at) index for the worker poll loop.
--
-- The composite idx_assets_workspace_status (migration 011) and idx_assets_processing_status
-- (migration 038) are untouched and remain in place; only the partial index added here is
-- removed.
DROP INDEX IF EXISTS idx_assets_status_created;
