-- 156_dsr_requests_claimed_at.up.sql
-- Atomic lease-based job claim for the DSR purge worker.
--
-- processBatch() previously ran a standalone SELECT ... FOR UPDATE SKIP LOCKED
-- whose row locks released the instant the result set was drained (no enclosing
-- transaction), then marked rows 'processing' in a separate statement — so two
-- workers could double-claim the same DSR row (double erasure of a subject's
-- data). The 'access' branch never marked the row terminal at all, re-running
-- the export every poll. We add a claim lease so the worker claims pending rows
-- (and re-claims crashed 'processing' rows whose lease went stale) in one atomic
-- UPDATE. Parked 'rectify' rows awaiting admin review are excluded from
-- stale-reclaim in code so the lease never re-loops them.
-- See backend/internal/worker/dsr_purge_worker.go.

ALTER TABLE dsr_requests
    ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

-- Partial index supporting the claim scan (pending + in-flight rows by age).
CREATE INDEX IF NOT EXISTS idx_dsr_requests_claim
    ON dsr_requests (requested_at)
    WHERE status IN ('pending', 'processing');
