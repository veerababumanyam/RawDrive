-- 158_download_jobs_claimed_at.up.sql
-- Atomic lease-based job claim for the download (bulk ZIP) worker.
--
-- The worker listed pending jobs with DownloadRepo.ListPendingJobs (a standalone
-- SELECT ... FOR UPDATE SKIP LOCKED whose row locks released the instant the
-- result set drained, no enclosing transaction) and then marked each job
-- 'processing' in a separate UpdateJobStatus call — so two workers could claim
-- the same job and build the same ZIP twice (duplicate storage writes). We add a
-- claim lease so DownloadRepo.ClaimPendingJobs flips pending → processing and
-- stamps claimed_at in a single atomic statement, and re-claims jobs stuck in
-- 'processing' past the lease (a crashed worker).
-- See backend/internal/worker/download_worker.go + repository/download_repo.go.

ALTER TABLE download_jobs
    ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

-- Partial index supporting the claim scan (pending + in-flight rows by age).
CREATE INDEX IF NOT EXISTS idx_download_jobs_claim
    ON download_jobs (created_at)
    WHERE status IN ('pending', 'processing');
