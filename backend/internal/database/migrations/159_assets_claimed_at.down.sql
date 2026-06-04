-- 159_assets_claimed_at.down.sql
DROP INDEX IF EXISTS idx_assets_derivative_claim;
ALTER TABLE assets DROP COLUMN IF EXISTS claimed_at;
