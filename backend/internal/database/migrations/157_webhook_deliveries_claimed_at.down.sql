-- 157_webhook_deliveries_claimed_at.down.sql
DROP INDEX IF EXISTS idx_webhook_deliveries_claim;
ALTER TABLE webhook_deliveries DROP COLUMN IF EXISTS claimed_at;
