-- 160_ai_jobs_claimed_at.down.sql
DROP INDEX IF EXISTS idx_ai_jobs_claim;
ALTER TABLE ai_jobs DROP COLUMN IF EXISTS claimed_at;
