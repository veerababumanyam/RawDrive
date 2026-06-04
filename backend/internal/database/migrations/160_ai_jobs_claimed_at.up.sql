-- 160_ai_jobs_claimed_at.up.sql
-- Atomic lease-based job claim for the face detection worker (and future AI
-- workers that share the ai_jobs table).
--
-- The face worker listed ai_jobs (JobRepo.ListPending — a plain SELECT on
-- type=$1 AND status='pending') and then flipped the job to 'running' in a
-- separate UpdateProgress call, so two workers could run the face-detection ML
-- pipeline on the same job's assets twice (duplicate face rows, wasted compute).
-- We add a claim lease: JobRepo.ClaimPending flips pending → running and stamps
-- claimed_at in one atomic UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP
-- LOCKED) statement, and re-claims jobs stuck in 'running' past the lease (a
-- crashed worker). See backend/internal/ai/face_worker.go + ai/job_repo.go.

ALTER TABLE ai_jobs
    ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

-- Partial index supporting the per-type claim scan.
CREATE INDEX IF NOT EXISTS idx_ai_jobs_claim
    ON ai_jobs (type, created_at)
    WHERE status IN ('pending', 'running');
