-- Migration 143 (down): drop branded client email automation
DROP TABLE IF EXISTS gallery_email_events;

ALTER TABLE galleries
  DROP COLUMN IF EXISTS email_automation_enabled;
