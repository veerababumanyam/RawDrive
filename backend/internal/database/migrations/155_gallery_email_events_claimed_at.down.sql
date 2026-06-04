-- 155_gallery_email_events_claimed_at.down.sql
DROP INDEX IF EXISTS idx_gallery_email_events_claim;
ALTER TABLE gallery_email_events DROP COLUMN IF EXISTS claimed_at;
