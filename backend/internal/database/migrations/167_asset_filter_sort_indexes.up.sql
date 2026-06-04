-- Migration 167: indexes for the asset filter (camera model) + sort
-- (filename / size_bytes) hot paths exercised by AssetRepo.List
-- (repository/asset_repo.go).
--
-- AssetRepo.List builds, for the owner asset grid:
--   FROM assets WHERE workspace_id = $1 AND deleted_at IS NULL
--     [ AND (filename ILIKE $n OR exif_data->>'model' ILIKE $n) ]   -- f.Search
--     [ AND exif_data->>'model' ILIKE $n ]                          -- f.CameraModel
--     ...
--   ORDER BY <created_at|filename|size_bytes|capture_date> <ASC|DESC> LIMIT .. OFFSET ..
--
-- Two cost problems before this migration (Q-5):
--
--  1. CAMERA-MODEL FILTER (asset_repo.go ~264 / ~269): `exif_data->>'model'
--     ILIKE '%term%'` is a leading-wildcard ILIKE over a per-row JSONB key
--     extraction. No index serves it, so the planner sequentially scans the
--     workspace's assets and re-extracts + ILIKEs exif_data->>'model' on every
--     row. A pg_trgm GIN index on the *expression* (exif_data->>'model') makes
--     that predicate index-usable (Bitmap Index Scan). The existing
--     idx_assets_filename_trgm (migration 043) only covers the filename half of
--     f.Search, so the JSONB-model half is still a seq scan today.
--
--  2. FILENAME / SIZE SORT (asset_repo.go ~284-292): ORDER BY filename and
--     ORDER BY size_bytes have no btree, so every sorted grid page adds a Sort
--     node over the workspace's matching assets. The list is already
--     workspace_id-scoped + deleted_at IS NULL, so a partial composite btree
--     (workspace_id, <col>) WHERE deleted_at IS NULL serves both the WHERE and
--     the ORDER BY, dropping the Sort node. This mirrors the shipped
--     idx_assets_workspace_created (workspace_id, created_at DESC) partial index
--     (migration 011/perf), which already serves the default created_at sort.
--
-- The query text in asset_repo.go is UNCHANGED — these are additive indexes, so
-- the planner uses them transparently and the result set is byte-identical.
--
-- pg_trgm is already created by migration 043 (m15 pwa/security/ai); the
-- CREATE EXTENSION below is idempotent (IF NOT EXISTS) so this migration is
-- self-contained and safe to run against a DB that lacks it.
--
-- Additive + idempotent (CREATE EXTENSION / CREATE INDEX IF NOT EXISTS) — no
-- table is touched, fully reversible by 167_asset_filter_sort_indexes.down.sql.
--
-- Numbered 167: 166 (photographer_business_logo) is the current max committed on
-- origin/main; 167 is the next free number (verified against origin/main — a
-- prior attempt at 166 (PR #98) was closed for a number collision with
-- concurrent automation, hence the retry at 167).

BEGIN;

-- Guarantee the trigram operator classes are available before we reference
-- gin_trgm_ops. Idempotent: a no-op when migration 043 already installed it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Camera-model filter: serves `exif_data->>'model' ILIKE '%term%'` as a
--    Bitmap Index Scan over a GIN trigram index on the JSONB key expression,
--    instead of a sequential scan + per-row JSONB extract. Partial on the active
--    rows only (the predicate always carries `deleted_at IS NULL`).
CREATE INDEX IF NOT EXISTS idx_assets_exif_model_trgm
  ON assets USING gin ((exif_data->>'model') gin_trgm_ops)
  WHERE deleted_at IS NULL;

-- 2. Filename sort: serves the workspace-scoped `ORDER BY filename` without a
--    Sort node. Composite (workspace_id, filename) so it covers both the WHERE
--    (workspace_id) and the ORDER BY (filename). Partial on active rows.
CREATE INDEX IF NOT EXISTS idx_assets_workspace_filename
  ON assets (workspace_id, filename)
  WHERE deleted_at IS NULL;

-- 3. Size sort: serves the workspace-scoped `ORDER BY size_bytes` without a
--    Sort node, the same way.
CREATE INDEX IF NOT EXISTS idx_assets_workspace_size
  ON assets (workspace_id, size_bytes)
  WHERE deleted_at IS NULL;

COMMIT;
