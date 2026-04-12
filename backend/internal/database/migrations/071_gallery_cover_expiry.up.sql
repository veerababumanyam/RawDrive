-- M19: Gallery Enhancement Suite (F-009) — cover templates, expiry, download controls
-- Adds gallery-level cover page template config, expiry date, download toggle,
-- sort order preference, and WhatsApp share template.
-- Existing columns (password_hash, watermark_config, max_selections, cover_asset_id)
-- are untouched — they were added in migration 012.

ALTER TABLE galleries ADD COLUMN IF NOT EXISTS cover_template VARCHAR(50) DEFAULT 'none';
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS cover_config JSONB DEFAULT '{}';
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS download_enabled BOOLEAN DEFAULT true;
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS sort_preference VARCHAR(20) DEFAULT 'manual';
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS whatsapp_template TEXT DEFAULT '';

-- Index for expiry queries (find galleries expiring soon, or check if expired)
CREATE INDEX IF NOT EXISTS idx_galleries_expires_at ON galleries(expires_at)
  WHERE expires_at IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN galleries.cover_template IS 'Cover page template: none, full_bleed, split_screen, minimal_white, classic_film, festive';
COMMENT ON COLUMN galleries.cover_config IS 'Template-specific config: hero image position, text overlay, logo placement';
COMMENT ON COLUMN galleries.expires_at IS 'Gallery expiry date. NULL = no expiry. Past date = gallery expired.';
COMMENT ON COLUMN galleries.download_enabled IS 'Master toggle for all download buttons in client gallery';
COMMENT ON COLUMN galleries.sort_preference IS 'Photo sort order: manual, date_taken, filename';
COMMENT ON COLUMN galleries.whatsapp_template IS 'Custom WhatsApp share message template. {link} placeholder for gallery URL.';
