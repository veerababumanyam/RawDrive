-- Migration 142 (down): drop gallery slideshow background music
DROP INDEX IF EXISTS idx_galleries_music_asset_id;

ALTER TABLE galleries
  DROP COLUMN IF EXISTS music_asset_id;
