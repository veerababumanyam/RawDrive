-- 156_dsr_requests_claimed_at.down.sql
DROP INDEX IF EXISTS idx_dsr_requests_claim;
ALTER TABLE dsr_requests DROP COLUMN IF EXISTS claimed_at;
