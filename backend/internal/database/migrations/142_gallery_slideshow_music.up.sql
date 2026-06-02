-- Migration 142: gallery slideshow background music
-- Adds an optional reference from a gallery to an uploaded audio asset used as
-- the background track for the full-screen client slideshow. NULL = no music.
-- The audio is stored like any other asset (Backblaze B2 via the s3 driver);
-- only image assets produce WebP derivatives, so audio bypasses that pipeline.
ALTER TABLE galleries
  ADD COLUMN IF NOT EXISTS music_asset_id UUID REFERENCES assets(id) ON DELETE SET NULL;

COMMENT ON COLUMN galleries.music_asset_id IS
  'Optional audio asset (content_type audio/*) used as the slideshow background track. NULL = no music. ON DELETE SET NULL so removing the track never deletes the gallery.';

CREATE INDEX IF NOT EXISTS idx_galleries_music_asset_id
  ON galleries(music_asset_id) WHERE music_asset_id IS NOT NULL;
