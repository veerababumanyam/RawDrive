-- Migration 161 rollback.
--
-- Intentionally no-op. The up migration fills missing default covers, and a
-- later photographer edit uses the same cover_asset_id column. Rollback cannot
-- distinguish an untouched backfill from a real user choice without adding
-- tracking state, so it must not clear any gallery covers.

BEGIN;

COMMIT;
