-- Migration 167 (down): drop the asset filter/sort indexes.
--
-- Reverses 167_asset_filter_sort_indexes.up.sql. Drops only the three indexes
-- this migration added (idempotent IF EXISTS). After rollback the camera-model
-- filter reverts to a sequential scan + per-row JSONB extract, and ORDER BY
-- filename / size_bytes revert to a Sort node — correct, just slower.
--
-- The shared pg_trgm extension is intentionally NOT dropped: it predates this
-- migration (created by 043) and other trigram indexes (e.g.
-- idx_assets_filename_trgm, idx_galleries_title_trgm) depend on it. Dropping it
-- here would break unrelated indexes.

BEGIN;

DROP INDEX IF EXISTS idx_assets_exif_model_trgm;
DROP INDEX IF EXISTS idx_assets_workspace_filename;
DROP INDEX IF EXISTS idx_assets_workspace_size;

COMMIT;
