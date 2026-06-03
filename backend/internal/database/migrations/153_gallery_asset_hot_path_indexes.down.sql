-- Migration 153 rollback.
-- Drops ONLY the two covering indexes added by 153. Additive inverse: touches
-- no table, no column, no other index (013's single-column gallery_assets
-- indexes and album_assets' PRIMARY KEY are left intact).

BEGIN;

DROP INDEX IF EXISTS idx_album_assets_album_position;
DROP INDEX IF EXISTS idx_gallery_assets_gallery_sort;

COMMIT;
