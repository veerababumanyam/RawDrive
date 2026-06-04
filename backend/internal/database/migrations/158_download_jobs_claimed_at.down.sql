-- 158_download_jobs_claimed_at.down.sql
DROP INDEX IF EXISTS idx_download_jobs_claim;
ALTER TABLE download_jobs DROP COLUMN IF EXISTS claimed_at;
