-- Reverse M19 gallery cover & expiry columns
DROP INDEX IF EXISTS idx_galleries_expires_at;

ALTER TABLE galleries DROP COLUMN IF EXISTS whatsapp_template;
ALTER TABLE galleries DROP COLUMN IF EXISTS sort_preference;
ALTER TABLE galleries DROP COLUMN IF EXISTS download_enabled;
ALTER TABLE galleries DROP COLUMN IF EXISTS expires_at;
ALTER TABLE galleries DROP COLUMN IF EXISTS cover_config;
ALTER TABLE galleries DROP COLUMN IF EXISTS cover_template;
