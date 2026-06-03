-- Migration 153: gallery/album asset hot-path covering indexes.
--
-- Two ordering queries open on every gallery/album view but have no covering
-- index, so Postgres falls back to Sort -> Seq/Index Scan + Filter on every
-- open (EXPLAIN-confirmed against PG 17 in the 2026-06-04 perf audit,
-- PERF-01/02):
--
--   * GalleryAssetRepo.ListByGallery (repository/gallery_asset_repo.go):
--       WHERE ga.gallery_id = $1 ... ORDER BY ga.sort_order ASC
--     Migration 013 only ships single-column idx_gallery_assets_gallery_id /
--     idx_gallery_assets_asset_id, so the sort_order ordering is never
--     index-served — EXPLAIN shows `Sort -> Hash Join -> Seq Scan`.
--
--   * AlbumRepo.ListAssets / ListAssetsForAlbums (repository/album_repo.go):
--       WHERE aa.album_id = $1 ORDER BY aa.position ASC, aa.added_at ASC
--     album_assets carries only its (album_id, asset_id) PRIMARY KEY, which
--     cannot serve the position/added_at ordering.
--
-- A running dev DB already carried equivalent indexes, but they lived in NO
-- migration and NO docs/db/schema.sql, so production (built from migrations)
-- sorted on every gallery/album open. This migration ships them for real so
-- prod matches dev.
--
-- Additive + idempotent (CREATE INDEX IF NOT EXISTS) — no table is touched,
-- fully reversible by 153_*.down.sql.
--
-- Numbered 153: 152 (asset retry tracking) is the current max committed; 153
-- is the next free number (verified against origin/main).

BEGIN;

-- gallery_assets: serves `WHERE gallery_id = $1 ORDER BY sort_order ASC` as an
-- index range scan. asset_id is the third key column (tie-break + the projected
-- link id); INCLUDE the remaining ListByGallery projection (id, is_hero,
-- added_at) so the scan is index-only and never visits the heap for a list.
CREATE INDEX IF NOT EXISTS idx_gallery_assets_gallery_sort ON gallery_assets (gallery_id, sort_order, asset_id) INCLUDE (id, is_hero, added_at);

-- album_assets: serves `WHERE album_id = $1 ORDER BY position ASC, added_at ASC`
-- as an index range scan (the (album_id, asset_id) PRIMARY KEY can order by
-- album_id but not by position). INCLUDE asset_id so ListAssets is index-only.
CREATE INDEX IF NOT EXISTS idx_album_assets_album_position ON album_assets (album_id, position, added_at) INCLUDE (asset_id);

COMMIT;
