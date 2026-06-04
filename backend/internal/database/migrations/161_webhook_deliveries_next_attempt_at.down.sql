-- 161_webhook_deliveries_next_attempt_at.down.sql
ALTER TABLE webhook_deliveries DROP COLUMN IF EXISTS next_attempt_at;
