-- Migration 165: pg_trgm GIN indexes for owner gallery title/description search.
--
-- GalleryRepo.List (repository/gallery_repo.go) backs the owner gallery search:
--   WHERE g.workspace_id = $1 AND g.deleted_at IS NULL
--     AND (g.title ILIKE $n OR g.description ILIKE $n)   -- arg = '%' || term || '%'
--   ORDER BY g.created_at DESC
-- The search term is wrapped in leading + trailing wildcards ('%term%'). A btree
-- index cannot serve a leading-wildcard ILIKE, so EXPLAIN shows a sequential
-- scan over the workspace's galleries with a per-row ILIKE filter on every
-- search (D2 in the 2026-06-04 perf audit). pg_trgm GIN indexes on title and
-- description make the `ILIKE '%term%'` predicate index-usable (Bitmap Index
-- Scan), which Postgres can BitmapAnd with the workspace_id / deleted_at filter
-- — no seq scan. The query text in gallery_repo.go is unchanged: a trigram GIN
-- index serves the ILIKE / ~~* operator directly, so results are identical.
--
-- pg_trgm is already created by migration 043 (m15 pwa/security/ai); the
-- CREATE EXTENSION below is idempotent (IF NOT EXISTS) so this migration is
-- self-contained and safe to run against a DB that lacks it.
--
-- Additive + idempotent (CREATE EXTENSION / CREATE INDEX IF NOT EXISTS) — no
-- table is touched, fully reversible by 165_gallery_search_trgm.down.sql.
--
-- Numbered 165: 164 (recreate idx_assets_ai_tags) is the current max committed
-- on origin/main (163 was reserved/skipped); 165 is the next free number
-- (verified against origin/main).

BEGIN;

-- Guarantee the trigram operator classes are available before we reference
-- gin_trgm_ops. Idempotent: a no-op when migration 043 already installed it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- galleries.title: serves `g.title ILIKE '%term%'` as a Bitmap Index Scan over
-- the trigram GIN index instead of a sequential scan + per-row filter.
CREATE INDEX IF NOT EXISTS idx_galleries_title_trgm ON galleries USING gin (title gin_trgm_ops);

-- galleries.description: serves `g.description ILIKE '%term%'` the same way.
CREATE INDEX IF NOT EXISTS idx_galleries_description_trgm ON galleries USING gin (description gin_trgm_ops);

COMMIT;
